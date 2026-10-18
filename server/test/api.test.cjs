'use strict';
/* Needs a real PostgreSQL:  TEST_DATABASE_URL=postgres://user@host:port/db npm test   (skipped when not set) */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createPool,migrate}=require('../src/db.cjs');
const {createApp}=require('../src/app.cjs');
const {hashPassword,verifyToken}=require('../src/crypto.cjs');
const URL_=process.env.TEST_DATABASE_URL;
const skip=!URL_&&'TEST_DATABASE_URL not set';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const PRIV=privateKey.export({type:'pkcs8',format:'pem'}),PUB=publicKey.export({type:'spki',format:'pem'});
let pool,server,base;
const call=async(method,path,body,auth)=>{
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},body:body?JSON.stringify(body):undefined});
  return {status:r.status,body:await r.json()};
};
const PW='correct horse battery';
const fpA='a'.repeat(40),fpB='b'.repeat(40);
let adminTok;
before(async()=>{
  if(skip)return;
  pool=createPool(URL_);await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');await migrate(pool);
  await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES('admin@x.com',$1,'Admin','admin')",[await hashPassword('admin-password-123')]);
  server=createApp({pool,privateKey:PRIV,env:{PAY_BKASH:'01700000000',REGISTER_PER_HOUR:'1000'}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  adminTok=(await call('POST','/api/admin/login',{email:'admin@x.com',password:'admin-password-123'})).body.token;
});
after(async()=>{if(skip)return;server.close();await pool.end()});
const adm=()=>'Bearer '+adminTok;
let dev,devB,userId;

test('register validates input and blocks duplicates',{skip},async()=>{
  assert.equal((await call('POST','/api/auth/register',{email:'bad',password:PW,name:'A'})).status,400);
  assert.equal((await call('POST','/api/auth/register',{email:'a@x.com',password:'short',name:'A'})).body.code,'WEAK_PASSWORD');
  assert.equal((await call('POST','/api/auth/register',{email:'a@x.com',password:PW,name:'Rahim Traders',phone:'01711111111'})).status,201);
  assert.equal((await call('POST','/api/auth/register',{email:'A@x.com',password:PW,name:'Dup'})).body.code,'EMAIL_EXISTS');
});
test('activation without a subscription gives device credentials but no licence',{skip},async()=>{
  const r=await call('POST','/api/device/activate',{email:'a@x.com',password:PW,fp:fpA,deviceName:'PC-1',platform:'win32'});
  assert.equal(r.body.ok,false);assert.equal(r.body.code,'NO_SUBSCRIPTION');assert.ok(r.body.deviceId&&r.body.deviceSecret);assert.equal(r.body.token,undefined);
  dev={id:r.body.deviceId,auth:`Device ${r.body.deviceId}.${r.body.deviceSecret}`};
});
test('device endpoints reject missing or wrong credentials',{skip},async()=>{
  assert.equal((await call('GET','/api/me')).status,401);
  assert.equal((await call('GET','/api/me',null,dev.auth.slice(0,-3)+'xyz')).status,401);
  assert.equal((await call('POST','/api/license/refresh',{fp:fpA})).status,401);
});
test('payment submission is validated and unique',{skip},async()=>{
  const ok={plan:'basic',period:'monthly',method:'bkash',trxId:'8n3k2m9x1q',payerNumber:'01711111111'};
  assert.equal((await call('POST','/api/payments',{...ok,trxId:'x'},dev.auth)).body.code,'BAD_TRX');
  assert.equal((await call('POST','/api/payments',{...ok,plan:'gold'},dev.auth)).body.code,'BAD_PLAN');
  assert.equal((await call('POST','/api/payments',{...ok,method:'paypal'},dev.auth)).body.code,'BAD_METHOD');
  const r=await call('POST','/api/payments',ok,dev.auth);assert.equal(r.status,201);assert.equal(r.body.amount,1000);
  assert.equal((await call('POST','/api/payments',ok,dev.auth)).body.code,'TRX_USED');
});
test('only admins reach admin endpoints',{skip},async()=>{
  assert.equal((await call('GET','/api/admin/summary')).status,401);
  assert.equal((await call('GET','/api/admin/summary',null,dev.auth)).status,401);
  assert.equal((await call('POST','/api/admin/login',{email:'a@x.com',password:PW})).status,401);
  assert.equal((await call('GET','/api/admin/summary',null,adm())).body.pending,1);
});
test('confirming a payment starts the subscription and issues a signed licence',{skip},async()=>{
  const pend=(await call('GET','/api/admin/payments?status=pending',null,adm())).body;assert.equal(pend.length,1);userId=pend[0].user_id;
  assert.equal((await call('POST',`/api/admin/payments/${pend[0].id}/confirm`,null,adm())).status,200);
  assert.equal((await call('POST',`/api/admin/payments/${pend[0].id}/confirm`,null,adm())).body.code,'ALREADY_DECIDED');
  const r=await call('POST','/api/license/refresh',{fp:fpA},dev.auth);
  assert.equal(r.body.ok,true);
  const p=verifyToken(r.body.token,PUB);
  assert.equal(p.uid,userId);assert.equal(p.did,dev.id);assert.equal(p.plan,'basic');assert.equal(p.maxDevices,1);
  assert.ok(p.next-p.iat<=7*24*3600*1000+1000,'offline grace is at most 7 days');
  assert.ok(p.exp>Date.now()+27*86400000);
  const [tb,ts]=r.body.token.split('.');const bad=tb+'.'+(ts[0]==='A'?'B':'A')+ts.slice(1); /* first char, not the last: the last base64 char can carry unused padding bits */
  assert.equal(verifyToken(bad,PUB),null,'tampered signature rejected');
  const [b,s]=r.body.token.split('.');const forged=Buffer.from(JSON.stringify({...p,plan:'business',exp:p.exp+1e11})).toString('base64url')+'.'+s;
  assert.equal(verifyToken(forged,PUB),null,'edited payload rejected');
  assert.equal(verifyToken(r.body.token,crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})),null,'other key rejected');
});
test('licence is bound to the computer',{skip},async()=>{
  assert.equal((await call('POST','/api/license/refresh',{fp:fpB},dev.auth)).status,401);
});
test('plan device limit is enforced and self-service removal frees a slot',{skip},async()=>{
  const r=await call('POST','/api/device/activate',{email:'a@x.com',password:PW,fp:fpB,deviceName:'PC-2',platform:'win32'});
  assert.equal(r.body.code,'DEVICE_LIMIT');devB={id:r.body.deviceId,auth:`Device ${r.body.deviceId}.${r.body.deviceSecret}`};
  assert.equal((await call('POST','/api/license/refresh',{fp:fpB},devB.auth)).body.code,'DEVICE_LIMIT');
  assert.equal((await call('POST',`/api/devices/${dev.id}/revoke`,null,devB.auth)).status,200);
  assert.equal((await call('POST','/api/license/refresh',{fp:fpA},dev.auth)).status,401,'removed device is cut off');
  assert.equal((await call('POST','/api/license/refresh',{fp:fpB},devB.auth)).body.ok,true);
  assert.equal((await call('POST',`/api/devices/${devB.id}/revoke`,null,devB.auth)).status,404,'cannot remove own device');
});
test('a second payment stacks on the remaining time; upgrade raises device limit',{skip},async()=>{
  const before_=(await call('GET','/api/me',null,devB.auth)).body.subscription.periodEnd;
  await call('POST','/api/payments',{plan:'pro',period:'monthly',method:'nagad',trxId:'NG1234567',payerNumber:'017'},devB.auth);
  const id=(await call('GET','/api/admin/payments?status=pending',null,adm())).body[0].id;
  const c=await call('POST',`/api/admin/payments/${id}/confirm`,null,adm());
  const gain=new Date(c.body.periodEnd)-new Date(before_);assert.ok(gain>27*86400000&&gain<32*86400000,'about one month added, got '+gain/86400000);
  const r=await call('POST','/api/device/activate',{email:'a@x.com',password:PW,fp:fpA,deviceName:'PC-1',platform:'win32'});
  assert.equal(r.body.ok,true,'Pro allows 3 devices');assert.equal(verifyToken(r.body.token,PUB).maxDevices,3);
});
test('wrong passwords lock the account',{skip},async()=>{
  await call('POST','/api/auth/register',{email:'l@x.com',password:PW,name:'L'});
  let last;for(let i=0;i<5;i++)last=await call('POST','/api/device/activate',{email:'l@x.com',password:'nope-nope-nope',fp:fpA});
  assert.equal(last.body.code,'INVALID_CREDENTIALS');
  const locked=await call('POST','/api/device/activate',{email:'l@x.com',password:PW,fp:fpA});
  assert.ok(['LOCKED','RATE_LIMITED'].includes(locked.body.code),'correct password is refused while locked');
  assert.equal((await call('POST','/api/device/activate',{email:'nobody@x.com',password:'whatever-1234',fp:fpA})).body.code,'INVALID_CREDENTIALS','same answer for unknown email');
});
test('expiry, cancel and block cut the licence off',{skip},async()=>{
  const ref=()=>call('POST','/api/license/refresh',{fp:fpB},devB.auth);
  await call('POST',`/api/admin/users/${userId}/cancel`,null,adm());assert.equal((await ref()).body.code,'EXPIRED');
  await call('POST',`/api/admin/users/${userId}/extend`,{days:10,plan:'pro'},adm());assert.equal((await ref()).body.ok,true);
  await call('POST',`/api/admin/users/${userId}/block`,{blocked:true},adm());assert.equal((await ref()).body.code,'BLOCKED');
  await call('POST',`/api/admin/users/${userId}/block`,{blocked:false},adm());assert.equal((await ref()).body.ok,true);
  await call('POST',`/api/admin/users/${userId}/reset-devices`,null,adm());assert.equal((await ref()).status,401);
});
test('inputs are not trusted',{skip},async()=>{
  assert.equal((await call('POST','/api/admin/users/not-a-uuid/extend',{days:5},adm())).status,400);
  const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'text/plain'},body:'x'});assert.equal(r.status,415);
  const big=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({a:'x'.repeat(40000)})}).catch(()=>({status:413}));assert.equal(big.status,413);
  assert.equal((await call('GET','/api/nothing')).status,404);
  const adminPage=await fetch(base+'/admin');assert.match(adminPage.headers.get('content-security-policy'),/default-src 'none'/);
});
test('audit log records admin actions',{skip},async()=>{
  const a=(await call('GET','/api/admin/audit',null,adm())).body.map(x=>x.action);
  for(const k of ['register','payment-submit','payment-confirm','device-activate','admin-login'])assert.ok(a.includes(k),k);
});

