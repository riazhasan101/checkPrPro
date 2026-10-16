'use strict';
const fs=require('node:fs'),path=require('node:path');
const {planCommit}=require('./printlog.cjs');
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);}
function readJSONL(file){if(!fs.existsSync(file))return [];return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));}
function createStore(dir){
  const settings=path.join(dir,'settings.json'),audit=path.join(dir,'audit.jsonl'),prints=path.join(dir,'prints.jsonl');
  return {
    getSettings:()=>readJSON(settings,{templates:[],printerProfiles:[],templateOverrides:{}}),
    saveSettings:(value)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid settings');writeJSON(settings,value);return true;},
    appendAudit:(event)=>{if(!event||typeof event!=='object')throw new Error('Invalid audit');fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(audit,JSON.stringify({timestamp:new Date().toISOString(),...event})+'\n',{mode:0o600});return true;},
    getAudit:(limit=200)=>{if(!fs.existsSync(audit))return [];return readJSONL(audit).slice(-Math.min(Math.max(limit,1),1000));},
    getPrints:()=>readJSONL(prints),
    commitPrints:(records,extra)=>{
      const entries=planCommit(readJSONL(prints),records,extra);
      const stamped=entries.map(entry=>({timestamp:new Date().toISOString(),...entry}));
      fs.mkdirSync(dir,{recursive:true});
      fs.appendFileSync(prints,stamped.map(entry=>JSON.stringify(entry)).join('\n')+'\n',{mode:0o600});
      const reprinted=stamped.some(entry=>entry.reprint);
      fs.appendFileSync(audit,JSON.stringify({timestamp:new Date().toISOString(),type:reprinted?'reprint':'print',count:stamped.length,reason:reprinted?String((extra&&extra.reason)||'').trim().slice(0,200):''})+'\n',{mode:0o600});
      return stamped;
    }
  };
}
module.exports={createStore};
