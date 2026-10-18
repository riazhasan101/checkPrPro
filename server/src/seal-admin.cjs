'use strict';
/* Removes ADMIN_PASSWORD from server/.env after the first admin sign-in.
   Run this only after you have signed in at /admin. The password hash stays in the database. */
const fs=require('node:fs');
const path=require('node:path');

function sealAdminEnv(file){
  if(!fs.existsSync(file))return 'missing';
  const src=fs.readFileSync(file,'utf8');
  if(!/^ADMIN_PASSWORD=\S+/m.test(src))return 'absent';
  fs.writeFileSync(file,src.replace(/^ADMIN_PASSWORD=.*(?:\r?\n)?/m,''),{mode:0o600});
  return 'removed';
}

if(require.main===module){
  const file=path.join(__dirname,'..','.env');
  const result=sealAdminEnv(file);
  if(result==='missing'){console.error('server/.env was not found. Copy .env.example to .env first.');process.exit(1)}
  if(result==='absent'){console.log('ADMIN_PASSWORD is already absent from server/.env.');process.exit(0)}
  console.log('Removed ADMIN_PASSWORD from server/.env. Restart with: docker compose up -d');
  console.log('Do this only after a successful sign-in. If the admin account was never created, put the password back before the first start.');
}
module.exports={sealAdminEnv};
