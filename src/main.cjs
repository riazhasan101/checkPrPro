'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const {createStore}=require('./core/store.cjs');
const {prepareBatch,sanitizeOverrides}=require('./core/cheque.cjs');
const {words}=require('./core/words.cjs');
let store;
function createWindow(){
  const win=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:700,title:'CheckPrint',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.removeMenu();
  win.loadFile(path.join(__dirname,'../index.html'));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
}
app.whenReady().then(()=>{
  store=createStore(path.join(app.getPath('userData'),'checkprint'));
  ipcMain.handle('settings:get',()=>store.getSettings());
  ipcMain.handle('settings:save',(_event,data)=>store.saveSettings(data));
  ipcMain.handle('audit:list',()=>store.getAudit());
  ipcMain.handle('audit:add',(_event,event)=>store.appendAudit(event));
  ipcMain.handle('batch:validate',(_event,records,bank,template)=>prepareBatch(records,bank,template));
  ipcMain.handle('words',(_event,value)=>words(value));
  ipcMain.handle('templates:get',()=>store.getSettings().templateOverrides||{});
  ipcMain.handle('templates:save',(_event,overrides)=>{
    const clean=sanitizeOverrides(overrides);
    const current=store.getSettings();
    store.saveSettings({...current,templateOverrides:clean});
    store.appendAudit({type:'template-save',banks:Object.keys(clean)});
    return clean;
  });
  ipcMain.handle('prints:list',()=>store.getPrints());
  ipcMain.handle('prints:commit',(_event,records,extra)=>store.commitPrints(records,extra||{}));
  ipcMain.handle('print:dialog',event=>new Promise(resolve=>{
    const win=BrowserWindow.fromWebContents(event.sender);
    if(!win){resolve({success:false,reason:'No window'});return;}
    win.webContents.print({silent:false,printBackground:false},(success,failureReason)=>resolve({success:!!success,reason:failureReason||''}));
  }));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
