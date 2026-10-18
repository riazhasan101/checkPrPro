'use strict';
/* Paste the PUBLIC key printed by `npm run keygen` in the server folder. The matching private key stays on the licence server only.
   `npm run build:protected` refuses to build while this is still the placeholder. */
module.exports={
  PLACEHOLDER:'REPLACE_WITH_PUBLIC_KEY',
  PEM:process.env.CHECKPRINT_PUBKEY_PEM||`REPLACE_WITH_PUBLIC_KEY`
};
