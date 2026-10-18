'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {adminBoot}=require('../server/src/boot.cjs');
const {sealAdminEnv}=require('../server/src/seal-admin.cjs');
const {normaliseLicenseUrl,writeLicenseUrl}=require('../scripts/set-license-url.cjs');

test('embedded licence key is Ed25519 and is not a private key',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../src/license/pubkey.cjs'),'utf8');
  assert.equal(src.includes('PRIVATE'),false);
  assert.equal(src.includes('REPLACE_WITH_PUBLIC_KEY'),false);
  const {PEM}=require('../src/license/pubkey.cjs');
  const key=crypto.createPublicKey(PEM);
  assert.equal(key.type,'public');
  assert.equal(key.asymmetricKeyType,'ed25519');
});

test('admin password is accepted only long enough to create the first admin',()=>{
  assert.equal(adminBoot({hasAdmin:false,email:'',password:''}),'bootstrap');
  assert.equal(adminBoot({hasAdmin:false,email:'a@b.co',password:'short'}),'bootstrap');
  assert.equal(adminBoot({hasAdmin:false,email:'a@b.co',password:'long-enough-pw'}),'create');
  assert.equal(adminBoot({hasAdmin:true,email:'a@b.co',password:'long-enough-pw'}),'strip-password');
  assert.equal(adminBoot({hasAdmin:true,email:'a@b.co',password:''}),'ok');
});

test('seal-admin deletes the password line and does not echo it',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-'));
  const file=path.join(dir,'.env');
  fs.writeFileSync(file,'DB_PASSWORD=abc\nADMIN_PASSWORD=super-secret-value\nADMIN_EMAIL=a@b.co\n');
  assert.equal(sealAdminEnv(file),'removed');
  const text=fs.readFileSync(file,'utf8');
  assert.equal(text.includes('super-secret-value'),false);
  assert.equal(text.includes('ADMIN_PASSWORD'),false);
  assert.match(text,/ADMIN_EMAIL=a@b.co/);
  assert.equal(sealAdminEnv(file),'absent');
  fs.rmSync(dir,{recursive:true,force:true});
});

test('licence url rejects placeholders and paths',()=>{
  assert.equal(normaliseLicenseUrl('https://license.riyashop.com/'),'https://license.riyashop.com');
  assert.equal(normaliseLicenseUrl('https://License.RiyaShop.com'),'https://license.riyashop.com');
  for(const bad of ['https://license.example.com','http://license.riyashop.com','https://localhost','https://license.riyashop.com/admin','not a url',''])assert.throws(()=>normaliseLicenseUrl(bad),bad);
});

test('writeLicenseUrl replaces only the server constant',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'licurl-'));
  const file=path.join(dir,'config.cjs');
  fs.writeFileSync(file,"const DEFAULT_URL='https://license.example.com';\nmodule.exports={DEFAULT_URL};\n");
  writeLicenseUrl('https://license.riyashop.com',file);
  assert.match(fs.readFileSync(file,'utf8'),/const DEFAULT_URL="https:\/\/license\.riyashop\.com"/);
  fs.rmSync(dir,{recursive:true,force:true});
});

test('protected build refuses the placeholder server without producing build-app',()=>{
  const {DEFAULT_URL}=require('../src/license/config.cjs');
  if(!/example\.com/.test(DEFAULT_URL))return;
  const r=spawnSync(process.execPath,[path.join(__dirname,'../scripts/protect.cjs')],{encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/placeholder/);
  assert.equal(fs.existsSync(path.join(__dirname,'../build-app')),false);
});
