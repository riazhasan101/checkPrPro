'use strict';
const {createPool,migrate}=require('./db.cjs');
const {createApp}=require('./app.cjs');
const {hashPassword}=require('./crypto.cjs');
(async()=>{
  const need=n=>{if(!process.env[n]){console.error('Missing environment variable '+n);process.exit(1)}return process.env[n]};
  const pool=createPool(need('DATABASE_URL'));
  const privateKey=need('LICENSE_PRIVATE_KEY').replace(/\\n/g,'\n');
  await migrate(pool);
  const has=(await pool.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1")).rowCount;
  if(!has&&process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD){
    if(process.env.ADMIN_PASSWORD.length<12){console.error('ADMIN_PASSWORD must be at least 12 characters');process.exit(1)}
    await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,'Administrator','admin')",[process.env.ADMIN_EMAIL.toLowerCase(),await hashPassword(process.env.ADMIN_PASSWORD)]);
    console.log('Admin account created for '+process.env.ADMIN_EMAIL+'. Remove ADMIN_PASSWORD from the environment now.');
  }
  const port=Number(process.env.PORT||8080);
  createApp({pool,privateKey}).listen(port,'0.0.0.0',()=>console.log('CheckPrint licence server on :'+port));
})().catch(e=>{console.error(e);process.exit(1)});
