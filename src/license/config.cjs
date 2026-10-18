'use strict';
/* Address of your licence server (must be https in a real build). Developers may override it with CHECKPRINT_LICENSE_URL; a packaged app ignores the override. */
const DEFAULT_URL='https://license.example.com';
function serverUrl(isPackaged){
  const u=(!isPackaged&&process.env.CHECKPRINT_LICENSE_URL)||DEFAULT_URL;
  return u.replace(/\/+$/,'');
}
module.exports={DEFAULT_URL,serverUrl};
