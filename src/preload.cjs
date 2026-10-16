'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('checkPrintAPI',Object.freeze({
  getSettings:()=>ipcRenderer.invoke('settings:get'),
  saveSettings:data=>ipcRenderer.invoke('settings:save',data),
  getAudit:()=>ipcRenderer.invoke('audit:list'),
  addAudit:event=>ipcRenderer.invoke('audit:add',event),
  validateBatch:(records,bank,template)=>ipcRenderer.invoke('batch:validate',records,bank,template),
  amountWords:amount=>ipcRenderer.invoke('words',amount),
  getTemplates:()=>ipcRenderer.invoke('templates:get'),
  saveTemplates:overrides=>ipcRenderer.invoke('templates:save',overrides),
  getPrints:()=>ipcRenderer.invoke('prints:list'),
  commitPrints:(records,extra)=>ipcRenderer.invoke('prints:commit',records,extra),
  printDialog:()=>ipcRenderer.invoke('print:dialog')
}));
