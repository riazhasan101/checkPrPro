'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('checkPrintAPI',Object.freeze({
  getBeneficiaries:()=>ipcRenderer.invoke('beneficiaries:get'),
  saveBeneficiaries:rows=>ipcRenderer.invoke('beneficiaries:save',rows),
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
  exportBackup:()=>ipcRenderer.invoke('backup:export'),
  restoreBackup:()=>ipcRenderer.invoke('backup:restore'),
  listPrinters:()=>ipcRenderer.invoke('printers:list'),
  printDialog:()=>ipcRenderer.invoke('print:dialog'),
  getProfile:()=>ipcRenderer.invoke('profile:me'),
  updateProfile:data=>ipcRenderer.invoke('profile:update',data),
  licenseInfo:()=>ipcRenderer.invoke('license:info'),
  manageLicense:()=>ipcRenderer.invoke('license:manage'),
  signOut:()=>ipcRenderer.invoke('license:signout')
}));
