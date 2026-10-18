'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const call=ch=>(...a)=>ipcRenderer.invoke(ch,...a);
contextBridge.exposeInMainWorld('licenseAPI',Object.freeze({
  status:call('license:status'),config:call('license:config'),register:call('license:register'),activate:call('license:activate'),
  refresh:call('license:refresh'),me:call('license:me'),submitPayment:call('license:submitPayment'),removeDevice:call('license:removeDevice'),
  signOut:call('license:signout'),quit:call('license:quit')
}));
