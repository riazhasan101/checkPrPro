'use strict';
const {app,BrowserWindow}=require('electron');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');const assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'checkprint-ui-test-')));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1440,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 const errors=[];win.webContents.on('render-process-gone',(_e,d)=>errors.push(d.reason));
 await win.loadFile(path.join(__dirname,'../index.html'));await win.webContents.insertCSS('*{transition:none!important}');
 const run=js=>win.webContents.executeJavaScript(js);
 await run(`new Promise(resolve=>{const timer=setInterval(()=>{if(currentView==='dashboard'){clearInterval(timer);resolve(true)}},20)})`);
 await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('DOM.enable');await win.webContents.debugger.sendCommand('CSS.enable');
 const doc=await win.webContents.debugger.sendCommand('DOM.getDocument');const {nodeId}=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.side-nav'});
 const shots=path.join(__dirname,'../test-results');fs.mkdirSync(shots,{recursive:true});
 let checks=0;
 for(const width of [1440,1200,1024,800,480]){
  win.setContentSize(width,640);
  for(const expanded of [false,true]){
   await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:expanded?['hover']:[]});
   await run(`setView('checkprint');document.activeElement.blur();$('avatarBtn').click();$('printerSetupBtn').click();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
   const m=await run(`(()=>{const rect=id=>{const r=$(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}};return {width:innerWidth,nav:document.querySelector('.side-nav').getBoundingClientRect().right,drawer:rect('setupDrawer'),section:rect('printerSection'),body:rect('setupBody'),frame:document.querySelector('.app-frame').getBoundingClientRect().right,hidden:getComputedStyle(document.querySelector('.app-frame')).display==='none',menuHidden:$('accountMenu').hidden,root:$('setupDrawer').parentElement===document.body}})()`);
   assert(m.root,'Setup must be outside contained app frame');assert(m.menuHidden,'Account menu must close');assert(m.drawer.left>=m.nav-1,'Setup overlaps navigation');assert(m.drawer.right<=m.width+1,'Drawer outside viewport');assert(m.section.top>=m.body.top-1,'Printer section under header');if(!m.hidden)assert(m.frame<=m.drawer.left+1,'Content overlaps setup');
   assert(await run(`document.documentElement.scrollWidth<=innerWidth+1`),'Horizontal page overflow');
   if(expanded&&(width===1440||width===480))fs.writeFileSync(path.join(shots,'setup-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
   await run(`setSetup(false);$('avatarBtn').click();$('editProfileBtn').click()`);
   const modal=await run(`(()=>{const d=$('profileDialog'),r=d.querySelector('.modal-card').getBoundingClientRect();return {root:d.parentElement===document.body,top:r.top,bottom:r.bottom,right:r.right,cover:document.elementFromPoint(5,5)===d}})()`);
   if(expanded&&width===1440)fs.writeFileSync(path.join(shots,'profile-1440.png'),(await win.webContents.capturePage()).toPNG());
   assert(modal.root&&modal.cover,'Modal must cover sidebar/header');assert(await run(`document.querySelector('.side-nav').inert&&document.querySelector('.app-frame').inert`),'Background must be inert during dialogs');assert(modal.top>=0&&modal.bottom<=640&&modal.right<=width,'Profile outside viewport');
   await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));$('avatarBtn').click();$('historyBtn').click()`);
   assert(await run(`$('accountMenu').hidden&&!$('historyDialog').hidden`),'History must close menu');
   const history=await run(`(()=>{const d=$('historyDialog'),r=d.querySelector('.modal-card').getBoundingClientRect();return {cover:document.elementFromPoint(5,5)===d,top:r.top,bottom:r.bottom}})()`);assert(history.cover&&history.top>=0&&history.bottom<=640,'History overlaps navigation or viewport');
   await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));$('reprintDialog').hidden=false`);assert(await run(`document.elementFromPoint(5,5)===$('reprintDialog')`),'Reprint must cover navigation');
   await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));setSetup(true,'printerSection');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
   assert(await run(`$('setupDrawer').hidden`),'Escape must close setup');
   checks++;console.log('PASS layout',width,expanded?'expanded':'collapsed');
  }
 }
 assert.deepEqual(errors,[]);console.log('UI layout checks passed:',checks);win.destroy();app.quit();
}).catch(e=>{console.error(e.stack);app.exit(1)});
