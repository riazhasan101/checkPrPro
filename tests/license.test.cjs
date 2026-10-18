'use strict';
/* Pure decision tests always run. End-to-end tests need PostgreSQL:  TEST_DATABASE_URL=postgres://... npm test  (skipped otherwise). */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {evaluate}=require('../src/license/evaluate.cjs');
const {LicenseManager}=require('../src/license/manager.cjs');
const DAY=86400000;
const fpOf=raw=>crypto.createHash('sha256').update(raw).digest('hex').slice(0,24);

test('evaluate: valid, expired, offline-too-long, wrong device, clock rollback',()=>{
  const now=1_800_000_000_000,fp=fpOf('dev');
  const p={v:1,fp,iat:now,next:now+7*DAY,exp:now+30*DAY,plan:'pro',maxDevices:3};
  assert.equal(evaluate({payload:p,fp,now:now+DAY,lastSeen:now}).ok,true);
  assert.equal(evaluate({payload:p,fp,now:now+DAY}).daysLeft,29);
  assert.equal(evaluate({payload:p,fp,now:now+7*DAY}).code,'OFFLINE_EXPIRED');
  assert.equal(evaluate({payload:{...p,next:p.exp},fp,now:p.exp}).code,'EXPIRED');
  assert.equal(evaluate({payload:p,fp:fpOf('other'),now}).code,'WRONG_DEVICE');
  assert.equal(evaluate({payload:p,fp,now:now+DAY,lastSeen:now+10*DAY}).code,'CLOCK','clock moved back after being seen later');
  assert.equal(evaluate({payload:p,fp,now:now-DAY}).code,'CLOCK','clock before issue time');
  assert.equal(evaluate({payload:null,fp,now}).code,'NO_LICENCE');
  assert.equal(evaluate({payload:{...p,v:2},fp,now}).code,'NO_LICENCE');
});

const URL_=process.env.TEST_DATABASE_URL;
let skip=!URL_&&'TEST_DATABASE_URL not set';
let srv,pool,base,PUB,PRIV,hash,dirs=[];
before(async()=>{
  if(skip)return;
  try{
    const {createPool,migrate}=require('../server/src/db.cjs');({createApp:srv}=require('../server/src/app.cjs'));({hashPassword:hash}=require('../server/src/crypto.cjs'));
    const kp=crypto.generateKeyPairSync('ed25519');PUB=kp.publicKey.export({type:'spki',format:'pem'});PRIV=kp.privateKey.export({type:'pkcs8',format:'pem'});
    pool=createPool(URL_);await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');await migrate(pool);await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES('boss@x.com',$1,'Boss','admin')",[await hash('boss-password-123')]);
    const app=srv({pool,privateKey:PRIV,env:{}});await new Promise(r=>app.listen(0,'127.0.0.1',r));srv=app;base='http://127.0.0.1:'+app.address().port;
  }catch(e){skip='server dependencies missing: '+e.message}
});
after(async()=>{if(srv&&srv.close)srv.close();if(pool)await pool.end();dirs.forEach(d=>fs.rmSync(d,{recursive:true,force:true}))});
const mk=(fp,over={})=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cplic-'));dirs.push(dir);return new LicenseManager({dir,safeStorage:null,serverUrl:base,publicKey:PUB,fingerprint:fp,deviceName:'T',platform:'test',allowHttp:true,...over})};
const grant=async(email,days=30,plan='basic')=>{const u=(await pool.query('SELECT id FROM users WHERE email=$1',[email])).rows[0];await pool.query("INSERT INTO subscriptions(user_id,plan_id,period_end) VALUES($1,$2,now()+make_interval(days=>$3)) ON CONFLICT(user_id) DO UPDATE SET plan_id=$2,period_end=now()+make_interval(days=>$3)",[u.id,plan,days])};
const PW='long enough password';
const fpA=crypto.createHash('sha256').update('machine-A').digest('hex'),fpB=crypto.createHash('sha256').update('machine-B').digest('hex');

