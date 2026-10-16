'use strict';
const link=process.env.CSC_LINK||process.env.WIN_CSC_LINK;
const password=process.env.CSC_KEY_PASSWORD||process.env.WIN_CSC_KEY_PASSWORD;
if(!link||!password){
  console.error('A Windows code-signing certificate is required. Set CSC_LINK (or WIN_CSC_LINK) to the .pfx file or its base64 text, and CSC_KEY_PASSWORD (or WIN_CSC_KEY_PASSWORD) to the certificate password. Do not commit the certificate.');
  process.exit(1);
}
console.log('Code-signing certificate environment variables are set.');
