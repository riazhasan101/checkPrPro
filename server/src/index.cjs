'use strict';
const {createPool,migrate}=require('./db.cjs');
const {createApp}=require('./app.cjs');
const {hashPassword}=require('./crypto.cjs');
const {adminBoot}=require('./boot.cjs');
(async()=>{
  const need=n=>{if(!process.env[n]){console.error('Missing environment variable '+n);process.exit(1)}return process.env[n]};
  const pool=createPool(need('DATABASE_URL'));
  const privateKey=need('LICENSE_PRIVATE_KEY').replace(/\\n/g,'\n');
  await migrate(pool);
  const has=(await pool.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1")).rowCount>0;
  const boot=adminBoot({hasAdmin:has,email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});
  if(boot==='bootstrap'){console.error('No admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) for the first start only.');process.exit(1)}
  if(boot==='strip-password'){console.error('ADMIN_PASSWORD is still set after the admin account was created. Run npm run seal-admin, then start again.');process.exit(1)}
  if(boot==='create'){
    await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,'Administrator','admin')",[process.env.ADMIN_EMAIL.toLowerCase(),await hashPassword(process.env.ADMIN_PASSWORD)]);
    delete process.env.ADMIN_PASSWORD;
    console.log('Admin account created for '+process.env.ADMIN_EMAIL+'. Sign in at /admin, run npm run seal-admin, then restart. The next start refuses to run while ADMIN_PASSWORD is set.');
  }
  const port=Number(process.env.PORT||8080);
  createApp({pool,privateKey}).listen(port,'0.0.0.0',()=>console.log('CheckPrint licence server on :'+port));
})().catch(e=>{console.error(e);process.exit(1)});
