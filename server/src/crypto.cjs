'use strict';
const crypto=require('node:crypto');
const b64u=b=>Buffer.from(b).toString('base64url');
const SCRYPT={N:16384,r:8,p:1,keylen:64};
function scrypt(pw,salt,o){return new Promise((res,rej)=>crypto.scrypt(pw,salt,o.keylen,{N:o.N,r:o.r,p:o.p,maxmem:64*1024*1024},(e,k)=>e?rej(e):res(k)))}
async function hashPassword(pw){const salt=crypto.randomBytes(16);const k=await scrypt(pw,salt,SCRYPT);return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${k.toString('base64')}`}
async function verifyPassword(pw,stored){
  const p=String(stored||'').split('$');
  if(p.length!==6||p[0]!=='scrypt')return false;
  const o={N:+p[1],r:+p[2],p:+p[3],keylen:64};
  const want=Buffer.from(p[5],'base64'),got=await scrypt(pw,Buffer.from(p[4],'base64'),o);
  return want.length===got.length&&crypto.timingSafeEqual(want,got);
}
const DUMMY=hashPassword('dummy-password-for-timing');
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const randomToken=(n=32)=>crypto.randomBytes(n).toString('base64url');
function safeEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
/* Licence token = base64url(JSON payload) . base64url(Ed25519 signature). The desktop app only holds the PUBLIC key. */
function signToken(payload,privateKeyPem){
  const body=b64u(JSON.stringify(payload));
  const sig=crypto.sign(null,Buffer.from(body),crypto.createPrivateKey(privateKeyPem));
  return body+'.'+b64u(sig);
}
function verifyToken(token,publicKeyPem){
  const [body,sig]=String(token||'').split('.');if(!body||!sig)return null;
  try{
    if(!crypto.verify(null,Buffer.from(body),crypto.createPublicKey(publicKeyPem),Buffer.from(sig,'base64url')))return null;
    return JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  }catch{return null}
}
module.exports={hashPassword,verifyPassword,DUMMY,sha256,randomToken,safeEqual,signToken,verifyToken};
