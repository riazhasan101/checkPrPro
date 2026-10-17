'use strict';
const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function small(n){let s='';if(n>=100){s+=ones[Math.floor(n/100)]+' Hundred';n%=100;if(n)s+=' ';}if(n>=20){s+=tens[Math.floor(n/10)];if(n%10)s+=' '+ones[n%10];}else if(n)s+=ones[n];return s;}
function integer(n){if(n===0)return 'Zero';let out=[];for(const [v,label] of [[1e9,'Billion'],[1e6,'Million'],[1e3,'Thousand'],[1,'']]){let q=Math.floor(n/v);if(q){out.push(small(q)+(label?' '+label:''));n%=v;}}return out.join(' ');}
function words(value){if(!Number.isFinite(value)||value<0||value>999999999999.99)throw new Error('Amount out of range');const minor=Math.round(value*100);const taka=Math.floor(minor/100),paisa=minor%100;return integer(taka)+' Taka'+(paisa?' and '+integer(paisa)+' Paisa':'')+' Only';}
// Bangladeshi cheque wording: Crore / Lakh / Thousand / Hundred. The printed label already says "The Sum of Taka",
// so whole-taka amounts read "... Only". Keep in step with amountWords() in index.html (a test checks this).
function under100(n){return n<20?ones[n]:tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');}
function bd(n,lac){
  if(n===0)return 'Zero';
  const out=[];let rest=n;
  const crore=Math.floor(rest/1e7);rest%=1e7;
  const lakh=Math.floor(rest/1e5);rest%=1e5;
  const thou=Math.floor(rest/1e3);rest%=1e3;
  const hund=Math.floor(rest/100),low=rest%100;
  if(crore)out.push(bd(crore,lac)+' Crore');
  if(lakh)out.push(under100(lakh)+(lac?' Lac':' Lakh'));
  if(thou)out.push(under100(thou)+' Thousand');
  if(hund)out.push(ones[hund]+' Hundred');
  if(low)out.push((out.length?'And ':'')+under100(low));
  return out.join(' ');
}
function chequeWords(value,opts){const lac=!!(opts&&opts.lac);
  if(!Number.isFinite(value)||value<0||value>999999999999.99)throw new Error('Amount out of range');
  const minor=Math.round(value*100);const taka=Math.floor(minor/100),paisa=minor%100;
  if(!paisa)return bd(taka,lac)+' Only';
  return (taka?bd(taka,lac)+' Taka And ':'')+under100(paisa)+' Paisa Only';
}
module.exports={words,chequeWords};
