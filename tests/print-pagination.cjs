'use strict';
const assert=require('node:assert/strict');
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'checkprint-pdf-test-')));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1440,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadFile(path.join(__dirname,'../index.html'));
 const run=js=>win.webContents.executeJavaScript(js);
 await run(`new Promise(resolve=>{const timer=setInterval(()=>{if(currentView==='dashboard'){clearInterval(timer);resolve(true)}},20)})`);
 const dir=path.join(__dirname,'../test-results/pdfs');fs.mkdirSync(dir,{recursive:true});
 for(const [name,count,setup,options] of [['single',1,false,{}],['batch',3,false,{}],['setup-open',1,true,{}],['alignment',1,false,{}],['a4-single',1,false,{preferCSSPageSize:false,pageSize:'A4'}],['a4-batch',3,false,{preferCSSPageSize:false,pageSize:'A4'}]]){
  await run(`setView('checkprint');${setup?"setSetup(true,'printerSection');":""}$('printRoot').innerHTML=printPagesHtml(Array.from({length:${count}},(_,i)=>({bank:'City Bank PLC',payee:'PDF Test Vendor '+(i+1),amount:1250,words:amountWords(1250,'City Bank PLC'),date:'2026-10-28',cheque:'TEST-'+i,issues:[]})));new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  if(name==='alignment')await run(`$('printRoot').innerHTML=testPageHtml()`);
  const pdf=await win.webContents.printToPDF({preferCSSPageSize:true,printBackground:false,margins:{top:0,bottom:0,left:0,right:0},...options});
  fs.writeFileSync(path.join(dir,(process.env.PDF_TEST_PREFIX||'verified')+'-'+name+'.pdf'),pdf);
  const pages=[...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;assert.equal(pages,count,name+' must have exactly one page per cheque');console.log('PASS PDF pagination',name,pages);
 }
 win.destroy();app.quit();
}).catch(e=>{console.error(e.stack);app.exit(1)});
