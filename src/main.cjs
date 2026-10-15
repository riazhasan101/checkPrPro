'use strict';
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path');
const {createStore}=require('./core/store.cjs');
const {prepareBatch}=require('./core/cheque.cjs');
const {words}=require('./core/words.cjs');
let store;
function window(){const win=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:700,title:'CheckPrint',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});win.removeMenu();win.loadFile(path.join(__dirname,'../index.html'));win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());}
app.whenReady().then(()=>{store=createStore(path.join(app.getPath('userData'),'checkprint'));ipcMain.handle('settings:get',()=>store.getSettings());ipcMain.handle('settings:save',(_e,data)=>store.saveSettings(data));ipcMain.handle('audit:list',()=>store.getAudit());ipcMain.handle('audit:add',(_e,event)=>store.appendAudit(event));ipcMain.handle('batch:validate',(_e,records,bank,template)=>prepareBatch(records,bank,template));ipcMain.handle('words',(_e,value)=>words(value));window();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)window();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
