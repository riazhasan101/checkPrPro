'use strict';
/* electron-builder afterPack hook: switches off the Electron features an attacker would use to run the app under their own control. */
const path=require('node:path');
const {flipFuses,FuseVersion,FuseV1Options}=require('@electron/fuses');
exports.default=async function(context){
  const {electronPlatformName:plat,appOutDir,packager}=context;
  const name=packager.appInfo.productFilename;
  const exe=plat==='win32'?path.join(appOutDir,name+'.exe'):plat==='darwin'?path.join(appOutDir,name+'.app/Contents/MacOS/'+name):path.join(appOutDir,packager.executableName);
  await flipFuses(exe,{
    version:FuseVersion.V1,
    resetAdHocDarwinSignature:plat==='darwin',
    [FuseV1Options.RunAsNode]:false,                         // "ELECTRON_RUN_AS_NODE" can no longer turn the exe into a plain Node shell
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,
    [FuseV1Options.EnableNodeCliInspectArguments]:false,     // no --inspect debugging
    [FuseV1Options.EnableCookieEncryption]:true,
    [FuseV1Options.OnlyLoadAppFromAsar]:true,                // cannot be pointed at a loose, edited app folder
    /* Detects edits to app.asar. Switch on with CHECKPRINT_ASAR_INTEGRITY=1 after confirming the installer starts on a clean Windows PC. */
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:process.env.CHECKPRINT_ASAR_INTEGRITY==='1'
  });
};
