'use strict';
/* Run once on the server: node src/keygen.cjs
   Keep licence-private.pem secret (put it in the LICENSE_PRIVATE_KEY environment variable). Copy the public key into ../src/license/pubkey.cjs. */
const crypto=require('node:crypto');const fs=require('node:fs');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const priv=privateKey.export({type:'pkcs8',format:'pem'}),pub=publicKey.export({type:'spki',format:'pem'});
fs.writeFileSync('licence-private.pem',priv,{mode:0o600});fs.writeFileSync('licence-public.pem',pub);
console.log('Wrote licence-private.pem (SECRET) and licence-public.pem.\n\nPublic key to paste into src/license/pubkey.cjs:\n\n'+pub);
