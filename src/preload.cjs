'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('checkPrintAPI',Object.freeze({
  getSettings:()=>ipcRenderer.invoke('settings:get'),
  saveSettings:data=>ipcRenderer.invoke('settings:save',data),
  getAudit:()=>ipcRenderer.invoke('audit:list'),
  addAudit:event=>ipcRenderer.invoke('audit:add',event),
  validateBatch:(records,bank,template)=>ipcRenderer.invoke('batch:validate',records,bank,template),
  amountWords:amount=>ipcRenderer.invoke('words',amount)
}));
