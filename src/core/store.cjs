'use strict';
const fs=require('node:fs'),path=require('node:path');
const {planCommit}=require('./printlog.cjs');
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);}
function readJSONL(file){if(!fs.existsSync(file))return [];return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));}
function cleanBeneficiaries(rows){
  if(!Array.isArray(rows)||rows.length>10000)throw new Error('Invalid beneficiaries');
  const ids=new Set();
  return rows.map(p=>{
    if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>120)throw new Error('Invalid beneficiary');
    ids.add(p.id);
    const out={id:p.id,name:p.name.trim()};
    for(const [key,max] of [['client',120],['phone',60],['notes',1000],['bank',120]]){if(p[key]!=null&&typeof p[key]!=='string')throw new Error('Invalid beneficiary');out[key]=String(p[key]||'').trim();if(out[key].length>max)throw new Error('Beneficiary field too long');}
    out.amount=Number(p.amount||0);if(!Number.isFinite(out.amount)||out.amount<0)throw new Error('Invalid default amount');
    return out;
  });
}
function createStore(dir){
  const settings=path.join(dir,'settings.json'),audit=path.join(dir,'audit.jsonl'),prints=path.join(dir,'prints.jsonl');
  const beneficiaries=path.join(dir,'beneficiaries.json');
  return {
    getBeneficiaries:()=>readJSON(beneficiaries,null),
    saveBeneficiaries:rows=>{const clean=cleanBeneficiaries(rows);writeJSON(beneficiaries,clean);return clean;},
    getSettings:()=>readJSON(settings,{templates:[],printerProfiles:[],templateOverrides:{}}),
    saveSettings:(value)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid settings');writeJSON(settings,value);return true;},
    appendAudit:(event)=>{if(!event||typeof event!=='object')throw new Error('Invalid audit');fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(audit,JSON.stringify({timestamp:new Date().toISOString(),...event})+'\n',{mode:0o600});return true;},
    getAudit:(limit=200)=>{if(!fs.existsSync(audit))return [];return readJSONL(audit).slice(-Math.min(Math.max(limit,1),1000));},
    getPrints:()=>readJSONL(prints),
    exportBackup:()=>({version:2,beneficiaries:readJSON(beneficiaries,[]),createdAt:new Date().toISOString(),settings:readJSON(settings,{templates:[],printerProfiles:[],templateOverrides:{}}),prints:readJSONL(prints),audit:readJSONL(audit)}),
    restoreBackup:data=>{
      if(!data||typeof data!=='object'||Array.isArray(data)||!data.settings||!Array.isArray(data.prints)||!Array.isArray(data.audit))throw new Error('Invalid backup file');
      const restoredBeneficiaries=cleanBeneficiaries(data.beneficiaries===undefined?[]:data.beneficiaries);
      writeJSON(beneficiaries,restoredBeneficiaries);
      writeJSON(settings,data.settings);
      fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(prints,data.prints.map(x=>JSON.stringify(x)).join(data.prints.length?'\n':'')+(data.prints.length?'\n':''),{mode:0o600});
      fs.writeFileSync(audit,data.audit.map(x=>JSON.stringify(x)).join(data.audit.length?'\n':'')+(data.audit.length?'\n':''),{mode:0o600});
      return true;
    },
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
