'use strict';
const crypto=require('node:crypto');const fs=require('node:fs');const os=require('node:os');const {execFileSync}=require('node:child_process');
function rawMachineId(){
  try{
    if(process.platform==='win32'){
      const out=execFileSync('reg',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],{encoding:'utf8',windowsHide:true,timeout:5000});
      const m=/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/.exec(out);if(m)return m[1];
    }else if(process.platform==='darwin'){
      const out=execFileSync('ioreg',['-rd1','-c','IOPlatformExpertDevice'],{encoding:'utf8',timeout:5000});
      const m=/"IOPlatformUUID" = "([0-9A-F-]+)"/.exec(out);if(m)return m[1];
    }else{
      for(const f of ['/etc/machine-id','/var/lib/dbus/machine-id']){try{const v=fs.readFileSync(f,'utf8').trim();if(v)return v}catch{}}
    }
  }catch{}
  return '';
}
/* A stable id for this computer, hashed so the raw machine GUID never leaves it. */
function fingerprint(){
  const id=rawMachineId()||('fallback|'+os.hostname()+'|'+os.cpus().map(c=>c.model).slice(0,1).join()+'|'+os.totalmem());
  return crypto.createHash('sha256').update('checkprint-device-v1|'+id).digest('hex');
}
module.exports={fingerprint,rawMachineId};
