'use strict';
const crypto=require('node:crypto');
/* Only verifies. Tokens are signed on the server with the private key, which never ships in the app. */
function verifyToken(token,publicKeyPem){
  const [body,sig]=String(token||'').split('.');if(!body||!sig)return null;
  try{
    if(!crypto.verify(null,Buffer.from(body),crypto.createPublicKey(publicKeyPem),Buffer.from(sig,'base64url')))return null;
    return JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  }catch{return null}
}
module.exports={verifyToken};
