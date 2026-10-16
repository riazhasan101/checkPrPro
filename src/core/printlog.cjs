'use strict';
function printKey(record){
  const amount=Number(record&&record.amount);
  return [
    String(record&&record.bank||'').trim().toLowerCase(),
    String(record&&record.cheque||'').trim().toLowerCase(),
    String(record&&record.payee||'').trim().toLowerCase(),
    Number.isFinite(amount)?amount.toFixed(2):'',
    String(record&&record.date||'').trim()
  ].join('|');
}
function planCommit(existing,records,extra){
  const opts=extra&&typeof extra==='object'?extra:{};
  if(!Array.isArray(records)||!records.length)throw new Error('No cheques to record');
  const known=new Set((existing||[]).map(entry=>entry.key));
  const reason=String(opts.reason||'').trim().slice(0,200);
  const seen=new Set();
  const entries=records.map(record=>{
    if(!record||typeof record!=='object')throw new Error('Invalid print record');
    const key=printKey(record);
    if(!key.replace(/\|/g,''))throw new Error('Empty print record');
    if(seen.has(key))throw new Error('Duplicate cheque in this print');
    seen.add(key);
    const prior=known.has(key);
    return {
      key,
      bank:String(record.bank||'').trim(),
      payee:String(record.payee||'').trim(),
      amount:Number(record.amount),
      date:String(record.date||'').trim(),
      cheque:String(record.cheque||'').trim(),
      reprint:prior,
      reason:prior?reason:''
    };
  });
  const blocked=entries.filter(entry=>entry.reprint);
  if(blocked.length&&opts.reprint!==true){
    const err=new Error('Already printed');
    err.code='ALREADY_PRINTED';
    throw err;
  }
  if(blocked.length&&!reason)throw new Error('Reprint reason required');
  return entries;
}
module.exports={printKey,planCommit};
