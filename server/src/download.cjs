'use strict';
/* Public download page for the desktop installer. Put the .exe in DOWNLOAD_DIR (default /downloads); nothing else is ever served from there. */
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const NAME=/^CheckPrint-\d+\.\d+\.\d+-Setup-x64\.exe$/;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createDownloads(dir,{support=''}={}){
  const cache=new Map();
  const latest=()=>{
    try{
      const files=fs.readdirSync(dir).filter(f=>NAME.test(f)).map(f=>({f,st:fs.statSync(path.join(dir,f))})).filter(x=>x.st.isFile());
      const ver=f=>f.match(/(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
      files.sort((a,b)=>{const x=ver(a.f),y=ver(b.f);return (y[0]-x[0])||(y[1]-x[1])||(y[2]-x[2])});
      return files[0]||null;
    }catch{return null}
  };
  const sha=(f,st)=>{const k=f+st.size+st.mtimeMs;if(!cache.has(k))cache.set(k,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex'));return cache.get(k)};
  const mb=n=>(n/1048576).toFixed(0);
  const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  function page(){
    const l=latest();
    const body=l?`<a class="btn" href="/download/${esc(l.f)}">Download CheckPrint &mdash; ডাউনলোড করুন</a><p class="meta">${esc(l.f)} &middot; ${mb(l.st.size)} MB &middot; Windows 10/11 (64-bit)</p>
<details><summary>ফাইল ঠিক আছে কিনা মিলিয়ে দেখুন (SHA-256)</summary><p class="meta">PowerShell-এ চালান: <code>Get-FileHash .\\${esc(l.f)} -Algorithm SHA256</code><br>ফলাফল এটার সাথে মিলতে হবে:</p><code class="hash">${sha(l.f,l.st)}</code></details>`
      :`<p class="meta">The installer is not uploaded yet. Please contact support.</p>`;
    return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download CheckPrint</title><style>
:root{--ink:#0f2238;--bg:#f3f5f4;--line:#dde4e7;--accent:#0e7a6b;--accent-d:#0a5f53;--muted:#5d6d7b;--amber:#fff3d6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#16212c;font:16px/1.6 "Segoe UI","Noto Sans Bengali",system-ui,sans-serif}
header{background:linear-gradient(135deg,#0f2238,#17314e);color:#fff;padding:28px 20px}header div,main{max-width:720px;margin:0 auto}h1{margin:0;font-size:26px}header p{margin:4px 0 0;color:#a9bdd1}
main{padding:22px 20px 50px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:18px}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px}.btn:hover{background:var(--accent-d)}
.meta{color:var(--muted);font-size:14px}code{background:#eef2f3;padding:2px 6px;border-radius:5px;word-break:break-all}.hash{display:block;margin-top:6px;font-size:13px}
h2{margin:0 0 10px;font-size:19px}ol{padding-left:22px;margin:0}li{margin:8px 0}.note{background:var(--amber);border-radius:10px;padding:12px 14px;margin-top:14px;font-size:15px}
summary{cursor:pointer;font-weight:600;margin-top:14px}</style></head><body>
<header><div><h1>CheckPrint</h1><p>ব্যাংকের চেক প্রিন্ট করুন, আসল চেকের মতো ঠিক জায়গায়</p></div></header><main>
<div class="card">${body}</div>
<div class="card"><h2>ইনস্টল করার নিয়ম</h2><ol>
<li>ফাইলটি ডাউনলোড হলে সেটিতে ডাবল ক্লিক করুন।</li>
<li>নীল রঙের <b>"Windows protected your PC"</b> বার্তা আসলে ঘাবড়াবেন না। এটা Windows নতুন অ্যাপে সবসময় দেখায়। <b>More info</b> লেখায় ক্লিক করুন।</li>
<li>এখন নিচে আসা <b>Run anyway</b> বোতামে ক্লিক করুন।</li>
<li>ইনস্টলারের ধাপগুলোতে <b>Next</b> চেপে শেষ করুন।</li>
<li>অ্যাপ চালু হলে <b>Create account</b> থেকে ইমেইল ও পাসওয়ার্ড দিয়ে একটি অ্যাকাউন্ট খুলুন (কোম্পানির নামও দিতে পারেন)।</li>
<li><b>Ask for approval</b> চেপে প্ল্যান বেছে অনুরোধ পাঠান, অথবা bKash/Nagad-এ টাকা পাঠিয়ে Transaction ID দিন।</li>
<li>আমরা অনুমোদন দিলে <b>Check now</b> চাপুন। অ্যাপ চালু হয়ে যাবে।</li></ol>
<div class="note"><b>জানা দরকার:</b> একটি সাবস্ক্রিপশনে নির্দিষ্ট সংখ্যক কম্পিউটারে চলে। মেয়াদ শেষ হলে অ্যাপ বন্ধ হয়ে যায়, নবায়ন করলে আবার চলে। ইন্টারনেট না থাকলেও ৭ দিন পর্যন্ত চলবে।</div></div>
<div class="card"><h2>Antivirus বাধা দিলে</h2><p>কিছু antivirus (যেমন Windows Defender) নতুন অ্যাপকে ভুল করে সন্দেহ করতে পারে। ইনস্টলার বা CheckPrint ফোল্ডারটি antivirus-এর <b>Exclusion</b> তালিকায় যোগ করুন, অথবা নিচের নম্বরে জানান।</p>${support?`<p class="meta">সহায়তা: ${esc(support)}</p>`:''}</div>
</main></body></html>`;
  }
  /* returns true when the request was handled */
  return function handle(req,res,url){
    if(req.method!=='GET'&&req.method!=='HEAD')return false;
    if(url.pathname==='/download'||url.pathname==='/download/'){res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:page());return true}
    const m=/^\/download\/([^/]+)$/.exec(url.pathname);
    if(!m)return false;
    let name;try{name=decodeURIComponent(m[1])}catch{name=''}
    const l=NAME.test(name)?latest():null;
    const ok=NAME.test(name)&&(()=>{try{return fs.statSync(path.join(dir,name)).isFile()}catch{return false}})();
    if(!ok){res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Not found');return true}
    const st=fs.statSync(path.join(dir,name));
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':st.size,'Content-Disposition':`attachment; filename="${name}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
    if(req.method==='HEAD')return res.end(),true;
    fs.createReadStream(path.join(dir,name)).pipe(res);return true;
  };
}
module.exports={createDownloads,NAME};
