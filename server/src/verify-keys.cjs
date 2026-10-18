'use strict';
/* Confirms server/.env's private key matches the public key shipped in the desktop app. Prints nothing secret. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const envPath=path.join(__dirname,'..','.env');
if(!fs.existsSync(envPath)){console.error('server/.env was not found.');process.exit(1)}
const env=fs.readFileSync(envPath,'utf8');
const line=env.match(/^LICENSE_PRIVATE_KEY=(.*)$/m);
if(!line||!line[1].includes('BEGIN PRIVATE KEY')){console.error('LICENSE_PRIVATE_KEY is missing from server/.env.');process.exit(1)}
let derived;
try{derived=crypto.createPublicKey(crypto.createPrivateKey(line[1].replace(/\\n/g,'\n'))).export({type:'spki',format:'pem'}).trim()}
catch{console.error('LICENSE_PRIVATE_KEY could not be read as an Ed25519 private key.');process.exit(1)}
const embedded=require('../../src/license/pubkey.cjs').PEM.trim();
if(derived!==embedded){console.error('The public key in src/license/pubkey.cjs does not match server/.env.');process.exit(1)}
if(embedded.includes('PRIVATE')){console.error('The desktop public key file contains private key material.');process.exit(1)}
console.log('Licence key pair matches. The private key is only in server/.env.');
