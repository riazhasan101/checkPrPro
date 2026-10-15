'use strict';
const fs=require('node:fs'),path=require('node:path');
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);}
function createStore(dir){const settings=path.join(dir,'settings.json'),audit=path.join(dir,'audit.jsonl');return {
  getSettings:()=>readJSON(settings,{templates:[],printerProfiles:[]}),
  saveSettings:(value)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid settings');writeJSON(settings,value);return true;},
  appendAudit:(event)=>{if(!event||typeof event!=='object')throw new Error('Invalid audit');fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(audit,JSON.stringify({timestamp:new Date().toISOString(),...event})+'\n',{mode:0o600});return true;},
  getAudit:(limit=200)=>{if(!fs.existsSync(audit))return [];return fs.readFileSync(audit,'utf8').split('\n').filter(Boolean).slice(-Math.min(Math.max(limit,1),1000)).map(line=>JSON.parse(line));}
};}
module.exports={createStore};
