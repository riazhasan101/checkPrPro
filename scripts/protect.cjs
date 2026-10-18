'use strict';
/* Builds the protected copy of the app in ./build-app :
   1. refuses to continue while the licence public key or server address are still placeholders,
   2. copies the app files, 3. obfuscates every file in src/, 4. installs production dependencies.
   Then `npm run build:protected` packages build-app with electron-builder. */
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const JavaScriptObfuscator=require('javascript-obfuscator');
const root=path.join(__dirname,'..'),out=path.join(root,'build-app');

const pub=fs.readFileSync(path.join(root,'src/license/pubkey.cjs'),'utf8');
if(/REPLACE_WITH_PUBLIC_KEY`/.test(pub)&&!process.env.CHECKPRINT_PUBKEY_PEM){console.error('STOP: src/license/pubkey.cjs still holds the placeholder. Run "npm run keygen" in server/ and paste the public key.');process.exit(1)}
const cfg=fs.readFileSync(path.join(root,'src/license/config.cjs'),'utf8');
if(/license\.example\.com/.test(cfg)){console.error('STOP: src/license/config.cjs still points to license.example.com. Put your real https:// licence server address there.');process.exit(1)}

fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
fs.cpSync(path.join(root,'src'),path.join(out,'src'),{recursive:true});
for(const f of ['index.html','license.html'])fs.copyFileSync(path.join(root,f),path.join(out,f));
const pkg=require('../package.json');
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,main:pkg.main,author:pkg.author||'CheckPrint',dependencies:pkg.dependencies},null,2));

const opts={
  target:'node',compact:true,simplify:true,renameGlobals:false,identifierNamesGenerator:'hexadecimal',
  controlFlowFlattening:true,controlFlowFlatteningThreshold:0.5,deadCodeInjection:true,deadCodeInjectionThreshold:0.2,
  stringArray:true,stringArrayEncoding:['base64'],stringArrayThreshold:0.8,stringArrayRotate:true,stringArrayShuffle:true,
  splitStrings:true,splitStringsChunkLength:8,transformObjectKeys:false,unicodeEscapeSequence:false,numbersToExpressions:true,
  /* Electron/Node module names and IPC channel strings must stay readable to the runtime; the obfuscator keeps require() targets as written. */
  reservedStrings:[]
};
let n=0;
(function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.cjs')){fs.writeFileSync(p,JavaScriptObfuscator.obfuscate(fs.readFileSync(p,'utf8'),opts).getObfuscatedCode());n++}}})(path.join(out,'src'));
console.log('Obfuscated '+n+' files.');
execFileSync(process.platform==='win32'?'npm.cmd':'npm',['install','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:out,stdio:'inherit',shell:process.platform==='win32'});
console.log('Protected app ready in build-app/');
