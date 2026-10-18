'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {verifyToken}=require('./token.cjs');
const {evaluate}=require('./evaluate.cjs');

class LicenseManager{
  constructor({dir,safeStorage,serverUrl,publicKey,fingerprint,deviceName,platform,now=()=>Date.now(),fetchImpl=globalThis.fetch,allowHttp=false}){
    Object.assign(this,{dir,safeStorage,serverUrl,publicKey,fp:fingerprint,deviceName:deviceName||'',platform:platform||'',now,fetchImpl});
    if(!/^https:\/\//i.test(serverUrl)&&!(allowHttp&&/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(serverUrl)))this.insecure=true;
    this.file=path.join(dir,'licence.bin');this.state={};this.lastPersist=0;this.load();
  }
  /* ---- storage: encrypted with the OS keystore when there is one, otherwise with a key derived from this computer ---- */
  _key(){return crypto.createHash('sha256').update('checkprint-local|'+this.fp).digest()}
  load(){
    try{
      const raw=fs.readFileSync(this.file);
      let json;
      if(raw[0]===0x01&&this.safeStorage&&this.safeStorage.isEncryptionAvailable())json=this.safeStorage.decryptString(raw.subarray(1));
      else if(raw[0]===0x02){const iv=raw.subarray(1,13),tag=raw.subarray(13,29),d=crypto.createDecipheriv('aes-256-gcm',this._key(),iv);d.setAuthTag(tag);json=Buffer.concat([d.update(raw.subarray(29)),d.final()]).toString('utf8')}
      this.state=json?JSON.parse(json):{};
    }catch{this.state={}}
  }
  save(){
    fs.mkdirSync(this.dir,{recursive:true});
    const json=JSON.stringify(this.state);let out;
    if(this.safeStorage&&this.safeStorage.isEncryptionAvailable())out=Buffer.concat([Buffer.from([1]),this.safeStorage.encryptString(json)]);
    else{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',this._key(),iv),enc=Buffer.concat([c.update(json,'utf8'),c.final()]);out=Buffer.concat([Buffer.from([2]),iv,c.getAuthTag(),enc])}
    const tmp=this.file+'.tmp';fs.writeFileSync(tmp,out,{mode:0o600});fs.renameSync(tmp,this.file);this.lastPersist=this.now();
  }
  /* ---- decision (offline) ---- */
  payload(){return this.state.token?verifyToken(this.state.token,this.publicKey):null}
  check(){
    const now=this.now(),res=evaluate({payload:this.payload(),fp:crypto.createHash('sha256').update(this.fp).digest('hex').slice(0,24),now,lastSeen:this.state.lastSeen});
    if(res.ok&&now-this.lastPersist>60000){this.state.lastSeen=Math.max(this.state.lastSeen||0,now);try{this.save()}catch{}}
    return res;
  }
  isValid(){return this.check().ok}
  info(){const c=this.check();return {...c,email:this.state.email||'',signedIn:!!this.state.deviceId}}
  /* ---- network ---- */
  async _call(method,pathname,body,withDevice){
    if(this.insecure)throw Object.assign(new Error('The licence server address must start with https://'),{code:'INSECURE'});
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),12000);
    try{
      const headers={'Content-Type':'application/json'};
      if(withDevice){if(!this.state.deviceId)throw Object.assign(new Error('Sign in first.'),{code:'UNAUTHORIZED'});headers.Authorization=`Device ${this.state.deviceId}.${this.state.deviceSecret}`}
      const r=await this.fetchImpl(this.serverUrl+pathname,{method,headers,body:body?JSON.stringify(body):undefined,signal:ctl.signal,redirect:'error'});
      const j=await r.json().catch(()=>({}));
      return {status:r.status,body:j};
    }catch(e){
      if(e.code)throw e;
      throw Object.assign(new Error('Cannot reach the licence server. Check the internet connection.'),{code:'NETWORK'});
    }finally{clearTimeout(t)}
  }
  _adopt(res){
    const b=res.body;
    if(b.ok&&b.token){
      const p=verifyToken(b.token,this.publicKey);
      if(!p)throw Object.assign(new Error('The licence server answer could not be verified.'),{code:'BAD_SIGNATURE'});
      this.state.token=b.token;this.state.lastSeen=Math.max(this.state.lastSeen||0,this.now());
    }else{delete this.state.token}
    this.save();
  }
  async activate(email,password){
    const res=await this._call('POST','/api/device/activate',{email,password,fp:this.fp,deviceName:this.deviceName,platform:this.platform});
    if(res.status>=400&&!res.body.deviceId)return {ok:false,code:res.body.code||'ERROR',message:res.body.message||'Sign-in failed.'};
    if(res.body.deviceId){this.state.deviceId=res.body.deviceId;this.state.deviceSecret=res.body.deviceSecret;this.state.email=email}
    this._adopt(res);
    return {ok:!!res.body.ok,code:res.body.code||'OK',message:res.body.message||'',subscription:res.body.subscription};
  }
  /* Background refresh. A network failure keeps the old licence (the signed 7-day window still applies); a server "no" removes it at once. */
  async refresh(){
    if(!this.state.deviceId)return {ok:false,code:'NO_LICENCE'};
    try{
      const res=await this._call('POST','/api/license/refresh',{fp:this.fp},true);
      if(res.status===401){this.state={lastSeen:this.state.lastSeen};this.save();return {ok:false,code:'UNAUTHORIZED',message:res.body.message}}
      if(res.status>=400)return {ok:false,code:res.body.code||'ERROR',message:res.body.message};
      this._adopt(res);return {ok:!!res.body.ok,code:res.body.code||'OK',message:res.body.message||''};
    }catch(e){return {ok:false,code:e.code||'NETWORK',message:e.message,offline:true}}
  }
  async me(){const r=await this._call('GET','/api/me',null,true);if(r.status===401){this.state={lastSeen:this.state.lastSeen};this.save()}return r.status<400?{ok:true,...r.body}:{ok:false,code:r.body.code,message:r.body.message}}
  async config(){const r=await this._call('GET','/api/config');return r.body}
  async register(data){const r=await this._call('POST','/api/auth/register',data);return r.status<400?{ok:true}:{ok:false,code:r.body.code,message:r.body.message}}
  async requestSubscription(data){const r=await this._call('POST','/api/subscription/request',data,true);return r.status<400?{ok:true}:{ok:false,code:r.body.code,message:r.body.message}}
  async submitPayment(data){const r=await this._call('POST','/api/payments',data,true);return r.status<400?{ok:true,...r.body}:{ok:false,code:r.body.code,message:r.body.message}}
  async removeDevice(id){const r=await this._call('POST',`/api/devices/${encodeURIComponent(id)}/revoke`,null,true);return r.status<400?{ok:true}:{ok:false,code:r.body.code,message:r.body.message}}
  signOut(){this.state={lastSeen:this.state.lastSeen};this.save()}
}
module.exports={LicenseManager};
