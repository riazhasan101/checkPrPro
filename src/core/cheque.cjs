'use strict';
const {validatePayment}=require('./validation.cjs');
const stock={widthMm:190.5,heightMm:88.9};
function leaf(id,name,date,payee,words,words2,amount,fonts){
  const f={date:12,payee:12,words:11,amount:12,...fonts};
  return {id,name,bank:name,...stock,fields:{
    date:{x:date[0],y:date[1],pitch:date[2],font:f.date},
    payee:{x:payee[0],y:payee[1],w:payee[2],font:f.payee},
    words:{x:words[0],y:words[1],w:words[2],font:f.words},
    words2:{x:words2[0],y:words2[1],w:words2[2],font:f.words},
    amount:{x:amount[0],y:amount[1],w:amount[2],font:f.amount}
  }};
}
const bankTemplates=[
  // City Bank: measured from a real cheque scan (see index.html TEMPLATES; a test keeps the two in step).
  leaf('city-bank','City Bank PLC',[132.4,16.4,6.46],[18.9,30.3,140],[32,39.2,82],[6.7,48.3,118],[137.2,43.2,45],{date:11,payee:12.5,words:11.5,amount:10.2}),
  // Not measured on a real cheque: estimates (see index.html TEMPLATES). Calibrate before live use.
  leaf('dbbl','Dutch-Bangla Bank',[132.4,16.8,6.47],[18,30.45,140],[30.5,39,95],[7.1,48.2,117],[137.7,43.3,45],{date:11,payee:12,words:11.5,amount:10.2}),
  leaf('ucb','United Commercial Bank',[132.5,16.6,6.33],[12.2,30.4,140],[24.9,39.2,95],[5,48.2,117],[137.7,42.8,45],{date:11,payee:12,words:11.5,amount:10.2}),
  leaf('brac','BRAC Bank',[133.1,19,6.26],[21.2,30.4,140],[38.5,39,86],[10.4,48,114],[137.7,43.3,45],{date:11,payee:12,words:11.5,amount:10.2}),
  leaf('ebl','Eastern Bank',[132.4,16.8,6.47],[18,30.45,140],[30.5,39,95],[7.1,48.2,117],[137.7,43.3,45],{date:11,payee:12,words:11.5,amount:10.2}),
  leaf('ibbl','Islami Bank',[132.7,17,6.47],[17,30.65,140],[33.7,39.85,95],[6.1,48.45,117],[138.2,43.1,45],{date:11,payee:12,words:11.6,amount:11.4}),
  // IFIC: measured from a real cheque scan.
  leaf('ific','IFIC Bank',[132.4,17.2,6.48],[17,30.6,140],[29.1,38.9,95],[7.5,48.1,117],[138.2,43.4,45],{date:11,payee:11.2,words:11.5,amount:10.2})
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
