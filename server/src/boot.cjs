'use strict';
/* First boot may hold ADMIN_PASSWORD only long enough to create the admin user.
   After that account exists, a later start must refuse while the plaintext password is still in the environment. */
function adminBoot({hasAdmin,email,password}){
  const pw=String(password||'');
  if(!hasAdmin){
    if(!String(email||'').trim()||pw.length<12)return 'bootstrap';
    return 'create';
  }
  if(pw.length)return 'strip-password';
  return 'ok';
}
module.exports={adminBoot};
