'use strict';
const {app,BrowserWindow,ipcMain,safeStorage}=require('electron');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createStore}=require('./core/store.cjs');
const {prepareBatch,sanitizeOverrides}=require('./core/cheque.cjs');
const {words}=require('./core/words.cjs');
const {LicenseManager}=require('./license/manager.cjs');
const {fingerprint}=require('./license/fingerprint.cjs');
const {serverUrl}=require('./license/config.cjs');
const PUB=require('./license/pubkey.cjs');

const APP_FILE=path.join(__dirname,'../index.html');
const LIC_FILE=path.join(__dirname,'../license.html');
const APP_URL=pathToFileURL(APP_FILE).href,LIC_URL=pathToFileURL(LIC_FILE).href;
let store,license,appWin=null,licWin=null;

const gotLock=app.requestSingleInstanceLock();
if(!gotLock)app.quit();
app.on('second-instance',()=>{const w=licWin||appWin;if(w){if(w.isMinimized())w.restore();w.focus()}});

/* No window may navigate away, open new windows, or embed web content. */
app.on('web-contents-created',(_e,wc)=>{
  wc.on('will-navigate',e=>e.preventDefault());
  wc.on('will-attach-webview',e=>e.preventDefault());
  wc.setWindowOpenHandler(()=>({action:'deny'}));
  if(app.isPackaged){
    wc.on('devtools-opened',()=>wc.closeDevTools());
    wc.on('before-input-event',(e,i)=>{const k=String(i.key||'').toLowerCase();if(k==='f12'||((i.control||i.meta)&&i.shift&&(k==='i'||k==='j'||k==='c'))||((i.control||i.meta)&&k==='u'))e.preventDefault()});
  }
});

const prefs=preload=>({preload:path.join(__dirname,preload),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,devTools:!app.isPackaged,spellcheck:false});

function createAppWindow(){
  appWin=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:700,title:'CheckPrint',webPreferences:prefs('preload.cjs')});
  appWin.removeMenu();appWin.loadFile(APP_FILE);
  appWin.on('closed',()=>{appWin=null});
}
function createLicenseWindow(manage){
  licWin=new BrowserWindow({width:560,height:760,minWidth:480,minHeight:640,title:'CheckPrint licence',webPreferences:prefs('preload-license.cjs'),parent:manage&&appWin?appWin:undefined,modal:!!(manage&&appWin)});
  licWin.manage=!!manage;licWin.removeMenu();licWin.loadFile(LIC_FILE);
  licWin.on('closed',()=>{licWin=null;if(!appWin&&!license.isValid())app.quit()});
}
function showLicense(){
  if(appWin){appWin.destroy();appWin=null}
  if(licWin){licWin.focus();return}
  createLicenseWindow(false);
}
function showApp(){
  if(licWin&&!licWin.manage){licWin.destroy();licWin=null}
  if(!appWin)createAppWindow();
}
function onLicensed(){if(licWin&&licWin.manage){licWin.close();return}showApp()}
function enforce(){if(appWin&&!license.isValid())showLicense()}

const fromLic=e=>e.senderFrame&&e.senderFrame.url===LIC_URL;
const fromApp=e=>e.senderFrame&&e.senderFrame.url===APP_URL;
/* Every data/print channel needs a trusted page AND a currently valid licence. */
const secure=(channel,fn)=>ipcMain.handle(channel,(e,...a)=>{
  if(!fromApp(e))throw new Error('Untrusted sender');
  if(!license.isValid()){enforce();throw new Error('Licence required')}
  return fn(e,...a);
});
const lic=(channel,fn)=>ipcMain.handle(channel,async(e,...a)=>{
  if(!fromLic(e))throw new Error('Untrusted sender');
  try{return await fn(...a)}catch(err){return {ok:false,code:err.code||'ERROR',message:err.message}}
});

