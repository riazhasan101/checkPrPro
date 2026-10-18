'use strict';
/* Writes the packaged app's licence server origin into src/license/config.cjs.
   Usage: node scripts/set-license-url.cjs https://license.yourdomain.com */
const fs=require('node:fs');
const path=require('node:path');

function normaliseLicenseUrl(raw){
  const url=String(raw||'').trim().replace(/\/+$/,'');
  let parsed;
  try{parsed=new URL(url)}catch{throw new Error('Usage: node scripts/set-license-url.cjs https://license.yourdomain.com')}
  const host=parsed.hostname.toLowerCase();
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||(parsed.pathname!=='/'&&parsed.pathname!==''))throw new Error('The licence server must be an https origin, for example https://license.yourdomain.com');
  if(!host.includes('.')||host==='license.example.com'||host==='example.com'||host.endsWith('.example.com')||host==='localhost'||host==='127.0.0.1')throw new Error('Replace the placeholder with the hostname that points at your VPS.');
  return parsed.origin;
}

function writeLicenseUrl(url,file){
  const src=fs.readFileSync(file,'utf8');
  if(!/const DEFAULT_URL=/.test(src))throw new Error('DEFAULT_URL is missing from src/license/config.cjs');
  const next=src.replace(/const DEFAULT_URL=(?:'[^']*'|"[^"]*"|`[^`]*`)/,'const DEFAULT_URL='+JSON.stringify(url));
  if(!next.includes('const DEFAULT_URL='+JSON.stringify(url)))throw new Error('Could not update src/license/config.cjs');
  fs.writeFileSync(file,next);
}

if(require.main===module){
  try{
    const url=normaliseLicenseUrl(process.argv[2]);
    writeLicenseUrl(url,path.join(__dirname,'..','src/license/config.cjs'));
    console.log('Licence server set to '+url);
  }catch(e){console.error(e.message);process.exit(1)}
}
module.exports={normaliseLicenseUrl,writeLicenseUrl};
