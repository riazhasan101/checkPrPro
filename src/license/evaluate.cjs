'use strict';
const SKEW=5*60*1000;
/* Pure decision: may this computer run the app right now? Nothing here touches the network or disk, so it is easy to test. */
function evaluate({payload,fp,now,lastSeen}){
  if(!payload||payload.v!==1)return {ok:false,code:'NO_LICENCE',message:'Sign in to activate this computer.'};
  if(payload.fp!==fp)return {ok:false,code:'WRONG_DEVICE',message:'This licence belongs to a different computer.'};
  if(now<payload.iat-SKEW||(lastSeen&&now<lastSeen-SKEW))return {ok:false,code:'CLOCK',message:'The computer clock looks wrong. Correct the date and time, then reconnect.'};
  if(now>=payload.exp)return {ok:false,code:'EXPIRED',message:'Your subscription has expired. Renew to continue.'};
  if(now>=payload.next)return {ok:false,code:'OFFLINE_EXPIRED',message:'This computer has been offline too long. Connect to the internet to continue.'};
  return {ok:true,code:'OK',plan:payload.plan,maxDevices:payload.maxDevices,expiresAt:payload.exp,mustConnectBy:payload.next,daysLeft:Math.max(0,Math.ceil((payload.exp-now)/86400000))};
}
module.exports={evaluate,SKEW};