app.whenReady().then(async()=>{
  if(!gotLock)return;
  store=createStore(path.join(app.getPath('userData'),'checkprint'));
  license=new LicenseManager({
    dir:path.join(app.getPath('userData'),'checkprint'),safeStorage,serverUrl:serverUrl(app.isPackaged),publicKey:PUB.PEM,fingerprint:fingerprint(),
    deviceName:os.hostname(),platform:process.platform,allowHttp:!app.isPackaged
  });

  secure('settings:get',()=>store.getSettings());
  secure('settings:save',(_e,data)=>store.saveSettings(data));
  secure('audit:list',()=>store.getAudit());
  secure('audit:add',(_e,event)=>store.appendAudit(event));
  secure('batch:validate',(_e,records,bank,template)=>prepareBatch(records,bank,template));
  secure('words',(_e,value)=>words(value));
  secure('templates:get',()=>store.getSettings().templateOverrides||{});
  secure('templates:save',(_e,overrides)=>{
    const clean=sanitizeOverrides(overrides);
    const current=store.getSettings();
    store.saveSettings({...current,templateOverrides:clean});
    store.appendAudit({type:'template-save',banks:Object.keys(clean)});
    return clean;
  });
  secure('prints:list',()=>store.getPrints());
  secure('prints:commit',(_e,records,extra)=>store.commitPrints(records,extra||{}));
  secure('print:dialog',event=>new Promise(resolve=>{
    const win=BrowserWindow.fromWebContents(event.sender);
    if(!win){resolve({success:false,reason:'No window'});return;}
    win.webContents.print({silent:false,printBackground:false},(success,failureReason)=>resolve({success:!!success,reason:failureReason||''}));
  }));

  /* licence channels */
  ipcMain.handle('license:info',e=>{if(!fromApp(e)&&!fromLic(e))throw new Error('Untrusted sender');return license.info()});
  ipcMain.handle('license:manage',e=>{if(!fromApp(e))throw new Error('Untrusted sender');if(!licWin)createLicenseWindow(true);else licWin.focus();return true});
  ipcMain.handle('license:signout',e=>{if(!fromApp(e)&&!fromLic(e))throw new Error('Untrusted sender');license.signOut();showLicense();return true});
  lic('license:status',()=>({...license.info(),manage:!!(licWin&&licWin.manage)}));
  lic('license:config',()=>license.config());
  lic('license:register',d=>license.register({email:String(d&&d.email||''),password:String(d&&d.password||''),name:String(d&&d.name||''),phone:String(d&&d.phone||''),company:String(d&&d.company||'')}));
  lic('license:requestSubscription',d=>license.requestSubscription({plan:String(d&&d.plan||''),period:String(d&&d.period||''),note:String(d&&d.note||'')}));
  lic('license:close',()=>{if(licWin&&licWin.manage)setImmediate(()=>{if(licWin)licWin.close()});return {ok:true}});
  lic('license:activate',async d=>{const r=await license.activate(String(d&&d.email||'').trim().toLowerCase(),String(d&&d.password||''));if(r.ok)setImmediate(onLicensed);return r});
  lic('license:refresh',async()=>{const r=await license.refresh();if(r.ok)setImmediate(onLicensed);return r});
  lic('license:me',()=>license.me());
  lic('license:submitPayment',d=>license.submitPayment({plan:String(d&&d.plan||''),period:String(d&&d.period||''),method:String(d&&d.method||''),trxId:String(d&&d.trxId||''),payerNumber:String(d&&d.payerNumber||'')}));
  lic('license:removeDevice',id=>license.removeDevice(String(id||'')));
  lic('license:quit',()=>{setImmediate(()=>app.quit());return {ok:true}});

  /* Start: a still-valid licence opens the app at once; otherwise try to renew first, then ask the person to sign in. */
  if(license.isValid()){showApp();license.refresh().then(enforce)}
  else{
    if(license.info().signedIn)await license.refresh();
    if(license.isValid())showApp();else showLicense();
  }
  setInterval(()=>enforce(),60*1000).unref();
  setInterval(()=>{if(license.info().signedIn)license.refresh().then(enforce)},15*60*1000).unref();
  app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length){license.isValid()?showApp():showLicense()}});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