test('end to end: sign up, pay, activate, run offline within grace, lose access after grace',{skip},async()=>{
  const m=mk(fpA);
  assert.equal((await m.register({email:'c@x.com',password:PW,name:'C'})).ok,true);
  const a=await m.activate('c@x.com',PW);assert.equal(a.ok,false);assert.equal(a.code,'NO_SUBSCRIPTION');assert.equal(m.isValid(),false);
  await grant('c@x.com');
  const r=await m.refresh();assert.equal(r.ok,true);assert.equal(m.isValid(),true);assert.equal(m.info().plan,'basic');
  let t=Date.now();
  const offline=mk(fpA,{dir:m.dir,now:()=>t,fetchImpl:async()=>{throw new Error('down')}});
  t=Date.now()+2*DAY;assert.equal(offline.isValid(),true,'2 days offline still fine');
  const rr=await offline.refresh();assert.equal(rr.offline,true);assert.equal(offline.isValid(),true,'network failure keeps the licence');
  t=Date.now()+7*DAY+60000;assert.equal(offline.isValid(),false);assert.equal(offline.check().code,'OFFLINE_EXPIRED');
  t=Date.now()+DAY;const back=mk(fpA,{dir:m.dir,now:()=>t});back.state.lastSeen=Date.now()+5*DAY;assert.equal(back.check().code,'CLOCK');
});
test('server refusal removes the licence immediately',{skip},async()=>{
  const m=mk(fpA);await m.activate('c@x.com',PW);assert.equal(m.isValid(),true);
  await pool.query("UPDATE subscriptions SET period_end=now()-interval '1 minute' WHERE user_id=(SELECT id FROM users WHERE email='c@x.com')");
  assert.equal((await m.refresh()).code,'EXPIRED');assert.equal(m.isValid(),false);
  await grant('c@x.com');assert.equal((await m.refresh()).ok,true);assert.equal(m.isValid(),true);
  await pool.query("UPDATE users SET blocked=true WHERE email='c@x.com'");assert.equal((await m.refresh()).code,'BLOCKED');assert.equal(m.isValid(),false);
  await pool.query("UPDATE users SET blocked=false WHERE email='c@x.com'");
});
test('the stored file is encrypted and cannot be copied to another computer',{skip},async()=>{
  const m=mk(fpA);await m.activate('c@x.com',PW);assert.equal(m.isValid(),true);
  const raw=fs.readFileSync(m.file);const text=raw.toString('latin1');
  assert.ok(!text.includes(m.state.token.slice(0,30))&&!text.includes(m.state.deviceSecret),'no plaintext secrets on disk');
  const copied=mk(fpB,{dir:m.dir});assert.equal(copied.isValid(),false,'other computer cannot read the file');
  const clone=mk(fpB);clone.state={...m.state};assert.equal(clone.check().code,'WRONG_DEVICE','even decrypted, the licence is bound to the first computer');
  const clone2=mk(fpB);clone2.state={...m.state};assert.equal((await clone2.refresh()).ok,false,'server also rejects the copied credentials');
});
test('edited or foreign-signed licences are rejected',{skip},async()=>{
  const m=mk(fpA);await m.activate('c@x.com',PW);
  const [body,sig]=m.state.token.split('.');const p=JSON.parse(Buffer.from(body,'base64url'));
  m.state.token=Buffer.from(JSON.stringify({...p,exp:p.exp+400*DAY,next:p.next+400*DAY})).toString('base64url')+'.'+sig;assert.equal(m.isValid(),false);
  const other=crypto.generateKeyPairSync('ed25519');
  const fake=mk(fpA,{publicKey:other.publicKey.export({type:'spki',format:'pem'})});fake.state={...m.state};
  const good=mk(fpA);await good.activate('c@x.com',PW);fake.state.token=good.state.token;assert.equal(fake.isValid(),false,'app built for another key refuses this server');
});
test('a fake licence server cannot unlock the app',{skip},async()=>{
  const evil=crypto.generateKeyPairSync('ed25519');
  const payload={v:1,uid:'x',did:'x',fp:fpOfRaw(fpA),plan:'business',maxDevices:99,iat:Date.now(),next:Date.now()+30*DAY,exp:Date.now()+400*DAY};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const token=body+'.'+crypto.sign(null,Buffer.from(body),evil.privateKey).toString('base64url');
  const m=mk(fpA,{fetchImpl:async()=>({status:200,json:async()=>({ok:true,token,deviceId:'d',deviceSecret:'s'})})});
  await assert.rejects(()=>m.activate('c@x.com',PW),/could not be verified/);assert.equal(m.isValid(),false);
});
test('plain http servers are refused outside development',{skip},async()=>{
  const m=mk(fpA,{serverUrl:'http://example.com',allowHttp:false});
  await assert.rejects(()=>m.config(),/https/);
});
function fpOfRaw(raw){return crypto.createHash('sha256').update(raw).digest('hex').slice(0,24)}

test('desktop flow: sign up with a company, ask for a plan, owner allows it, app unlocks',{skip},async()=>{
  const m=mk(fpA);
  assert.equal((await m.register({email:'ask@x.com',password:PW,name:'Ask',company:'Zed Mills'})).ok,true);
  const a=await m.activate('ask@x.com',PW);assert.equal(a.code,'NO_SUBSCRIPTION');assert.equal(m.isValid(),false);
  assert.equal((await m.requestSubscription({plan:'basic',period:'monthly',note:'hello'})).ok,true);
  assert.equal((await m.requestSubscription({plan:'basic',period:'monthly'})).code,'REQUEST_PENDING');
  assert.equal((await m.refresh()).ok,false,'still locked while the request is waiting');
  const me=await m.me();assert.equal(me.requests[0].status,'pending');
  // the owner allows it (same SQL the admin endpoint runs through its own test in server/test)
  const rid=(await pool.query("SELECT r.id FROM sub_requests r JOIN users u ON u.id=r.user_id WHERE u.email='ask@x.com'")).rows[0].id;
  const adm=await call_('POST','/api/admin/login',{email:'boss@x.com',password:'boss-password-123'});
  assert.equal((await call_('POST',`/api/admin/requests/${rid}/allow`,{},'Bearer '+adm.body.token)).status,200);
  const r=await m.refresh();assert.equal(r.ok,true);assert.equal(m.isValid(),true);
  assert.equal((await pool.query("SELECT c.name FROM users u JOIN companies c ON c.id=u.company_id WHERE u.email='ask@x.com'")).rows[0].name,'Zed Mills');
});
async function call_(method,p,body,auth){const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
