const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KEY='playbox-proto-1',col=c=>/^#[0-9a-f]{6}$/i.test(c)?c:'#3d34e8';
let mem=null,tt,tab='html',route={v:'browse'};
const toast=m=>{const t=$('#t');t.textContent=m;t.style.display='block';clearTimeout(tt);tt=setTimeout(()=>t.style.display='none',3200)};
const SDK=`window.Playbox={_q:{},_n:0,_c(t,d){return new Promise(r=>{const i=++this._n;this._q[i]=r;parent.postMessage({pb:1,i,t,d},'*')})},getUser(){return this._c('user')},saveData(d){return this._c('save',d)},loadData(){return this._c('load')},submitScore(n){return this._c('score',n)}};addEventListener('message',e=>{const m=e.data;if(m&&m.pb&&Playbox._q[m.i]){Playbox._q[m.i](m.v);delete Playbox._q[m.i]}});`;
const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'";
const wrap=h=>{const i='<meta http-equiv="Content-Security-Policy" content="'+CSP+'"><script>'+SDK+'<\/script>';return /<head[^>]*>/i.test(h)?h.replace(/<head[^>]*>/i,m=>m+i):i+h};
const build=(v,t)=>'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(t||v.title||'Game')+'</title><style>'+v.css+'</style></head><body>'+v.html+'<script>'+v.js.replace(/<\/script/gi,'<\\/script')+'<\/script></body></html>';
const scan=s=>{const w=[];if(s.length>5e6)w.push('Over 5 MB');if(/https?:\/\//i.test(s))w.push('External URL');if(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(s))w.push('Network call');if(/\bimport\s*\(|\bimport\s[^;]*\sfrom\s/.test(s))w.push('Module import');if(/<(iframe|embed|object)/i.test(s))w.push('Nested frame');if(/\beval\s*\(|new Function/.test(s))w.push('eval');return w};
const SNAKE={title:'Snake Classic',desc:'Eat, grow, don’t bite yourself. Arrow keys to steer. Saves your best score.',color:'#1f9d63',html:'<canvas id="c" width="300" height="300"></canvas><p id="s"></p>',css:'body{margin:0;background:#101a2b;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:100vh;text-align:center}canvas{background:#16233b;border-radius:8px;max-width:90vw}',js:`const c=document.getElementById('c'),x=c.getContext('2d'),N=15,S=20;let sn,d,f,sc,best=0;
function reset(){sn=[{x:7,y:7}];d={x:1,y:0};f={x:3,y:3};sc=0}
function step(){const h={x:(sn[0].x+d.x+N)%N,y:(sn[0].y+d.y+N)%N};
if(sn.some(p=>p.x==h.x&&p.y==h.y)){Playbox.submitScore(sc);if(sc>best){best=sc;Playbox.saveData({best})}reset();return}
sn.unshift(h);if(h.x==f.x&&h.y==f.y){sc++;f={x:Math.random()*N|0,y:Math.random()*N|0}}else sn.pop();draw()}
function draw(){x.clearRect(0,0,300,300);x.fillStyle='#ff5d8f';x.fillRect(f.x*S+2,f.y*S+2,16,16);x.fillStyle='#6ef0b0';sn.forEach(p=>x.fillRect(p.x*S+1,p.y*S+1,18,18));document.getElementById('s').textContent='Score '+sc+'   Best '+best}
addEventListener('keydown',e=>{const m={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];if(m&&!(m[0]==-d.x&&m[1]==-d.y)){d={x:m[0],y:m[1]};e.preventDefault()}});
reset();Playbox.loadData().then(v=>{if(v&&v.best)best=v.best;draw()});setInterval(step,120);`};
const DODGE={title:'Dodge',desc:'Slide your finger or mouse to dodge the falling blocks. Your best score is saved.',color:'#e0457b',html:'<canvas id="c" width="300" height="400"></canvas><p id="s"></p>',css:'body{margin:0;background:#2a1030;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:100vh;text-align:center}canvas{background:#3b1a45;border-radius:8px;max-height:75vh;touch-action:none}',js:`const c=document.getElementById('c'),x=c.getContext('2d');let px=150,bl=[],sc=0,best=0;
function pos(e){const r=c.getBoundingClientRect();px=((e.touches?e.touches[0].clientX:e.clientX)-r.left)*300/r.width}
c.addEventListener('mousemove',pos);c.addEventListener('touchmove',e=>{pos(e);e.preventDefault()},{passive:false});
function tick(){x.clearRect(0,0,300,400);if(Math.random()<.06)bl.push({x:Math.random()*280,y:-20,v:2+Math.random()*2+sc/600});
x.fillStyle='#ffd23f';bl.forEach(b=>{b.y+=b.v;x.fillRect(b.x,b.y,20,20)});bl=bl.filter(b=>b.y<420);
x.fillStyle='#fff';x.beginPath();x.arc(px,370,10,0,7);x.fill();
if(bl.some(b=>b.y>350&&b.y<380&&Math.abs(b.x+10-px)<18)){Playbox.submitScore(sc);if(sc>best){best=sc;Playbox.saveData({best})}bl=[];sc=0}
sc++;document.getElementById('s').textContent='Score '+sc+'   Best '+best;requestAnimationFrame(tick)}
Playbox.loadData().then(v=>{if(v&&v.best)best=v.best});tick();`};
const TPL={id:null,title:'Tap counter',desc:'My first game.',color:'#3d34e8',html:'<h1>Tap counter</h1>\n<button id="b">Tap</button>\n<p id="n"></p>',css:'body{font-family:system-ui;text-align:center;padding:40px;background:#f2f4fb;color:#181b34}\nbutton{font-size:28px;padding:16px 32px;border-radius:12px;border:0;background:#3d34e8;color:#fff}',js:`let n=0;
Playbox.getUser().then(u=>{document.querySelector('h1').textContent='Hi, '+u.name});
Playbox.loadData().then(d=>{n=d?d.n:0;show()});
b.onclick=()=>{n++;show();Playbox.saveData({n});Playbox.submitScore(n)};
function show(){document.getElementById('n').textContent=n+' taps'}`};
const seed=()=>({user:'',mod:false,saves:{},scores:{},favs:{},reports:[],draft:null,games:[SNAKE,DODGE].map((g,i)=>({id:i?'dodge':'snake',author:'playbox',versions:[{n:1,status:'approved',reason:'',...g}]}))});
const load=()=>{try{const r=localStorage.getItem(KEY);if(r)return JSON.parse(r)}catch(e){}return mem};
let db=load()||seed(),ST=db.draft||{...TPL};
const save=()=>{mem=db;try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};
const uk=()=>db.user||'guest',pub=g=>[...g.versions].reverse().find(v=>v.status=='approved');
const pubs=()=>db.games.map(g=>({g,v:pub(g)})).filter(x=>x.v);
const likes=id=>Object.values(db.favs).filter(a=>a.includes(id)).length;
const titleOf=id=>{const g=db.games.find(x=>x.id==id);return g?(pub(g)||g.versions[0]).title:id};
const fv=s=>{const [i,n]=s.split('.'),g=db.games.find(x=>x.id==i);return [g,g.versions.find(v=>v.n==n)]};
function go(){const h=location.hash.slice(1)||'browse';route=h.startsWith('play-')?{v:'play',id:h.slice(5)}:{v:h};render();scrollTo(0,0)}
function render(){$('#nav').innerHTML=[['browse','Browse'],['studio','Studio'],...(db.mod?[['review','Review']]:[]),['account','Account']].map(([h,l])=>`<a class="b${route.v==h?' on':''}" href="#${h}">${l}</a>`).join('');
$('#me').textContent=db.user||'Guest';(({browse,play,studio,review,account})[route.v]||browse)()}
function browse(){$('#app').innerHTML='<h1>Games that fit in one file.</h1><p class="mu">Every game here was checked by a moderator and runs in a locked sandbox.</p><input id="q" type="search" placeholder="Search games" aria-label="Search games"><div class="grid" id="gr"></div>';
const f=()=>{const q=$('#q').value.toLowerCase();$('#gr').innerHTML=pubs().filter(x=>(x.v.title+' '+x.g.author).toLowerCase().includes(q)).map(x=>`<a class="card" href="#play-${x.g.id}"><div class="th" style="background:${col(x.v.color)}">${esc(x.v.title[0]||'?')}</div><div class="ct"><b>${esc(x.v.title)}</b><span class="mu sm">♥ ${likes(x.g.id)}</span></div><div class="mu sm" style="padding:0 12px 10px">by ${esc(x.g.author)}</div></a>`).join('')||'<p class="mu">No games match.</p>'};$('#q').oninput=f;f()}
function play(){const g=db.games.find(x=>x.id==route.id),v=g&&pub(g);if(!v){$('#app').innerHTML='<h1>Not available</h1><p>This game isn’t published. <a href="#browse">Back to browse</a></p>';return}
const fav=(db.favs[uk()]||[]).includes(g.id);
$('#app').innerHTML=`<h1>${esc(v.title)}</h1><p class="mu">by ${esc(g.author)}, version ${v.n}</p><div class="frame"><iframe id="pf" title="${esc(v.title)}" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen"></iframe></div><div class="bar"><button class="b" data-a="fav">${fav?'♥ Favorited':'♡ Favorite'}</button><button class="b" data-a="fs">Fullscreen</button><button class="b" data-a="rep">Report</button></div><p>${esc(v.desc)}</p><h2>Top scores</h2><div id="lb"></div><p class="mu sm">${db.user?'Playing as '+esc(db.user)+'. Your progress is saved to your account.':'Playing as guest. Sign in on the Account page to keep your progress.'}</p>`;
$('#pf').srcdoc=wrap(build(v));board(g.id)}
function board(id){const e=$('#lb');if(!e)return;const a=(db.scores[id]||[]).slice(0,5);e.innerHTML=a.length?a.map((r,i)=>`<div class="row2"><span>${i+1}. ${esc(r.u)}</span><b>${r.s}</b></div>`).join(''):'<p class="mu">No scores yet. Be the first.</p>'}
const run=()=>{const s=build(ST,ST.title),f=scan(s);$('#pv').srcdoc=wrap(s);$('#fl').innerHTML=(f.length?f.map(x=>`<span class="chip wn">${esc(x)}</span>`).join(''):'<span class="chip ok">No problems found</span>')+`<span class="mu sm">${(s.length/1024).toFixed(1)} KB of 5 MB</span>`;db.draft=ST;save()};
let dt;const dirty=()=>{clearTimeout(dt);dt=setTimeout(run,500)};
const fill=()=>{$('#ti').value=ST.title;$('#ds').value=ST.desc;$('#co').value=col(ST.color);$('#ed').value=ST[tab];run()};
function studio(){tab='html';const mine=db.games.filter(g=>g.author==db.user);
$('#app').innerHTML=`<h1>Studio</h1><p class="mu">A game is one file: HTML, CSS and JavaScript. Write it here or upload your own files and Studio bundles them. Use data: URLs for images and audio, and no external links.</p>
<div class="studio"><div><input id="ti" placeholder="Game title" aria-label="Game title"><div class="bar">${['html','css','js'].map(t=>`<button class="b${t=='html'?' on':''}" data-a="tab" data-v="${t}">${t.toUpperCase()}</button>`).join('')}</div><textarea id="ed" class="ed" spellcheck="false" aria-label="Code editor"></textarea><div class="bar"><button class="b" data-a="upl">Upload files</button><button class="b" data-a="tpl">Starter template</button></div><input id="up" type="file" multiple accept=".html,.htm,.css,.js" hidden></div>
<div><div class="frame"><iframe id="pv" title="Live preview" sandbox="allow-scripts allow-pointer-lock"></iframe></div><pre class="log" id="log">SDK calls from your game show up here.</pre><div id="fl"></div></div></div>
<h2>Submit for review</h2><input id="ds" placeholder="Short description" aria-label="Description"><div class="bar"><label class="mu">Thumbnail color <input id="co" type="color"></label></div><button class="b p" data-a="sub">Submit for review</button> <span class="mu sm">${db.user?'Signed in as '+esc(db.user)+'.':'Sign in on the Account page to submit.'}</span>
<h2>My games</h2>`+(mine.length?mine.map(g=>`<div class="row2"><div><b>${esc(g.versions[g.versions.length-1].title)}</b><div>${g.versions.map(v=>`<span class="chip ${v.status=='approved'?'ok':v.status=='rejected'?'bad':'wn'}" title="${esc(v.reason)}">v${v.n} ${v.status}${v.reason?': '+esc(v.reason):''}</span>`).join('')}</div></div><button class="b" data-a="edit" data-v="${g.id}">Edit as new version</button></div>`).join(''):'<p class="mu">Games you submit will show up here with their review status.</p>');
$('#ed').oninput=e=>{ST[tab]=e.target.value;dirty()};$('#ti').oninput=e=>{ST.title=e.target.value;dirty()};$('#ds').oninput=e=>{ST.desc=e.target.value;dirty()};$('#co').oninput=e=>{ST.color=e.target.value;dirty()};
$('#up').onchange=async e=>{await ingest(e.target.files);e.target.value=''};fill()}
async function ingest(files){const by={};for(const f of files)by[f.name.toLowerCase()]=await f.text();const css=[],js=[],warn=[];let html='';const base=u=>(u||'').split('/').pop().toLowerCase();
for(const [n,t] of Object.entries(by)){if(!/\.html?$/.test(n))continue;const d=new DOMParser().parseFromString(t,'text/html');
d.querySelectorAll('link[rel~=stylesheet]').forEach(l=>{const h=l.getAttribute('href'),k=base(h);if(/^https?:/i.test(h||'')||by[k]===undefined)warn.push('Not bundled: '+h);else if(!css.includes(by[k]))css.push(by[k]);l.remove()});
d.querySelectorAll('script').forEach(s=>{const h=s.getAttribute('src'),k=base(h);if(h){if(/^https?:/i.test(h)||by[k]===undefined)warn.push('Not bundled: '+h);else if(!js.includes(by[k]))js.push(by[k])}else js.push(s.textContent);s.remove()});
d.querySelectorAll('style').forEach(s=>{css.push(s.textContent);s.remove()});html=d.body.innerHTML.trim();if(d.title)ST.title=d.title}
for(const [n,t] of Object.entries(by)){if(n.endsWith('.css')&&!css.includes(t))css.push(t);if(n.endsWith('.js')&&!js.includes(t))js.push(t)}
if(html)ST.html=html;if(css.length)ST.css=css.join('\n');if(js.length)ST.js=js.join('\n;\n');fill();
toast(warn.length?warn[0]+(warn.length>1?' (+'+(warn.length-1)+' more)':''):'Bundled '+Object.keys(by).length+' file(s) into one game.')}
function review(){const P=[];db.games.forEach(g=>g.versions.forEach(v=>v.status=='pending'&&P.push([g,v])));
$('#app').innerHTML='<h1>Review queue</h1><p class="mu">Prototype: anyone can switch on moderator mode from Account. In production this is a protected role.</p><div id="rvw"></div>'+(P.length?P.map(([g,v])=>{const s=build(v),f=scan(s),k=g.id+'.'+v.n;return `<div class="row2"><div><b>${esc(v.title)}</b> v${v.n} by ${esc(g.author)}<div class="mu sm">${esc(v.desc)}</div><div>${(s.length/1024).toFixed(1)} KB ${f.map(x=>`<span class="chip wn">${esc(x)}</span>`).join('')||'<span class="chip ok">no flags</span>'}</div><input id="r${g.id}${v.n}" placeholder="Reason (required to reject)" aria-label="Rejection reason"></div><div class="bar"><button class="b" data-a="rvp" data-v="${k}">Play</button><button class="b p" data-a="appr" data-v="${k}">Approve</button><button class="b" data-a="rej" data-v="${k}">Reject</button></div></div>`}).join(''):'<p>Nothing waiting for review.</p>')+'<h2>Reports</h2>'+(db.reports.length?db.reports.map(r=>`<div class="row2"><span>${esc(titleOf(r.id))}</span><span class="mu sm">reported by ${esc(r.by)}</span></div>`).join(''):'<p class="mu">No reports.</p>')}
function account(){const u=db.user,tools=`<h2>Prototype tools</h2><div class="bar"><button class="b" data-a="mod">Moderator mode: ${db.mod?'on':'off'}</button><button class="b" data-a="rst">Reset all data</button></div>`;
if(!u){$('#app').innerHTML='<h1>Account</h1><p class="mu">Accounts only store your saves, scores and favorites. This prototype has no passwords; the real site would use Supabase Auth.</p><input id="nm" placeholder="Pick a name" maxlength="20" aria-label="Name"><div class="bar"><button class="b p" data-a="login">Sign in</button></div>'+tools;return}
const F=(db.favs[u]||[]).filter(id=>db.games.some(g=>g.id==id)),S=Object.keys(db.saves).filter(k=>k.startsWith(u+'|'));
$('#app').innerHTML=`<h1>${esc(u)}</h1><div class="bar"><button class="b" data-a="logout">Sign out</button></div><h2>Favorites</h2>`+(F.length?F.map(id=>`<div class="row2"><a href="#play-${id}">${esc(titleOf(id))}</a></div>`).join(''):'<p class="mu">Nothing yet.</p>')+'<h2>Saved data</h2>'+(S.length?S.map(k=>`<div class="row2"><span>${esc(titleOf(k.split('|')[1]))}, ${(db.saves[k].length/1024).toFixed(2)} KB of 100 KB</span><button class="b" data-a="clr" data-v="${esc(k)}">Clear</button></div>`).join(''):'<p class="mu">No saves yet.</p>')+'<h2>Delete account</h2><button class="b" data-a="del">Delete account and data</button>'+tools}
const act={
fav(_,b){if(!db.user)return toast('Sign in to favorite games.');const a=db.favs[db.user]=db.favs[db.user]||[],i=a.indexOf(route.id);i<0?a.push(route.id):a.splice(i,1);save();b.textContent=i<0?'♥ Favorited':'♡ Favorite'},
fs(){const f=$('#pf'),p=f.requestFullscreen&&f.requestFullscreen();if(p&&p.catch)p.catch(()=>toast('Fullscreen isn’t available here.'))},
rep(){db.reports.push({id:route.id,by:uk()});save();toast('Reported. A moderator will take a look.')},
tab(v){tab=v;$('#ed').value=ST[v];document.querySelectorAll('[data-a=tab]').forEach(x=>x.classList.toggle('on',x.dataset.v==v))},
upl(){$('#up').click()},tpl(){ST={...TPL};fill()},
sub(){if(!db.user)return toast('Sign in on the Account page to submit.');const s=build(ST);if(!ST.title.trim())return toast('Add a title.');if(!ST.js.trim()&&!ST.html.trim())return toast('Nothing to submit yet.');if(s.length>5e6)return toast('This game is over 5 MB.');
let g=ST.id&&db.games.find(x=>x.id==ST.id&&x.author==db.user);if(!g){g={id:'g'+Date.now().toString(36),author:db.user,versions:[]};db.games.push(g);ST.id=g.id}
g.versions.push({n:g.versions.length+1,status:'pending',reason:'',title:ST.title,desc:ST.desc,color:col(ST.color),html:ST.html,css:ST.css,js:ST.js});save();toast('Submitted version '+g.versions.length+' for review.');studio()},
edit(v){const g=db.games.find(x=>x.id==v),l=g.versions[g.versions.length-1];ST={id:g.id,title:l.title,desc:l.desc,color:l.color,html:l.html,css:l.css,js:l.js};studio()},
rvp(v){const [,x]=fv(v);$('#rvw').innerHTML='<div class="frame" style="margin-bottom:12px"><iframe id="rf" title="Review preview" sandbox="allow-scripts allow-pointer-lock"></iframe></div>';$('#rf').srcdoc=wrap(build(x))},
appr(v){fv(v)[1].status='approved';save();toast('Approved and published.');review()},
rej(v){const [g,x]=fv(v),r=$('#r'+g.id+x.n).value.trim();if(!r)return toast('Add a reason to reject.');x.status='rejected';x.reason=r;save();toast('Rejected.');review()},
login(){const n=$('#nm').value.replace(/\|/g,'').trim();if(!n)return toast('Pick a name first.');db.user=n.slice(0,20);save();render()},
logout(){db.user='';save();render()},clr(k){delete db.saves[k];save();render()},
del(_,b){if(b.dataset.c!='1'){b.dataset.c='1';b.textContent='Click again to confirm';return}const u=db.user;Object.keys(db.saves).forEach(k=>k.startsWith(u+'|')&&delete db.saves[k]);delete db.favs[u];Object.keys(db.scores).forEach(k=>db.scores[k]=db.scores[k].filter(x=>x.u!=u));db.user='';save();toast('Account and saved data deleted.');render()},
mod(){db.mod=!db.mod;save();render()},rst(){db=seed();ST={...TPL};save();render()}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&act[b.dataset.a])act[b.dataset.a](b.dataset.v,b)});
addEventListener('message',e=>{const m=e.data;if(!m||m.pb!==1)return;const f=[[route.id,$('#pf')],['test',$('#pv')],['test',$('#rf')]].find(a=>a[1]&&a[1].contentWindow===e.source);if(!f)return;
const id=f[0],k=uk()+'|'+id;let v=null;
if(m.t=='user')v={name:uk()};
else if(m.t=='save'){const s=JSON.stringify(m.d);v=!!s&&s.length<=102400;if(v){db.saves[k]=s;save()}}
else if(m.t=='load'){try{v=db.saves[k]?JSON.parse(db.saves[k]):null}catch(x){}}
else if(m.t=='score'&&typeof m.d=='number'&&isFinite(m.d)){const a=db.scores[id]=db.scores[id]||[];a.push({u:uk(),s:m.d});a.sort((p,q)=>q.s-p.s);a.length=Math.min(a.length,50);save();v=true;board(id)}
if(f[1].id=='pv'){const l=$('#log');l.textContent=((l.dataset.u?l.textContent+'\n':'')+m.t+' '+JSON.stringify(m.d===undefined?'':m.d)).slice(-1500);l.dataset.u=1;l.scrollTop=1e9}
e.source.postMessage({pb:1,i:m.i,v},'*')});
addEventListener('hashchange',go);go();