/* ---------- companies, subscription requests, admin-created users ---------- */
test('companies: create, edit, duplicate name, registration links by name, delete rules',{skip},async()=>{
  assert.equal((await call('POST','/api/admin/companies',{name:' '},adm())).status,400);
  const c=await call('POST','/api/admin/companies',{name:'Acme Garments Ltd',contact:'Rahim',phone:'01711111111',address:'Gazipur'},adm());
  assert.equal(c.status,201);const cid=c.body.id;
  assert.equal((await call('POST','/api/admin/companies',{name:'acme garments LTD'},adm())).body.code,'COMPANY_EXISTS','names are unique ignoring case');
  assert.equal((await call('PUT',`/api/admin/companies/${cid}`,{name:'Acme Garments Ltd',contact:'Karim',phone:'01722222222'},adm())).status,200);
  const reg=await call('POST','/api/auth/register',{email:'co1@x.com',password:PW,name:'Co One',company:'ACME garments ltd'});
  assert.equal(reg.status,201);
  const got=await call('GET',`/api/admin/companies/${cid}`,null,adm());
  assert.equal(got.body.company.contact,'Karim');assert.equal(got.body.users.length,1);assert.equal(got.body.users[0].email,'co1@x.com');
  const list=(await call('GET','/api/admin/companies?q=acme',null,adm())).body;assert.equal(list[0].users,1);
  assert.equal((await call('POST',`/api/admin/companies/${cid}/delete`,null,adm())).body.code,'HAS_USERS');
  assert.equal((await call('GET','/api/admin/companies',null)).status,401,'admin only');
});
test('subscription request: customer asks in the app, admin allows, licence is issued',{skip},async()=>{
  await call('POST','/api/auth/register',{email:'req1@x.com',password:PW,name:'Req One'});
  const act=await call('POST','/api/device/activate',{email:'req1@x.com',password:PW,fp:'r'.repeat(40),deviceName:'PC',platform:'win32'});
  assert.equal(act.body.code,'NO_SUBSCRIPTION');const auth=`Device ${act.body.deviceId}.${act.body.deviceSecret}`;
  assert.equal((await call('POST','/api/subscription/request',{plan:'nope',period:'monthly'},auth)).body.code,'BAD_PLAN');
  assert.equal((await call('POST','/api/subscription/request',{plan:'basic',period:'weekly'},auth)).body.code,'BAD_PERIOD');
  assert.equal((await call('POST','/api/subscription/request',{plan:'basic',period:'monthly',note:'please'},auth)).status,201);
  assert.equal((await call('POST','/api/subscription/request',{plan:'basic',period:'yearly'},auth)).body.code,'REQUEST_PENDING','one pending request at a time');
  assert.equal((await call('POST','/api/subscription/request',{plan:'basic',period:'monthly'})).status,401,'needs device credentials');
  const pend=(await call('GET','/api/admin/requests',null,adm())).body;const mine=pend.find(r=>r.email==='req1@x.com');
  assert.ok(mine);assert.equal(mine.note,'please');
  assert.equal((await call('GET','/api/me',null,auth)).body.requests[0].status,'pending');
  assert.equal((await call('POST',`/api/admin/requests/${mine.id}/allow`,{days:0},adm())).body.code,'BAD_DAYS');
  const al=await call('POST',`/api/admin/requests/${mine.id}/allow`,{},adm());assert.equal(al.status,200);
  assert.equal((await call('POST',`/api/admin/requests/${mine.id}/allow`,{},adm())).body.code,'ALREADY_DECIDED');
  const r=await call('POST','/api/license/refresh',{fp:'r'.repeat(40)},auth);
  assert.equal(r.body.ok,true);assert.ok(verifyToken(r.body.token,PUB).exp>Date.now()+27*86400000);
  assert.equal((await call('GET','/api/me',null,auth)).body.requests[0].status,'allowed');
});
test('subscription request can be denied with a reason',{skip},async()=>{
  await call('POST','/api/auth/register',{email:'req2@x.com',password:PW,name:'Req Two'});
  const act=await call('POST','/api/device/activate',{email:'req2@x.com',password:PW,fp:'q'.repeat(40)});
  const auth=`Device ${act.body.deviceId}.${act.body.deviceSecret}`;
  await call('POST','/api/subscription/request',{plan:'basic',period:'yearly'},auth);
  const mine=(await call('GET','/api/admin/requests',null,adm())).body.find(r=>r.email==='req2@x.com');
  assert.equal((await call('POST',`/api/admin/requests/${mine.id}/deny`,{note:'No payment received'},adm())).status,200);
  const me=(await call('GET','/api/me',null,auth)).body;assert.equal(me.requests[0].status,'denied');assert.equal(me.requests[0].reason,'No payment received');
  assert.equal((await call('POST','/api/license/refresh',{fp:'q'.repeat(40)},auth)).body.code,'NO_SUBSCRIPTION');
});
test('blocking a company cuts off every user in it',{skip},async()=>{
  const c=(await call('POST','/api/admin/companies',{name:'Blockable Co'},adm())).body.id;
  const u=await call('POST','/api/admin/users',{email:'bc1@x.com',password:PW,name:'BC',companyId:c,plan:'basic',days:30},adm());assert.equal(u.status,201);
  const act=await call('POST','/api/device/activate',{email:'bc1@x.com',password:PW,fp:'c'.repeat(40)});assert.equal(act.body.ok,true);
  const auth=`Device ${act.body.deviceId}.${act.body.deviceSecret}`;
  assert.equal((await call('POST',`/api/admin/companies/${c}/block`,{blocked:true},adm())).status,200);
  assert.equal((await call('POST','/api/license/refresh',{fp:'c'.repeat(40)},auth)).body.code,'BLOCKED');
  await call('POST',`/api/admin/companies/${c}/block`,{blocked:false},adm());
  assert.equal((await call('POST','/api/license/refresh',{fp:'c'.repeat(40)},auth)).body.ok,true);
});
test('admin creates, edits and resets users',{skip},async()=>{
  assert.equal((await call('POST','/api/admin/users',{email:'bad',password:PW,name:'x'},adm())).body.code,'BAD_EMAIL');
  assert.equal((await call('POST','/api/admin/users',{email:'au1@x.com',password:'short',name:'x'},adm())).body.code,'WEAK_PASSWORD');
  assert.equal((await call('POST','/api/admin/users',{email:'au1@x.com',password:PW,name:'x',days:30},adm())).body.code,'BAD_PLAN','days need a plan');
  assert.equal((await call('POST','/api/admin/users',{email:'au1@x.com',password:PW,name:'x',companyId:'00000000-0000-0000-0000-000000000000'},adm())).body.code,'BAD_COMPANY');
  const u=await call('POST','/api/admin/users',{email:'au1@x.com',password:PW,name:'Admin Made'},adm());assert.equal(u.status,201);
  assert.equal((await call('POST','/api/admin/users',{email:'AU1@x.com',password:PW,name:'dup'},adm())).body.code,'EMAIL_EXISTS');
  assert.equal((await call('PUT',`/api/admin/users/${u.body.id}`,{name:'Renamed',phone:'01733333333'},adm())).status,200);
  assert.equal((await call('GET',`/api/admin/users/${u.body.id}`,null,adm())).body.user.name,'Renamed');
  assert.equal((await call('POST',`/api/admin/users/${u.body.id}/password`,{password:'short'},adm())).body.code,'WEAK_PASSWORD');
  assert.equal((await call('POST',`/api/admin/users/${u.body.id}/password`,{password:'a brand new passphrase'},adm())).status,200);
  assert.equal((await call('POST','/api/device/activate',{email:'au1@x.com',password:PW,fp:'a'.repeat(40)})).status,401,'old password no longer works');
  assert.equal((await call('POST','/api/device/activate',{email:'au1@x.com',password:'a brand new passphrase',fp:'a'.repeat(40)})).body.code,'NO_SUBSCRIPTION');
  const sum=(await call('GET','/api/admin/summary',null,adm())).body;assert.ok(sum.companies>=2&&sum.clients>=3&&'requests' in sum&&'revenue30' in sum);
});
