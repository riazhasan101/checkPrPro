'use strict';
const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function small(n){let s='';if(n>=100){s+=ones[Math.floor(n/100)]+' Hundred';n%=100;if(n)s+=' ';}if(n>=20){s+=tens[Math.floor(n/10)];if(n%10)s+=' '+ones[n%10];}else if(n)s+=ones[n];return s;}
function integer(n){if(n===0)return 'Zero';let out=[];for(const [v,label] of [[1e9,'Billion'],[1e6,'Million'],[1e3,'Thousand'],[1,'']]){let q=Math.floor(n/v);if(q){out.push(small(q)+(label?' '+label:''));n%=v;}}return out.join(' ');}
function words(value){if(!Number.isFinite(value)||value<0||value>999999999999.99)throw new Error('Amount out of range');const minor=Math.round(value*100);const taka=Math.floor(minor/100),paisa=minor%100;return integer(taka)+' Taka'+(paisa?' and '+integer(paisa)+' Paisa':'')+' Only';}
module.exports={words};
