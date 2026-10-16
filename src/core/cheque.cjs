'use strict';
const {validatePayment}=require('./validation.cjs');
const stock={widthMm:190.5,heightMm:88.9};
function leaf(id,name,date,payee,words,words2,amount){
  return {id,name,bank:name,...stock,fields:{
    date:{x:date[0],y:date[1],pitch:date[2],font:12},
    payee:{x:payee[0],y:payee[1],w:payee[2],font:12},
    words:{x:words[0],y:words[1],w:words[2],font:11},
    words2:{x:words2[0],y:words2[1],w:words2[2],font:11},
    amount:{x:amount[0],y:amount[1],w:amount[2],font:12}
  }};
}
const bankTemplates=[
  leaf('city-bank','City Bank PLC',[133,17.5,6],[20,29.5,118],[32,41.5,82],[12,50.5,108],[128,41.5,55]),
  leaf('dbbl','Dutch-Bangla Bank',[118,21,6.2],[22,33,120],[32,41,88],[14,50,110],[128,41,52]),
  leaf('ucb','United Commercial Bank',[122,18.5,6.2],[22,33,115],[34,42,96],[14,51,110],[140,42,45]),
  leaf('brac','BRAC Bank',[130,17,6.2],[26,32,120],[32,39,96],[14,49,110],[138,39,48]),
  leaf('ebl','Eastern Bank',[128,17,6],[20,31,125],[34,39,88],[12,48,120],[130,39,52]),
  leaf('ibbl','Islami Bank',[128,16,5.8],[22,32,140],[36,41,86],[12,50,145],[136,41,50]),
  leaf('ific','IFIC Bank',[130,16,6],[20,32,140],[36,41,88],[10,50,145],[136,41,50])
];
const matchers=[
  [/city\s*bank/i,'city-bank'],
  [/dutch[-\s]?bangla|\bdbbl\b/i,'dbbl'],
  [/united commercial|\bucb\b/i,'ucb'],
  [/brac\s*bank/i,'brac'],
  [/eastern\s*bank|\bebl\b/i,'ebl'],
  [/islami\s*bank/i,'ibbl'],
  [/\bific\b/i,'ific']
];
const cityBankTemplate=bankTemplates[0];
const defaultTemplate=cityBankTemplate;
function templateForBank(bank){const hit=matchers.find(([re])=>re.test(String(bank||'')));return hit?bankTemplates.find(t=>t.id===hit[1]):null;}
function validateTemplate(t){if(!t||typeof t!=='object')throw new Error('Missing template');if(!Number.isFinite(Number(t.widthMm))||t.widthMm<80||t.widthMm>300||!Number.isFinite(Number(t.heightMm))||t.heightMm<40||t.heightMm>180)throw new Error('Invalid cheque dimensions');for(const k of ['date','payee','amount','words','words2']){const f=t.fields?.[k];if(!f||!Number.isFinite(Number(f.x))||!Number.isFinite(Number(f.y))||!Number.isFinite(Number(f.font)))throw new Error('Invalid template field: '+k);}return true;}
function clampNum(n,min,max){const rounded=Math.round(Number(n)*10)/10;return Math.min(max,Math.max(min,rounded));}
function sanitizeOverrides(overrides){if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw new Error('Invalid layout overrides');const out={};for(const [id,patch] of Object.entries(overrides)){const base=bankTemplates.find(t=>t.id===id);if(!base)throw new Error('Unknown template: '+id);const srcFields=patch&&patch.fields;if(!srcFields||typeof srcFields!=='object'||Array.isArray(srcFields))continue;const fields={};for(const key of ['date','payee','words','words2','amount']){const src=srcFields[key];if(!src||typeof src!=='object'||Array.isArray(src))continue;const props=key==='date'?['x','y','pitch','font']:['x','y','w','font'];const next={};for(const prop of props){if(src[prop]==null||src[prop]==='')continue;const n=Number(src[prop]);if(!Number.isFinite(n))throw new Error('Invalid layout number');if(prop==='x')next.x=clampNum(n,0,base.widthMm-2);else if(prop==='y')next.y=clampNum(n,0,base.heightMm-2);else if(prop==='pitch')next.pitch=clampNum(n,4,8);else if(prop==='w')next.w=clampNum(n,10,160);else next.font=clampNum(n,8,16);}if(Object.keys(next).length)fields[key]=next;}if(Object.keys(fields).length)out[id]={fields};}return out;}
function mergeTemplate(base,override){const copy={id:base.id,name:base.name,bank:base.bank,widthMm:base.widthMm,heightMm:base.heightMm,fields:{date:{...base.fields.date},payee:{...base.fields.payee},words:{...base.fields.words},words2:{...base.fields.words2},amount:{...base.fields.amount}}};const fields=override&&override.fields||{};for(const key of Object.keys(copy.fields))if(fields[key])copy.fields[key]={...copy.fields[key],...fields[key]};validateTemplate(copy);return copy;}
function prepareBatch(records,bank,template){validateTemplate(template);if(!bank||!records.length)throw new Error('Select bank and records');for(const r of records){if(r.bank!==bank)throw new Error('Mixed-bank batch is not allowed');const errors=validatePayment(r);if(errors.length)throw new Error('Invalid cheque: '+errors.join(', '));}return {bank,count:records.length,records,template};}
module.exports={defaultTemplate,cityBankTemplate,bankTemplates,templateForBank,validateTemplate,sanitizeOverrides,mergeTemplate,prepareBatch};
