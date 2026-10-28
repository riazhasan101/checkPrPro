'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {hashPassword,verifyPassword,DUMMY,sha256,randomToken,safeEqual,signToken}=require('./crypto.cjs');
const {createDownloads}=require('./download.cjs');

const GRACE_MS=7*24*3600*1000;            // how long a device may run without reaching the server (7 days)
const MAX_DEVICE_ROWS=10;                  // hard cap of non-revoked device records per account
const METHODS=['bkash','nagad','bank'];
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function createApp({pool,privateKey,env=process.env}){
  const adminHtml=fs.readFileSync(path.join(__dirname,'admin.html'),'utf8');
  const downloads=createDownloads(env.DOWNLOAD_DIR||'/downloads',{support:env.SUPPORT_CONTACT||''});
  const hits=new Map();
  const trustProxy=env.TRUST_PROXY==='1';
  /* Behind Caddy, trust the proxy-set client address. A caller-supplied X-Forwarded-For list is not the client: the proxy value is the last hop, and X-Real-IP is set explicitly. */
  const ipOf=req=>{
    if(!trustProxy)return req.socket.remoteAddress;
    const real=String(req.headers['x-real-ip']||'').split(',')[0].trim();
    if(real)return real;
    const fwd=String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean);
    return fwd.length?fwd[fwd.length-1]:req.socket.remoteAddress;
  };
  function limited(key,max,windowMs){
    const now=Date.now();let h=hits.get(key);
    if(!h||h.reset<now){h={count:0,reset:now+windowMs};hits.set(key,h)}
    h.count++;return h.count>max;
  }
  setInterval(()=>{const n=Date.now();for(const [k,v] of hits)if(v.reset<n)hits.delete(k)},60000).unref();

  const audit=(actor,action,detail={})=>pool.query('INSERT INTO audit_log(actor,action,detail) VALUES($1,$2,$3)',[String(actor),action,JSON.stringify(detail)]).catch(()=>{});
  const fail=(status,code,message)=>Object.assign(new Error(message||code),{status,code});

  function send(res,status,obj,extra={}){
    const body=JSON.stringify(obj);
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'",'Content-Length':Buffer.byteLength(body),...extra});
    res.end(body);
  }
  function readBody(req){
    return new Promise((resolve,reject)=>{
      if(req.method==='GET'||req.method==='HEAD')return resolve({});
      if(!/^application\/json/i.test(req.headers['content-type']||''))return reject(fail(415,'JSON_REQUIRED','Send JSON'));
      let size=0;const chunks=[];
      req.on('data',c=>{size+=c.length;if(size>32768){reject(fail(413,'TOO_LARGE','Body too large'));req.destroy();return}chunks.push(c)});
      req.on('end',()=>{try{resolve(chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{})}catch{reject(fail(400,'BAD_JSON','Invalid JSON'))}});
      req.on('error',reject);
    });
  }
  const str=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';

  /* ---------- subscription / licence ---------- */
  async function subscriptionOf(db,userId){
    const {rows}=await db.query(`SELECT s.plan_id,s.period_end,p.name AS plan_name,p.max_devices FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1`,[userId]);
    if(!rows[0])return null;
    const r=rows[0];return {plan:r.plan_id,planName:r.plan_name,maxDevices:r.max_devices,periodEnd:r.period_end,active:new Date(r.period_end).getTime()>Date.now()};
  }
  async function issueLicense(db,user,device,fpRaw){
    if(user.blocked)return {ok:false,code:'BLOCKED',message:'This account is blocked. Contact support.'};
    if((await db.query('SELECT 1 FROM users u JOIN companies c ON c.id=u.company_id WHERE u.id=$1 AND c.blocked',[user.id])).rowCount)return {ok:false,code:'BLOCKED',message:'This company account is blocked. Contact support.'};
    const sub=await subscriptionOf(db,user.id);
    if(!sub)return {ok:false,code:'NO_SUBSCRIPTION',message:'No active subscription. Choose a plan and send your payment.'};
    if(!sub.active)return {ok:false,code:'EXPIRED',message:'Your subscription has expired. Renew to continue.',subscription:sub};
    const {rows}=await db.query('SELECT id FROM devices WHERE user_id=$1 AND revoked=false ORDER BY first_seen,id',[user.id]);
    const slot=rows.findIndex(r=>r.id===device.id);
    if(slot<0||slot>=sub.maxDevices)return {ok:false,code:'DEVICE_LIMIT',message:`Your ${sub.planName} plan allows ${sub.maxDevices} device(s). Remove one from your other computer or ask support.`,subscription:sub};
    const now=Date.now(),exp=new Date(sub.periodEnd).getTime();
    const payload={v:1,uid:user.id,did:device.id,fp:sha256(fpRaw).slice(0,24),plan:sub.plan,maxDevices:sub.maxDevices,iat:now,next:Math.min(exp,now+GRACE_MS),exp,jti:randomToken(8)};
    return {ok:true,token:signToken(payload,privateKey),subscription:sub,serverTime:now};
  }

  /* ---------- auth helpers ---------- */
  async function deviceAuth(req){
    const m=/^Device ([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,80})$/.exec(req.headers.authorization||'');
    if(!m)throw fail(401,'UNAUTHORIZED','Device credentials required');
    const {rows}=await pool.query(`SELECT d.*,u.email,u.blocked,u.role,u.name AS user_name FROM devices d JOIN users u ON u.id=d.user_id WHERE d.id=$1`,[m[1]]);
    const d=rows[0];
    if(!d||!safeEqual(sha256(m[2]),d.secret_hash)||d.revoked)throw fail(401,'UNAUTHORIZED','This device is no longer authorised. Sign in again.');
    return d;
  }
  async function adminAuth(req){
    const m=/^Bearer ([A-Za-z0-9_-]{20,80})$/.exec(req.headers.authorization||'');
    if(!m)throw fail(401,'UNAUTHORIZED','Admin sign-in required');
    const {rows}=await pool.query(`SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.role='admin' AND u.blocked=false`,[sha256(m[1])]);
    if(!rows[0])throw fail(401,'UNAUTHORIZED','Admin session expired');
    return rows[0];
  }
  async function checkPassword(email,password,ip){
    if(limited('pw:ip:'+ip,30,15*60000)||limited('pw:em:'+email,10,15*60000))throw fail(429,'RATE_LIMITED','Too many attempts. Try again in a few minutes.');
    const {rows}=await pool.query('SELECT * FROM users WHERE email=$1',[email]);
    const u=rows[0];
    if(u&&u.locked_until&&new Date(u.locked_until)>new Date())throw fail(429,'LOCKED','Account temporarily locked after repeated wrong passwords. Try again later.');
    const ok=await verifyPassword(password,u?u.password_hash:await DUMMY);
    if(!u||!ok){
      if(u){await pool.query('UPDATE users SET failed_logins=failed_logins+1,locked_until=CASE WHEN failed_logins+1>=5 THEN now()+interval \'15 minutes\' ELSE locked_until END WHERE id=$1',[u.id]);}
      throw fail(401,'INVALID_CREDENTIALS','Wrong email or password.');
    }
    await pool.query('UPDATE users SET failed_logins=0,locked_until=NULL WHERE id=$1',[u.id]);
    return u;
  }

  /* ---------- route table ---------- */
  const routes=[];
  const route=(method,pattern,handler)=>routes.push({method,re:new RegExp('^'+pattern.replace(/:(\w+)/g,'(?<$1>[^/]+)')+'$'),handler});

  route('GET','/api/health',async()=>({status:200,body:{ok:true}}));
  route('GET','/api/config',async()=>{
    const {rows}=await pool.query('SELECT * FROM plans ORDER BY max_devices');
    return {status:200,body:{plans:rows.map(p=>({id:p.id,name:p.name,maxDevices:p.max_devices,priceMonthly:p.price_monthly,priceYearly:p.price_yearly})),
      pay:{bkash:env.PAY_BKASH||'',nagad:env.PAY_NAGAD||'',bank:env.PAY_BANK||''},supportContact:env.SUPPORT_CONTACT||''}};
  });
  route('POST','/api/auth/register',async(req,body)=>{
    const ip=ipOf(req);if(limited('reg:'+ip,Number(env.REGISTER_PER_HOUR)||5,3600000))throw fail(429,'RATE_LIMITED','Too many sign-ups from this network. Try later.');
    const email=str(body.email,254).toLowerCase(),password=String(body.password||''),name=str(body.name,80),phone=str(body.phone,20);
    if(!EMAIL.test(email))throw fail(400,'BAD_EMAIL','Enter a valid email address.');
    if(password.length<10||password.length>128)throw fail(400,'WEAK_PASSWORD','Password must be 10 to 128 characters.');
    if(!name)throw fail(400,'BAD_NAME','Enter your name or company name.');
    const cname=str(body.company,100);let companyId=null;
    if(cname)companyId=(await pool.query('INSERT INTO companies(name) VALUES($1) ON CONFLICT (lower(name)) DO UPDATE SET name=companies.name RETURNING id',[cname])).rows[0].id;
    try{await pool.query('INSERT INTO users(email,password_hash,name,phone,company_id) VALUES($1,$2,$3,$4,$5)',[email,await hashPassword(password),name,phone,companyId])}
    catch(e){if(e.code==='23505')throw fail(409,'EMAIL_EXISTS','An account with this email already exists.');throw e}
    audit(email,'register');
    return {status:201,body:{ok:true}};
  });
  route('POST','/api/device/activate',async(req,body)=>{
    const email=str(body.email,254).toLowerCase(),fp=str(body.fp,128);
    if(!fp||fp.length<16)throw fail(400,'BAD_DEVICE','Device id missing.');
    const user=await checkPassword(email,String(body.password||''),ipOf(req));
    if(user.role==='admin')throw fail(403,'ADMIN_ACCOUNT','Admin accounts sign in on the admin panel.');
    const secret=randomToken(32),client=await pool.connect();
    try{
      await client.query('BEGIN');
      const up=await client.query(`INSERT INTO devices(user_id,fp_hash,secret_hash,name,platform) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,fp_hash) DO UPDATE SET secret_hash=EXCLUDED.secret_hash,name=EXCLUDED.name,platform=EXCLUDED.platform,revoked=false,last_seen=now() RETURNING *`,
        [user.id,sha256(fp),sha256(secret),str(body.deviceName,80),str(body.platform,30)]);
      const cnt=await client.query('SELECT count(*)::int AS n FROM devices WHERE user_id=$1 AND revoked=false',[user.id]);
      if(cnt.rows[0].n>MAX_DEVICE_ROWS){await client.query('ROLLBACK');throw fail(409,'TOO_MANY_DEVICES','Too many devices registered on this account. Contact support.')}
      const lic=await issueLicense(client,user,up.rows[0],fp);
      await client.query('COMMIT');
      audit(email,'device-activate',{device:up.rows[0].id,ok:lic.ok,code:lic.code||null});
      return {status:200,body:{...lic,deviceId:up.rows[0].id,deviceSecret:secret,user:{email:user.email,name:user.name}}};
    }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  });
  route('POST','/api/license/refresh',async(req,body)=>{
    if(limited('ref:'+ipOf(req),120,60000))throw fail(429,'RATE_LIMITED','Too many requests.');
    const d=await deviceAuth(req),fp=str(body.fp,128);
    if(!safeEqual(sha256(fp),d.fp_hash))throw fail(401,'UNAUTHORIZED','This licence belongs to a different computer.');
    await pool.query('UPDATE devices SET last_seen=now() WHERE id=$1',[d.id]);
    const lic=await issueLicense(pool,{id:d.user_id,blocked:d.blocked},d,fp);
    return {status:200,body:lic};
  });
  route('GET','/api/me',async(req)=>{
    const d=await deviceAuth(req);
    const [sub,pay,dev]=await Promise.all([
      subscriptionOf(pool,d.user_id),
      pool.query('SELECT id,plan_id,period,amount,method,trx_id,status,note,created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[d.user_id]),
      pool.query('SELECT id,name,platform,first_seen,last_seen FROM devices WHERE user_id=$1 AND revoked=false ORDER BY first_seen',[d.user_id])]);
    const reqs=(await pool.query('SELECT id,plan_id,period,status,reason,created_at FROM sub_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5',[d.user_id])).rows;
    return {status:200,body:{user:{email:d.email,name:d.user_name},subscription:sub,payments:pay.rows,requests:reqs,devices:dev.rows.map(x=>({...x,current:x.id===d.id})),blocked:d.blocked}};
  });
  route('PUT','/api/me',async(req,body)=>{
    const d=await deviceAuth(req),name=str(body.name,80),phone=str(body.phone,20);
    if(!name)throw fail(400,'BAD_NAME','Enter your name or company name.');
    await pool.query('UPDATE users SET name=$2,phone=$3 WHERE id=$1',[d.user_id,name,phone]);
    audit(d.email,'profile-edit');
    return {status:200,body:{ok:true,user:{email:d.email,name,phone}}};
  });
  route('POST','/api/payments',async(req,body)=>{
    const d=await deviceAuth(req);
    if(limited('pay:'+d.user_id,10,3600000))throw fail(429,'RATE_LIMITED','Too many payment submissions. Wait a little.');
    const plan=str(body.plan,20),period=str(body.period,10),method=str(body.method,10),trx=str(body.trxId,40).toUpperCase(),payer=str(body.payerNumber,20);
    if(!['monthly','yearly'].includes(period))throw fail(400,'BAD_PERIOD','Choose monthly or yearly.');
    if(!METHODS.includes(method))throw fail(400,'BAD_METHOD','Choose bKash, Nagad or bank.');
    if(!/^[A-Z0-9]{6,40}$/.test(trx))throw fail(400,'BAD_TRX','Enter the transaction ID exactly as in your payment SMS.');
    const p=(await pool.query('SELECT * FROM plans WHERE id=$1',[plan])).rows[0];
    if(!p)throw fail(400,'BAD_PLAN','Unknown plan.');
    const pending=(await pool.query("SELECT count(*)::int n FROM payments WHERE user_id=$1 AND status='pending'",[d.user_id])).rows[0].n;
    if(pending>=3)throw fail(409,'TOO_MANY_PENDING','You already have payments waiting for confirmation.');
    const amount=period==='yearly'?p.price_yearly:p.price_monthly;
    try{await pool.query('INSERT INTO payments(user_id,plan_id,period,amount,method,trx_id,payer_number) VALUES($1,$2,$3,$4,$5,$6,$7)',[d.user_id,plan,period,amount,method,trx,payer])}
    catch(e){if(e.code==='23505')throw fail(409,'TRX_USED','This transaction ID has already been submitted.');throw e}
    audit(d.email,'payment-submit',{plan,period,method,trx,amount});
    return {status:201,body:{ok:true,amount}};
  });
  route('POST','/api/subscription/request',async(req,body)=>{
    const d=await deviceAuth(req);
    if(limited('req:'+d.user_id,10,3600000))throw fail(429,'RATE_LIMITED','Too many requests. Wait a little.');
    const plan=str(body.plan,20),period=str(body.period,10);
    if(!['monthly','yearly'].includes(period))throw fail(400,'BAD_PERIOD','Choose monthly or yearly.');
    if(!(await pool.query('SELECT 1 FROM plans WHERE id=$1',[plan])).rowCount)throw fail(400,'BAD_PLAN','Unknown plan.');
    try{await pool.query('INSERT INTO sub_requests(user_id,plan_id,period,note) VALUES($1,$2,$3,$4)',[d.user_id,plan,period,str(body.note,200)])}
    catch(e){if(e.code==='23505')throw fail(409,'REQUEST_PENDING','You already have a request waiting for approval.');throw e}
    audit(d.email,'sub-request',{plan,period});
    return {status:201,body:{ok:true}};
  });
  route('POST','/api/devices/:id/revoke',async(req,body,params)=>{
    const d=await deviceAuth(req);
    if(!/^[0-9a-f-]{36}$/.test(params.id))throw fail(400,'BAD_ID','Bad device id');
    const r=await pool.query('UPDATE devices SET revoked=true WHERE id=$1 AND user_id=$2 AND id<>$3',[params.id,d.user_id,d.id]);
    if(!r.rowCount)throw fail(404,'NOT_FOUND','Device not found (you cannot remove the computer you are using).');
    audit(d.email,'device-self-revoke',{device:params.id});
    return {status:200,body:{ok:true}};
  });

  /* ---------- admin ---------- */
  route('POST','/api/admin/login',async(req,body)=>{
    const email=str(body.email,254).toLowerCase(),u=await checkPassword(email,String(body.password||''),ipOf(req));
    if(u.role!=='admin'||u.blocked)throw fail(401,'INVALID_CREDENTIALS','Wrong email or password.');
    const token=randomToken(32);
    await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[sha256(token),u.id]);
    await pool.query('DELETE FROM sessions WHERE expires_at<now()');
    audit(email,'admin-login');
    return {status:200,body:{token,email:u.email}};
  });
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const admin=(method,p,fn)=>route(method,p,async(req,body,params,url)=>{const a=await adminAuth(req);if(params.id&&!UUID.test(params.id)&&!p.startsWith('/api/admin/plans/'))throw fail(400,'BAD_ID','Bad id');return fn(a,body,params,url)});
  route('POST','/api/admin/logout',async(req)=>{
    const a=await adminAuth(req);
    const m=/^Bearer ([A-Za-z0-9_-]{20,80})$/.exec(req.headers.authorization||'');
    if(m)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[sha256(m[1])]);
    audit(a.email,'admin-logout');
    return {status:200,body:{ok:true}};
  });
  admin('GET','/api/admin/summary',async()=>{
    const q=await pool.query(`SELECT (SELECT count(*) FROM users WHERE role='client')::int clients,
      (SELECT count(*) FROM companies)::int companies,
      (SELECT count(*) FROM subscriptions WHERE period_end>now())::int active,
      (SELECT count(*) FROM subscriptions WHERE period_end<=now())::int expired,
      (SELECT count(*) FROM payments WHERE status='pending')::int pending,
      (SELECT count(*) FROM sub_requests WHERE status='pending')::int requests,
      (SELECT count(*) FROM subscriptions WHERE period_end>now() AND period_end<now()+interval '7 days')::int expiring,
      (SELECT coalesce(sum(amount),0) FROM payments WHERE status='confirmed' AND decided_at>now()-interval '30 days')::int revenue30,
      (SELECT count(*) FROM users WHERE role='client' AND id NOT IN (SELECT user_id FROM subscriptions))::int nosub`);
    return {status:200,body:q.rows[0]};
  });
  admin('GET','/api/admin/payments',async(a,b,p,url)=>{
    const st=url.searchParams.get('status')||'pending';
    const {rows}=await pool.query(`SELECT p.*,u.email,u.name,u.phone FROM payments p JOIN users u ON u.id=p.user_id WHERE ($1='all' OR p.status=$1) ORDER BY p.created_at DESC LIMIT 200`,[st]);
    return {status:200,body:rows};
  });
  admin('GET','/api/admin/users',async(a,b,p,url)=>{
    const q='%'+String(url.searchParams.get('q')||'').toLowerCase().replace(/[%_\\]/g,'')+'%';
    const cid=url.searchParams.get('company')||'';if(cid&&!UUID.test(cid))throw fail(400,'BAD_ID','Bad id');
    const {rows}=await pool.query(`SELECT u.id,u.email,u.name,u.phone,u.blocked,u.created_at,u.company_id,c.name AS company_name,s.plan_id,s.period_end,
      (SELECT count(*) FROM devices d WHERE d.user_id=u.id AND d.revoked=false)::int AS devices
      FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN companies c ON c.id=u.company_id
      WHERE u.role='client' AND ($2='' OR u.company_id::text=$2) AND (lower(u.email) LIKE $1 OR lower(u.name) LIKE $1 OR u.phone LIKE $1 OR lower(coalesce(c.name,'')) LIKE $1) ORDER BY u.created_at DESC LIMIT 300`,[q,cid]);
    return {status:200,body:rows};
  });
  admin('GET','/api/admin/users/:id',async(a,b,p)=>{
    if(!/^[0-9a-f-]{36}$/.test(p.id))throw fail(400,'BAD_ID','Bad id');
    const u=(await pool.query('SELECT u.id,u.email,u.name,u.phone,u.blocked,u.created_at,u.company_id,c.name AS company_name FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE u.id=$1',[p.id])).rows[0];
    if(!u)throw fail(404,'NOT_FOUND','No such user');
    const [sub,dev,pay]=await Promise.all([subscriptionOf(pool,p.id),pool.query('SELECT id,name,platform,revoked,first_seen,last_seen FROM devices WHERE user_id=$1 ORDER BY first_seen',[p.id]),pool.query('SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[p.id])]);
    return {status:200,body:{user:u,subscription:sub,devices:dev.rows,payments:pay.rows}};
  });
  admin('POST','/api/admin/payments/:id/confirm',async(a,b,p)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const pay=(await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[p.id])).rows[0];
      if(!pay){await client.query('ROLLBACK');throw fail(404,'NOT_FOUND','No such payment')}
      if(pay.status!=='pending'){await client.query('ROLLBACK');throw fail(409,'ALREADY_DECIDED','This payment was already '+pay.status)}
      const interval=pay.period==='yearly'?'1 year':'1 month';
      const r=await client.query(`INSERT INTO subscriptions(user_id,plan_id,period_end) VALUES($1,$2,now()+$3::interval)
        ON CONFLICT(user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,period_end=greatest(now(),subscriptions.period_end)+$3::interval,updated_at=now() RETURNING period_end`,[pay.user_id,pay.plan_id,interval]);
      await client.query("UPDATE payments SET status='confirmed',decided_at=now(),decided_by=$2 WHERE id=$1",[pay.id,a.id]);
      await client.query('COMMIT');
      audit(a.email,'payment-confirm',{payment:pay.id,user:pay.user_id,until:r.rows[0].period_end});
      return {status:200,body:{ok:true,periodEnd:r.rows[0].period_end}};
    }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  });
  admin('POST','/api/admin/payments/:id/reject',async(a,body,p)=>{
    const r=await pool.query("UPDATE payments SET status='rejected',note=$2,decided_at=now(),decided_by=$3 WHERE id=$1 AND status='pending'",[p.id,str(body.note,200),a.id]);
    if(!r.rowCount)throw fail(409,'ALREADY_DECIDED','Payment not pending');
    audit(a.email,'payment-reject',{payment:p.id});return {status:200,body:{ok:true}};
  });
  admin('POST','/api/admin/users/:id/block',async(a,body,p)=>{
    const block=body.blocked!==false;
    await pool.query("UPDATE users SET blocked=$2 WHERE id=$1 AND role='client'",[p.id,block]);
    audit(a.email,block?'user-block':'user-unblock',{user:p.id});return {status:200,body:{ok:true}};
  });
  admin('POST','/api/admin/users/:id/extend',async(a,body,p)=>{
    const days=Math.trunc(Number(body.days));if(!(days>=-3650&&days<=3650&&days!==0))throw fail(400,'BAD_DAYS','Days must be between -3650 and 3650.');
    const plan=str(body.plan,20)||'basic';
    if(!(await pool.query('SELECT 1 FROM plans WHERE id=$1',[plan])).rowCount)throw fail(400,'BAD_PLAN','Unknown plan');
    const r=await pool.query(`INSERT INTO subscriptions(user_id,plan_id,period_end) VALUES($1,$2,greatest(now(),now())+make_interval(days=>$3))
      ON CONFLICT(user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,period_end=greatest(now(),subscriptions.period_end)+make_interval(days=>$3),updated_at=now() RETURNING period_end`,[p.id,plan,days]);
    audit(a.email,'sub-extend',{user:p.id,days,plan});return {status:200,body:{ok:true,periodEnd:r.rows[0].period_end}};
  });
  admin('POST','/api/admin/users/:id/cancel',async(a,b,p)=>{
    await pool.query('UPDATE subscriptions SET period_end=now(),updated_at=now() WHERE user_id=$1',[p.id]);
    audit(a.email,'sub-cancel',{user:p.id});return {status:200,body:{ok:true}};
  });
  admin('POST','/api/admin/devices/:id/revoke',async(a,b,p)=>{
    await pool.query('UPDATE devices SET revoked=true WHERE id=$1',[p.id]);audit(a.email,'device-revoke',{device:p.id});return {status:200,body:{ok:true}};
  });
  admin('POST','/api/admin/users/:id/reset-devices',async(a,b,p)=>{
    await pool.query('UPDATE devices SET revoked=true WHERE user_id=$1',[p.id]);audit(a.email,'devices-reset',{user:p.id});return {status:200,body:{ok:true}};
  });
  admin('PUT','/api/admin/plans/:id',async(a,body,p)=>{
    const mx=Math.trunc(Number(body.maxDevices)),pm=Math.trunc(Number(body.priceMonthly)),py=Math.trunc(Number(body.priceYearly));
    if(!(mx>=1&&mx<=100&&pm>=0&&py>=0))throw fail(400,'BAD_PLAN','Invalid plan values.');
    const r=await pool.query('UPDATE plans SET max_devices=$2,price_monthly=$3,price_yearly=$4,name=COALESCE(NULLIF($5,\'\'),name) WHERE id=$1',[p.id,mx,pm,py,str(body.name,40)]);
    if(!r.rowCount)throw fail(404,'NOT_FOUND','No such plan');
    audit(a.email,'plan-edit',{plan:p.id,mx,pm,py});return {status:200,body:{ok:true}};
  });

  /* ----- subscription requests (the customer asks in the app, you allow or deny here) ----- */
  const grant=(db,userId,plan,interval)=>db.query(`INSERT INTO subscriptions(user_id,plan_id,period_end) VALUES($1,$2,now()+$3::interval)
    ON CONFLICT(user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,period_end=greatest(now(),subscriptions.period_end)+$3::interval,updated_at=now() RETURNING period_end`,[userId,plan,interval]);
  admin('GET','/api/admin/requests',async(a,b,p,url)=>{
    const st=url.searchParams.get('status')||'pending';
    const {rows}=await pool.query(`SELECT r.*,u.email,u.name,u.phone,c.name AS company_name FROM sub_requests r JOIN users u ON u.id=r.user_id LEFT JOIN companies c ON c.id=u.company_id WHERE ($1='all' OR r.status=$1) ORDER BY r.created_at DESC LIMIT 200`,[st]);
    return {status:200,body:rows};
  });
  admin('POST','/api/admin/requests/:id/allow',async(a,body,p)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const r=(await client.query('SELECT * FROM sub_requests WHERE id=$1 FOR UPDATE',[p.id])).rows[0];
      if(!r){await client.query('ROLLBACK');throw fail(404,'NOT_FOUND','No such request')}
      if(r.status!=='pending'){await client.query('ROLLBACK');throw fail(409,'ALREADY_DECIDED','This request was already '+r.status)}
      const days=body.days===undefined||body.days===''||body.days===null?null:Math.trunc(Number(body.days));
      if(days!==null&&!(days>=1&&days<=3650)){await client.query('ROLLBACK');throw fail(400,'BAD_DAYS','Days must be between 1 and 3650.')}
      const interval=days?`${days} days`:(r.period==='yearly'?'1 year':'1 month');
      const g=await grant(client,r.user_id,r.plan_id,interval);
      await client.query("UPDATE sub_requests SET status='allowed',decided_at=now(),decided_by=$2 WHERE id=$1",[r.id,a.id]);
      await client.query('COMMIT');
      audit(a.email,'request-allow',{request:r.id,user:r.user_id,plan:r.plan_id,interval,until:g.rows[0].period_end});
      return {status:200,body:{ok:true,periodEnd:g.rows[0].period_end}};
    }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
  });
  admin('POST','/api/admin/requests/:id/deny',async(a,body,p)=>{
    const r=await pool.query("UPDATE sub_requests SET status='denied',reason=$2,decided_at=now(),decided_by=$3 WHERE id=$1 AND status='pending'",[p.id,str(body.note,200),a.id]);
    if(!r.rowCount)throw fail(409,'ALREADY_DECIDED','Request not pending');
    audit(a.email,'request-deny',{request:p.id});return {status:200,body:{ok:true}};
  });

  /* ----- companies ----- */
  const companyFields=b=>({name:str(b.name,100),contact:str(b.contact,80),phone:str(b.phone,20),email:str(b.email,254),address:str(b.address,200),notes:str(b.notes,500)});
  admin('GET','/api/admin/companies',async(a,b,p,url)=>{
    const q='%'+String(url.searchParams.get('q')||'').toLowerCase().replace(/[%_\\]/g,'')+'%';
    const {rows}=await pool.query(`SELECT c.*,
      (SELECT count(*) FROM users u WHERE u.company_id=c.id)::int AS users,
      (SELECT count(*) FROM users u JOIN subscriptions s ON s.user_id=u.id WHERE u.company_id=c.id AND s.period_end>now())::int AS active,
      (SELECT max(s.period_end) FROM users u JOIN subscriptions s ON s.user_id=u.id WHERE u.company_id=c.id) AS latest_end
      FROM companies c WHERE lower(c.name) LIKE $1 OR lower(c.contact) LIKE $1 OR c.phone LIKE $1 ORDER BY c.created_at DESC LIMIT 300`,[q]);
    return {status:200,body:rows};
  });
  admin('POST','/api/admin/companies',async(a,body)=>{
    const f=companyFields(body);if(!f.name)throw fail(400,'BAD_NAME','Enter the company name.');
    try{const r=await pool.query('INSERT INTO companies(name,contact,phone,email,address,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[f.name,f.contact,f.phone,f.email,f.address,f.notes]);
      audit(a.email,'company-create',{company:r.rows[0].id,name:f.name});return {status:201,body:{ok:true,id:r.rows[0].id}}}
    catch(e){if(e.code==='23505')throw fail(409,'COMPANY_EXISTS','A company with this name already exists.');throw e}
  });
  admin('GET','/api/admin/companies/:id',async(a,b,p)=>{
    const c=(await pool.query('SELECT * FROM companies WHERE id=$1',[p.id])).rows[0];if(!c)throw fail(404,'NOT_FOUND','No such company');
    const users=(await pool.query(`SELECT u.id,u.email,u.name,u.phone,u.blocked,s.plan_id,s.period_end FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE u.company_id=$1 ORDER BY u.created_at`,[p.id])).rows;
    return {status:200,body:{company:c,users}};
  });
  admin('PUT','/api/admin/companies/:id',async(a,body,p)=>{
    const f=companyFields(body);if(!f.name)throw fail(400,'BAD_NAME','Enter the company name.');
    try{const r=await pool.query('UPDATE companies SET name=$2,contact=$3,phone=$4,email=$5,address=$6,notes=$7 WHERE id=$1',[p.id,f.name,f.contact,f.phone,f.email,f.address,f.notes]);
      if(!r.rowCount)throw fail(404,'NOT_FOUND','No such company');}
    catch(e){if(e.code==='23505')throw fail(409,'COMPANY_EXISTS','A company with this name already exists.');throw e}
    audit(a.email,'company-edit',{company:p.id});return {status:200,body:{ok:true}};
  });
  admin('POST','/api/admin/companies/:id/block',async(a,body,p)=>{
    const block=body.blocked!==false;const r=await pool.query('UPDATE companies SET blocked=$2 WHERE id=$1',[p.id,block]);
    if(!r.rowCount)throw fail(404,'NOT_FOUND','No such company');
    audit(a.email,block?'company-block':'company-unblock',{company:p.id});return {status:200,body:{ok:true}};
  });
  admin('POST','/api/admin/companies/:id/delete',async(a,b,p)=>{
    if((await pool.query('SELECT 1 FROM users WHERE company_id=$1 LIMIT 1',[p.id])).rowCount)throw fail(409,'HAS_USERS','Move or remove this company\'s users first.');
    await pool.query('DELETE FROM companies WHERE id=$1',[p.id]);audit(a.email,'company-delete',{company:p.id});return {status:200,body:{ok:true}};
  });

  /* ----- users: create, edit, reset password ----- */
  const companyOrNull=async v=>{if(v===undefined||v===null||v==='')return null;if(!UUID.test(String(v)))throw fail(400,'BAD_ID','Bad company');if(!(await pool.query('SELECT 1 FROM companies WHERE id=$1',[v])).rowCount)throw fail(400,'BAD_COMPANY','Unknown company');return v};
  admin('POST','/api/admin/users',async(a,body)=>{
    const email=str(body.email,254).toLowerCase(),password=String(body.password||''),name=str(body.name,80),phone=str(body.phone,20);
    if(!EMAIL.test(email))throw fail(400,'BAD_EMAIL','Enter a valid email address.');
    if(password.length<10||password.length>128)throw fail(400,'WEAK_PASSWORD','Password must be 10 to 128 characters.');
    if(!name)throw fail(400,'BAD_NAME','Enter the user name.');
    const companyId=await companyOrNull(body.companyId);
    const plan=str(body.plan,20),days=body.days===undefined||body.days===''?0:Math.trunc(Number(body.days));
    if(days&&!(days>=1&&days<=3650))throw fail(400,'BAD_DAYS','Days must be between 1 and 3650.');
    if(days&&!(await pool.query('SELECT 1 FROM plans WHERE id=$1',[plan])).rowCount)throw fail(400,'BAD_PLAN','Choose a plan for the subscription.');
    let id;
    try{id=(await pool.query('INSERT INTO users(email,password_hash,name,phone,company_id) VALUES($1,$2,$3,$4,$5) RETURNING id',[email,await hashPassword(password),name,phone,companyId])).rows[0].id}
    catch(e){if(e.code==='23505')throw fail(409,'EMAIL_EXISTS','An account with this email already exists.');throw e}
    if(days)await grant(pool,id,plan,`${days} days`);
    audit(a.email,'user-create',{user:id,company:companyId,plan:days?plan:null,days});return {status:201,body:{ok:true,id}};
  });
  admin('PUT','/api/admin/users/:id',async(a,body,p)=>{
    const name=str(body.name,80),phone=str(body.phone,20);if(!name)throw fail(400,'BAD_NAME','Enter the user name.');
    const companyId=await companyOrNull(body.companyId);
    const r=await pool.query("UPDATE users SET name=$2,phone=$3,company_id=$4 WHERE id=$1 AND role='client'",[p.id,name,phone,companyId]);
    if(!r.rowCount)throw fail(404,'NOT_FOUND','No such user');
    audit(a.email,'user-edit',{user:p.id,company:companyId});return {status:200,body:{ok:true}};
  });
  admin('POST','/api/admin/users/:id/password',async(a,body,p)=>{
    const password=String(body.password||'');if(password.length<10||password.length>128)throw fail(400,'WEAK_PASSWORD','Password must be 10 to 128 characters.');
    const r=await pool.query("UPDATE users SET password_hash=$2,failed_logins=0,locked_until=NULL WHERE id=$1 AND role='client'",[p.id,await hashPassword(password)]);
    if(!r.rowCount)throw fail(404,'NOT_FOUND','No such user');
    audit(a.email,'user-password-reset',{user:p.id});return {status:200,body:{ok:true}};
  });
  admin('GET','/api/admin/audit',async()=>({status:200,body:(await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200')).rows}));

  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://x');
      if(req.method==='GET'&&(url.pathname==='/admin'||url.pathname==='/admin/')){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
          'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
        return res.end(adminHtml);
      }
      if(downloads(req,res,url))return;
      if(!url.pathname.startsWith('/api/'))return send(res,404,{code:'NOT_FOUND'});
      const r=routes.find(x=>x.method===req.method&&x.re.test(url.pathname));
      if(!r)return send(res,404,{code:'NOT_FOUND',message:'Unknown endpoint'});
      const body=await readBody(req);
      const out=await r.handler(req,body,r.re.exec(url.pathname).groups||{},url);
      send(res,out.status,out.body);
    }catch(e){
      if(e.status)return send(res,e.status,{ok:false,code:e.code,message:e.message});
      console.error('[error]',e);send(res,500,{ok:false,code:'SERVER_ERROR',message:'Something went wrong. Try again.'});
    }
  });
  server.headersTimeout=15000;server.requestTimeout=20000;
  return server;
}
module.exports={createApp,GRACE_MS};
