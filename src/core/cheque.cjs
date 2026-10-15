'use strict';
const {validatePayment}=require('./validation.cjs');
const cityBankTemplate={id:'city-bank',name:'City Bank PLC',bank:'City Bank PLC',widthMm:190.5,heightMm:88.9,fields:{date:{x:133,y:17.5,font:12},payee:{x:20,y:29.5,font:12},amount:{x:128,y:41.5,font:12},words:{x:32,y:41.5,font:11},words2:{x:12,y:50.5,font:11}}};
const defaultTemplate=cityBankTemplate;
function validateTemplate(t){if(!t||typeof t!=='object')throw new Error('Missing template');if(!Number.isFinite(Number(t.widthMm))||t.widthMm<80||t.widthMm>300||!Number.isFinite(Number(t.heightMm))||t.heightMm<40||t.heightMm>180)throw new Error('Invalid cheque dimensions');for(const k of ['date','payee','amount','words']){const f=t.fields?.[k];if(!f||!Number.isFinite(Number(f.x))||!Number.isFinite(Number(f.y))||!Number.isFinite(Number(f.font)))throw new Error('Invalid template field: '+k);}return true;}
function prepareBatch(records,bank,template){validateTemplate(template);if(!bank||!records.length)throw new Error('Select bank and records');for(const r of records){if(r.bank!==bank)throw new Error('Mixed-bank batch is not allowed');const errors=validatePayment(r);if(errors.length)throw new Error('Invalid cheque: '+errors.join(', '));}return {bank,count:records.length,records,template};}
module.exports={defaultTemplate,cityBankTemplate,validateTemplate,prepareBatch};
