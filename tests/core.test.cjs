const {test}=require('node:test');const assert=require('node:assert/strict');
const {words}=require('../src/core/words.cjs');const {validatePayment,findDuplicates}=require('../src/core/validation.cjs');const {prepareBatch,defaultTemplate,cityBankTemplate,bankTemplates,templateForBank,validateTemplate,sanitizeOverrides,mergeTemplate}=require('../src/core/cheque.cjs');const {printKey,planCommit}=require('../src/core/printlog.cjs');const {createStore}=require('../src/core/store.cjs');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const good={bank:'Bank A',payee:'Vendor',amount:1250.50,date:'2026-10-20'};
test('amount words',()=>assert.equal(words(1250.50),'One Thousand Two Hundred Fifty Taka and Fifty Paisa Only'));
test('zero amount words',()=>assert.equal(words(0),'Zero Taka Only'));
test('reject invalid amount words',()=>assert.throws(()=>words(-1)));
test('valid payment',()=>assert.deepEqual(validatePayment(good),[]));
test('invalid calendar date',()=>assert.ok(validatePayment({...good,date:'2026-02-30'}).length));
test('invalid amount',()=>assert.ok(validatePayment({...good,amount:0}).length));
test('duplicate detection',()=>assert.equal(findDuplicates([good,{...good}]).length,1));
test('bank batch',()=>assert.equal(prepareBatch([good],'Bank A',defaultTemplate).count,1));
test('mixed bank blocked',()=>assert.throws(()=>prepareBatch([good,{...good,bank:'Bank B'}],'Bank A',defaultTemplate)));
test('city bank cheque stock',()=>{assert.equal(cityBankTemplate.widthMm,190.5);assert.equal(cityBankTemplate.heightMm,88.9);assert.equal(defaultTemplate,cityBankTemplate);validateTemplate(cityBankTemplate);for(const k of ['date','payee','amount','words']){const f=cityBankTemplate.fields[k];assert.ok(f.x>=0&&f.x<cityBankTemplate.widthMm&&f.y>=0&&f.y<cityBankTemplate.heightMm);}});
test('supplied bank leaves',()=>{assert.equal(bankTemplates.length,8);for(const t of bankTemplates){validateTemplate(t);assert.equal(t.widthMm,190.5);assert.equal(t.heightMm,88.9);}assert.equal(templateForBank('Dutch-Bangla Bank').id,'dbbl');assert.equal(templateForBank('UCB').id,'ucb');assert.equal(templateForBank('BRAC Bank').id,'brac');assert.equal(templateForBank('Eastern Bank Ltd.').id,'ebl');assert.equal(templateForBank('Islami Bank Bangladesh').id,'ibbl');assert.equal(templateForBank('IFIC Bank').id,'ific');assert.equal(templateForBank('City Bank PLC').id,'city-bank');assert.equal(templateForBank('AB Bank').id,'ab-bank');assert.equal(templateForBank('Unknown Bank'),null);});
test('settings and audit persist',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkprint-'));try{const store=createStore(dir);store.saveSettings({templates:[{id:'one'}]});assert.equal(store.getSettings().templates[0].id,'one');store.appendAudit({type:'print-request',count:1});assert.equal(store.getAudit().length,1);}finally{fs.rmSync(dir,{recursive:true,force:true})}});
test('layout overrides stay on the leaf',()=>{const clean=sanitizeOverrides({'city-bank':{fields:{payee:{x:22.04},date:{x:999,pitch:1}}}});assert.equal(clean['city-bank'].fields.payee.x,22);assert.equal(clean['city-bank'].fields.date.x,188.5);assert.equal(clean['city-bank'].fields.date.pitch,4);const merged=mergeTemplate(cityBankTemplate,clean['city-bank']);assert.equal(merged.fields.payee.x,22);assert.equal(merged.fields.payee.y,cityBankTemplate.fields.payee.y);assert.throws(()=>sanitizeOverrides({'no-such-bank':{fields:{payee:{x:10}}}}));});
test('printed cheque is blocked until a reprint reason is given',()=>{assert.equal(printKey(good),'bank a||vendor|1250.50|2026-10-20');const first=planCommit([],[good],{});assert.equal(first[0].reprint,false);assert.throws(()=>planCommit(first,[good],{}),/Already printed/);assert.throws(()=>planCommit(first,[good],{reprint:true,reason:'  '}),/reason/i);const again=planCommit(first,[good],{reprint:true,reason:'Printer jammed'});assert.equal(again[0].reprint,true);assert.equal(again[0].reason,'Printer jammed');assert.equal(planCommit([],[good,{...good,cheque:'2'}],{}).length,2);assert.throws(()=>planCommit([],[good,good],{}));});
test('print ledger blocks a second commit',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkprint-'));try{const store=createStore(dir);const stamped=store.commitPrints([good],{});assert.equal(stamped.length,1);assert.equal(store.getPrints().length,1);assert.throws(()=>store.commitPrints([good],{}));const again=store.commitPrints([good],{reprint:true,reason:'jam'});assert.equal(again[0].reprint,true);assert.equal(store.getPrints().length,2);assert.ok(store.getAudit().some(event=>event.type==='print'));assert.ok(store.getAudit().some(event=>event.type==='reprint'));}finally{fs.rmSync(dir,{recursive:true,force:true})}});
const {chequeWords}=require('../src/core/words.cjs');
test('cheque words use Crore / Lakh and read like the printed City Bank sample',()=>{
  assert.equal(chequeWords(12345678),'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred And Seventy Eight Only');
  assert.equal(chequeWords(42500),'Forty Two Thousand Five Hundred Only');
  assert.equal(chequeWords(96300),'Ninety Six Thousand Three Hundred Only');
  assert.equal(chequeWords(42010),'Forty Two Thousand And Ten Only');
  assert.equal(chequeWords(123456.78),'One Lakh Twenty Three Thousand Four Hundred And Fifty Six Taka And Seventy Eight Paisa Only');
  assert.equal(chequeWords(0.5),'Fifty Paisa Only');
  assert.equal(chequeWords(12345678,{lac:true}),'One Crore Twenty Three Lac Forty Five Thousand Six Hundred And Seventy Eight Only');
});
test('index.html layouts match src/core/cheque.cjs (one set of measurements)',()=>{
  const vm=require('node:vm');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const block=html.match(/const TEMPLATES=\[([\s\S]*?)\n\];/);
  assert.ok(block,'TEMPLATES block not found in index.html');
  const ui=vm.runInNewContext('['+block[1]+']');
  assert.equal(ui.length,bankTemplates.length);
  for(const u of ui){
    const c=bankTemplates.find(t=>t.id===u.id);assert.ok(c,'missing core template '+u.id);
    const f=Object.assign({date:12,payee:12,words:11,amount:12},u.fonts);
    assert.deepEqual([c.fields.date.x,c.fields.date.y,c.fields.date.pitch],Array.from(u.date),u.id+' date');
    for(const k of ['payee','words','words2','amount'])assert.deepEqual([c.fields[k].x,c.fields[k].y,c.fields[k].w],Array.from(u[k]),u.id+' '+k);
    assert.deepEqual([c.fields.date.font,c.fields.payee.font,c.fields.words.font,c.fields.words2.font,c.fields.amount.font],[f.date,f.payee,f.words,f.words,f.amount],u.id+' fonts');
  }
});
