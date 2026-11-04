const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
    String(value).replace(/[&<>\"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    }[character]));

const KEY = 'playbox-proto-1';
const API_BASE_URL = 'https://playbox-api.gearshaft01.workers.dev';
const SUPABASE_URL = 'https://gahjnjpockmwhozouyew.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hGku3vvs1IlHqswTc3MvBg_gAkF-vOR';
const getColor = (color) => (/^#[0-9a-f]{6}$/i.test(color) ? color : '#3d34e8');

let memory = null;
let toastHandle;
let activeTab = 'html';
let currentRoute = { v: 'browse' };
let authClient = null;

const toast = (message) => {
    const toastNode = $('#t');
    toastNode.textContent = message;
    toastNode.style.display = 'block';
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => {
        toastNode.style.display = 'none';
    }, 3200);
};

const sdkScript = `window.Playbox={_q:{},_n:0,_c(t,d){return new Promise(r=>{const i=++this._n;this._q[i]=r;parent.postMessage({pb:1,i,t,d},'*')})},getUser(){return this._c('user')},saveData(d){return this._c('save',d)},loadData(){return this._c('load')},submitScore(n){return this._c('score',n)}};addEventListener('message',e=>{const m=e.data;if(m&&m.pb&&Playbox._q[m.i]){Playbox._q[m.i](m.v);delete Playbox._q[m.i]}});`;
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'";

const wrapDocument = (html) => {
    const metaAndSdk = `<meta http-equiv="Content-Security-Policy" content="${csp}"><script>${sdkScript}</script>`;
    return /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, (match) => match + metaAndSdk)
        : metaAndSdk + html;
};

const buildGameDocument = (gameVersion, titleOverride) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titleOverride || gameVersion.title || 'Game')}</title><style>${gameVersion.css}</style></head><body>${gameVersion.html}<script>${gameVersion.js.replace(/<\/script/gi, '<\\/script')}<\/script></body></html>`;

const scanCode = (source) => {
    const warnings = [];
    if (source.length > 5e6) warnings.push('Over 5 MB');
    if (/https?:\/\//i.test(source)) warnings.push('External URL');
    if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(source)) warnings.push('Network call');
    if (/\bimport\s*\(|\bimport\s[^;]*\sfrom\s/.test(source)) warnings.push('Module import');
    if (/<(iframe|embed|object)/i.test(source)) warnings.push('Nested frame');
    if (/\beval\s*\(|new Function/.test(source)) warnings.push('eval');
    return warnings;
};

const snakeGame = {
    title: 'Snake Classic',
    desc: 'Eat, grow, don’t bite yourself. Arrow keys to steer. Saves your best score.',
    color: '#1f9d63',
    html: '<canvas id="c" width="300" height="300"></canvas><p id="s"></p>',
    css: 'body{margin:0;background:#101a2b;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:100vh;text-align:center}canvas{background:#16233b;border-radius:8px;max-width:90vw}',
    js: `const c=document.getElementById('c'),x=c.getContext('2d'),N=15,S=20;let sn,d,f,sc,best=0;
function reset(){sn=[{x:7,y:7}];d={x:1,y:0};f={x:3,y:3};sc=0}
function step(){const h={x:(sn[0].x+d.x+N)%N,y:(sn[0].y+d.y+N)%N};
if(sn.some(p=>p.x==h.x&&p.y==h.y)){Playbox.submitScore(sc);if(sc>best){best=sc;Playbox.saveData({best})}reset();return}
sn.unshift(h);if(h.x==f.x&&h.y==f.y){sc++;f={x:Math.random()*N|0,y:Math.random()*N|0}}else sn.pop();draw()}
function draw(){x.clearRect(0,0,300,300);x.fillStyle='#ff5d8f';x.fillRect(f.x*S+2,f.y*S+2,16,16);x.fillStyle='#6ef0b0';sn.forEach(p=>x.fillRect(p.x*S+1,p.y*S+1,18,18));document.getElementById('s').textContent='Score '+sc+'   Best '+best}
addEventListener('keydown',e=>{const m={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];if(m&&!(m[0]==-d.x&&m[1]==-d.y)){d={x:m[0],y:m[1]};e.preventDefault()}});
reset();Playbox.loadData().then(v=>{if(v&&v.best)best=v.best;draw()});setInterval(step,120);`
};

const dodgeGame = {
    title: 'Dodge',
    desc: 'Slide your finger or mouse to dodge the falling blocks. Your best score is saved.',
    color: '#e0457b',
    html: '<canvas id="c" width="300" height="400"></canvas><p id="s"></p>',
    css: 'body{margin:0;background:#2a1030;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:100vh;text-align:center}canvas{background:#3b1a45;border-radius:8px;max-height:75vh;touch-action:none}',
    js: `const c=document.getElementById('c'),x=c.getContext('2d');let px=150,bl=[],sc=0,best=0;
function pos(e){const r=c.getBoundingClientRect();px=((e.touches?e.touches[0].clientX:e.clientX)-r.left)*300/r.width}
c.addEventListener('mousemove',pos);c.addEventListener('touchmove',e=>{pos(e);e.preventDefault()},{passive:false});
function tick(){x.clearRect(0,0,300,400);if(Math.random()<.06)bl.push({x:Math.random()*280,y:-20,v:2+Math.random()*2+sc/600});
x.fillStyle='#ffd23f';bl.forEach(b=>{b.y+=b.v;x.fillRect(b.x,b.y,20,20)});bl=bl.filter(b=>b.y<420);
x.fillStyle='#fff';x.beginPath();x.arc(px,370,10,0,7);x.fill();
if(bl.some(b=>b.y>350&&b.y<380&&Math.abs(b.x+10-px)<18)){Playbox.submitScore(sc);if(sc>best){best=sc;Playbox.saveData({best})}bl=[];sc=0}
sc++;document.getElementById('s').textContent='Score '+sc+'   Best '+best;requestAnimationFrame(tick)}
Playbox.loadData().then(v=>{if(v&&v.best)best=v.best});tick();`
};

const starterTemplate = {
    id: null,
    title: 'Tap counter',
    desc: 'My first game.',
    color: '#3d34e8',
    html: '<h1>Tap counter</h1>\n<button id="b">Tap</button>\n<p id="n"></p>',
    css: 'body{font-family:system-ui;text-align:center;padding:40px;background:#f2f4fb;color:#181b34}\nbutton{font-size:28px;padding:16px 32px;border-radius:12px;border:0;background:#3d34e8;color:#fff}',
    js: `let n=0;
Playbox.getUser().then(u=>{document.querySelector('h1').textContent='Hi, '+u.name});
Playbox.loadData().then(d=>{n=d?d.n:0;show()});
b.onclick=()=>{n++;show();Playbox.saveData({n});Playbox.submitScore(n)};
function show(){document.getElementById('n').textContent=n+' taps'}`
};

const seedData = () => ({
    user: '',
    mod: false,
    saves: {},
    scores: {},
    favs: {},
    reports: [],
    draft: null,
    games: [snakeGame, dodgeGame].map((game, index) => ({
        id: index ? 'dodge' : 'snake',
        author: 'playbox',
        versions: [{ n: 1, status: 'approved', reason: '', ...game }]
    }))
});

const loadData = () => {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
    } catch (error) {
        return memory;
    }
    return memory;
};

let db = loadData() || seedData();
let draft = db.draft || { ...starterTemplate };
db.user = '';

const saveData = () => {
    memory = db;
    try {
        localStorage.setItem(KEY, JSON.stringify(db));
    } catch (error) {
        // Ignore storage errors in the prototype app.
    }
};

const displayName = () => db.user || 'guest';
const getPublicVersion = (game) => [...game.versions].reverse().find((version) => version.status === 'approved');
const publishedGames = () => db.games
    .map((game) => ({ game, version: getPublicVersion(game) }))
    .filter(({ version }) => version);
const countLikes = (gameId) => Object.values(db.favs)
    .filter((list) => list.includes(gameId)).length;
const titleForGame = (gameId) => {
    const game = db.games.find((entry) => entry.id == gameId);
    return game ? (getPublicVersion(game) || game.versions[0]).title : gameId;
};
const findGameVersion = (gameIdentifier) => {
    const [gameId, versionNumber] = gameIdentifier.split('.');
    const game = db.games.find((entry) => entry.id == gameId);
    if (!game) return [null, null];
    const version = game.versions.find((entry) => String(entry.n) == versionNumber);
    return [game, version];
};

const board = (gameId) => {
    const leaderboard = $('#lb');
    if (!leaderboard) return;

    const entries = (db.scores[gameId] || []).slice(0, 5);
    leaderboard.innerHTML = entries.length
        ? entries.map((row, index) => `<div class="row2"><span>${index + 1}. ${escapeHtml(row.u)}</span><b>${row.s}</b></div>`).join('')
        : '<p class="mu">No scores yet. Be the first.</p>';
};

const renderNavigation = () => {
    $('#nav').innerHTML = [['browse', 'Browse'], ['studio', 'Studio'], ...(db.mod ? [['review', 'Review']] : []), ['account', 'Account']]
        .map(([routeKey, label]) => `<a class="b${currentRoute.v == routeKey ? ' on' : ''}" href="#${routeKey}">${label}</a>`)
        .join('');
    $('#me').textContent = db.user || 'Guest';
};

function go() {
    const hash = location.hash.slice(1) || 'browse';
    if (hash.startsWith('play-api-')) {
        currentRoute = { v: 'play', id: decodeURIComponent(hash.slice(9)), remote: true };
    } else {
        currentRoute = hash.startsWith('play-')
            ? { v: 'play', id: hash.slice(5), remote: false }
            : { v: hash };
    }
    render();
    scrollTo(0, 0);
}

function render() {
    renderNavigation();
    const views = { browse, play, studio, review, account };
    (views[currentRoute.v] || browse)();
}

async function browse() {
    $('#app').innerHTML = '<h1>Games made by players</h1><p class="mu">Every game here was checked by a moderator and runs in a locked sandbox.</p><input id="q" type="search" placeholder="Search games" aria-label="Search games"><div class="grid" id="gr"></div>';
    let remoteGames = [];

    const redrawCatalog = () => {
        const query = $('#q').value.toLowerCase();
        const localCards = publishedGames()
            .filter(({ game, version }) => `${version.title} ${game.author}`.toLowerCase().includes(query))
            .map(({ game, version }) => `
                <a class="card" href="#play-${game.id}">
                    <div class="th" style="background:${getColor(version.color)}">${escapeHtml(version.title[0] || '?')}</div>
                    <div class="ct"><b>${escapeHtml(version.title)}</b><span class="mu sm">♥ ${countLikes(game.id)}</span></div>
                    <div class="mu sm" style="padding:0 12px 10px">by ${escapeHtml(game.author)}</div>
                </a>
            `);
        const remoteCards = remoteGames
            .filter((game) => `${game.title} ${game.author}`.toLowerCase().includes(query))
            .map((game) => `
                <a class="card" href="#play-api-${encodeURIComponent(game.id)}">
                    <div class="th" style="background:${getColor(game.color)}">${escapeHtml(game.title[0] || '?')}</div>
                    <div class="ct"><b>${escapeHtml(game.title)}</b></div>
                    <div class="mu sm" style="padding:0 12px 10px">by ${escapeHtml(game.author)}</div>
                </a>
            `);
        $('#gr').innerHTML = [...localCards, ...remoteCards].join('') || '<p class="mu">No games match.</p>';
    };

    $('#q').oninput = redrawCatalog;
    redrawCatalog();

    try {
        const response = await fetch(`${API_BASE_URL}/api/games`);
        if (!response.ok) throw new Error(`API request failed (${response.status})`);
        const result = await response.json();
        if (!Array.isArray(result.games)) throw new Error('API returned an invalid game list');
        if (!$('#gr')) return;
        remoteGames = result.games;
        redrawCatalog();
    } catch (error) {
        if (!$('#gr')) return;
        $('#gr').insertAdjacentHTML(
            'afterbegin',
            `<p class="mu">Could not load published games from the server: ${escapeHtml(error.message)}. Showing local games only.</p>`
        );
    }
}

async function play() {
    let game = db.games.find((entry) => entry.id == currentRoute.id);
    let version = game && getPublicVersion(game);

    if (currentRoute.remote) {
        const requestedGameId = currentRoute.id;
        $('#app').innerHTML = '<p class="mu">Loading game…</p>';
        try {
            const response = await fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(requestedGameId)}`);
            if (!response.ok) {
                if (response.status === 404) throw new Error('Game not found or not published.');
                throw new Error(`API request failed (${response.status})`);
            }
            const result = await response.json();
            if (!result.game) throw new Error('API returned an invalid game response');
            if (currentRoute.v !== 'play' || !currentRoute.remote || currentRoute.id !== requestedGameId) return;
            const remoteVersion = result.game;
            game = { id: remoteVersion.id, author: remoteVersion.author };
            version = {
                n: remoteVersion.version_number,
                title: remoteVersion.title,
                desc: remoteVersion.description,
                color: remoteVersion.color,
                html: remoteVersion.html,
                css: remoteVersion.css,
                js: remoteVersion.js
            };
        } catch (error) {
            if (currentRoute.v !== 'play' || !currentRoute.remote || currentRoute.id !== requestedGameId) return;
            $('#app').innerHTML = `<h1>Unable to load game</h1><p class="mu">${escapeHtml(error.message)}</p><a href="#browse">Back to browse</a>`;
            return;
        }
    }

    if (!version) {
        $('#app').innerHTML = '<h1>Not available</h1><p>This game isn’t published. <a href="#browse">Back to browse</a></p>';
        return;
    }

    const isFavorite = (db.favs[displayName()] || []).includes(game.id);
    $('#app').innerHTML = `
        <h1>${escapeHtml(version.title)}</h1>
        <p class="mu">by ${escapeHtml(game.author)}, version ${version.n}</p>
        <div class="frame"><iframe id="pf" title="${escapeHtml(version.title)}" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen"></iframe></div>
        <div class="bar">
            <button class="b" data-a="fav">${isFavorite ? '♥ Favorited' : '♡ Favorite'}</button>
            <button class="b" data-a="fs">Fullscreen</button>
            <button class="b" data-a="rep">Report</button>
        </div>
        <p>${escapeHtml(version.desc)}</p>
        <h2>Top scores</h2>
        <div id="lb"></div>
        <p class="mu sm">${db.user ? 'Playing as ' + escapeHtml(db.user) + '. Your progress is saved to your account.' : 'Playing as guest. Your progress is saved locally only.'}</p>
    `;

    $('#pf').srcdoc = wrapDocument(buildGameDocument(version));
    board(game.id);
}

const runPreview = () => {
    const source = buildGameDocument(draft, draft.title);
    const warnings = scanCode(source);
    $('#pv').srcdoc = wrapDocument(source);
    $('#fl').innerHTML = (warnings.length
        ? warnings.map((warning) => `<span class="chip wn">${escapeHtml(warning)}</span>`).join('')
        : '<span class="chip ok">No problems found</span>') + `<span class="mu sm">${(source.length / 1024).toFixed(1)} KB of 5 MB</span>`;

    db.draft = draft;
    saveData();
};

let previewTimer;
const triggerPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, 500);
};

const fillStudioInputs = () => {
    $('#ti').value = draft.title;
    $('#ds').value = draft.desc;
    $('#co').value = getColor(draft.color);
    $('#ed').value = draft[activeTab];
    runPreview();
};

function studio() {
    activeTab = 'html';
    const ownedGames = db.games.filter((game) => game.author == db.user);

    $('#app').innerHTML = `
        <h1>Studio</h1>
        <p class="mu">A game is one file: HTML, CSS and JavaScript. Write it here or upload your own files and Studio bundles them. Use data: URLs for images and audio, and no external links.</p>
        <div class="studio">
            <div>
                <input id="ti" placeholder="Game title" aria-label="Game title">
                <div class="bar">${['html', 'css', 'js'].map((tabName) => `<button class="b${tabName == 'html' ? ' on' : ''}" data-a="tab" data-v="${tabName}">${tabName.toUpperCase()}</button>`).join('')}</div>
                <textarea id="ed" class="ed" spellcheck="false" aria-label="Code editor"></textarea>
                <div class="bar">
                    <button class="b" data-a="upl">Upload files</button>
                    <button class="b" data-a="tpl">Starter template</button>
                </div>
                <input id="up" type="file" multiple accept=".html,.htm,.css,.js" hidden>
            </div>
            <div>
                <div class="frame"><iframe id="pv" title="Live preview" sandbox="allow-scripts allow-pointer-lock"></iframe></div>
                <pre class="log" id="log">SDK calls from your game show up here.</pre>
                <div id="fl"></div>
            </div>
        </div>
        <h2>Submit for review</h2>
        <input id="ds" placeholder="Short description" aria-label="Description">
        <div class="bar"><label class="mu">Thumbnail color <input id="co" type="color"></label></div>
        <button class="b p" data-a="sub">Submit for review</button> <span class="mu sm">${db.user ? 'Signed in as ' + escapeHtml(db.user) + '.' : 'Sign in on the Account page to submit.'}</span>
        <h2>My games</h2>
        ${ownedGames.length ? ownedGames.map((game) => `
            <div class="row2">
                <div>
                    <b>${escapeHtml(game.versions[game.versions.length - 1].title)}</b>
                    <div>
                        ${game.versions.map((version) => `<span class="chip ${version.status == 'approved' ? 'ok' : version.status == 'rejected' ? 'bad' : 'wn'}" title="${escapeHtml(version.reason)}">v${version.n} ${version.status}${version.reason ? ': ' + escapeHtml(version.reason) : ''}</span>`).join('')}
                    </div>
                </div>
                <button class="b" data-a="edit" data-v="${game.id}">Edit as new version</button>
            </div>
        `).join('') : '<p class="mu">Games you submit will show up here with their review status.</p>'}
    `;

    $('#ed').oninput = (event) => {
        draft[activeTab] = event.target.value;
        triggerPreview();
    };
    $('#ti').oninput = (event) => {
        draft.title = event.target.value;
        triggerPreview();
    };
    $('#ds').oninput = (event) => {
        draft.desc = event.target.value;
        triggerPreview();
    };
    $('#co').oninput = (event) => {
        draft.color = event.target.value;
        triggerPreview();
    };
    $('#up').onchange = async (event) => {
        await ingest(event.target.files);
        event.target.value = '';
    };

    fillStudioInputs();
}

async function ingest(files) {
    const byName = {};
    for (const file of files) byName[file.name.toLowerCase()] = await file.text();

    const cssFiles = [];
    const jsFiles = [];
    const warnings = [];
    let htmlContent = '';
    const basename = (value = '') => value.split('/').pop().toLowerCase();

    for (const [fileName, fileText] of Object.entries(byName)) {
        if (!/\.html?$/i.test(fileName)) continue;

        const parsed = new DOMParser().parseFromString(fileText, 'text/html');

        parsed.querySelectorAll('link[rel~=stylesheet]').forEach((link) => {
            const href = link.getAttribute('href');
            const key = basename(href);
            if (/^https?:/i.test(href || '') || byName[key] === undefined) {
                warnings.push('Not bundled: ' + href);
            } else if (!cssFiles.includes(byName[key])) {
                cssFiles.push(byName[key]);
            }
            link.remove();
        });

        parsed.querySelectorAll('script').forEach((script) => {
            const src = script.getAttribute('src');
            const key = basename(src);
            if (src) {
                if (/^https?:/i.test(src) || byName[key] === undefined) {
                    warnings.push('Not bundled: ' + src);
                } else if (!jsFiles.includes(byName[key])) {
                    jsFiles.push(byName[key]);
                }
            } else {
                jsFiles.push(script.textContent);
            }
            script.remove();
        });

        parsed.querySelectorAll('style').forEach((styleBlock) => {
            cssFiles.push(styleBlock.textContent);
            styleBlock.remove();
        });

        htmlContent = parsed.body.innerHTML.trim();
        if (parsed.title) draft.title = parsed.title;
    }

    for (const [fileName, fileText] of Object.entries(byName)) {
        if (fileName.endsWith('.css') && !cssFiles.includes(fileText)) cssFiles.push(fileText);
        if (fileName.endsWith('.js') && !jsFiles.includes(fileText)) jsFiles.push(fileText);
    }

    if (htmlContent) draft.html = htmlContent;
    if (cssFiles.length) draft.css = cssFiles.join('\n');
    if (jsFiles.length) draft.js = jsFiles.join('\n;\n');

    fillStudioInputs();
    toast(warnings.length ? warnings[0] + (warnings.length > 1 ? ' (+' + (warnings.length - 1) + ' more)' : '') : 'Bundled ' + Object.keys(byName).length + ' file(s) into one game.');
}

function review() {
    const pending = [];
    db.games.forEach((game) => game.versions.forEach((version) => {
        if (version.status == 'pending') pending.push([game, version]);
    }));

    $('#app').innerHTML = '<h1>Review queue</h1><p class="mu">Prototype: anyone can switch on moderator mode from Account. In production this is a protected role.</p><div id="rvw"></div>' +
        (pending.length ? pending.map(([game, version]) => {
            const previewDoc = buildGameDocument(version);
            const warnings = scanCode(previewDoc);
            const key = `${game.id}.${version.n}`;
            return `<div class="row2"><div><b>${escapeHtml(version.title)}</b> v${version.n} by ${escapeHtml(game.author)}<div class="mu sm">${escapeHtml(version.desc)}</div><div>${(previewDoc.length / 1024).toFixed(1)} KB ${warnings.map((warning) => `<span class="chip wn">${escapeHtml(warning)}</span>`).join('') || '<span class="chip ok">no flags</span>'}</div><input id="r${game.id}${version.n}" placeholder="Reason (required to reject)" aria-label="Rejection reason"></div><div class="bar"><button class="b" data-a="rvp" data-v="${key}">Play</button><button class="b p" data-a="appr" data-v="${key}">Approve</button><button class="b" data-a="rej" data-v="${key}">Reject</button></div></div>`;
        }).join('') : '<p>Nothing waiting for review.</p>') +
        '<h2>Reports</h2>' + (db.reports.length ? db.reports.map((report) => `
            <div class="row2"><span>${escapeHtml(titleForGame(report.id))}</span><span class="mu sm">reported by ${escapeHtml(report.by)}</span></div>
        `).join('') : '<p class="mu">No reports.</p>');
}

function account() {
    const currentUser = db.user;
    const tools = `<h2>Prototype tools</h2><p class="mu sm">These controls affect only this browser. Moderator mode does not grant server permissions.</p><div class="bar"><button class="b" data-a="mod">Moderator mode: ${db.mod ? 'on' : 'off'}</button><button class="b" data-a="rst">Reset local prototype data</button></div>`;

    if (!currentUser) {
        $('#app').innerHTML = `
            <h1>Account</h1>
            <p class="mu">Create an account or sign in with your email and password. Email confirmation may be required.</p>
            ${authClient ? '' : '<p class="mu">Supabase is not configured. Add your project URL and publishable key in script.js, then redeploy.</p>'}
            <div class="auth-form">
                <label>Email <input id="auth-email" type="email" autocomplete="email" required></label>
                <label>Password <input id="auth-password" type="password" autocomplete="new-password" minlength="6" required></label>
            </div>
            <div class="bar">
                <button class="b p" data-a="signIn">Sign in</button>
                <button class="b" data-a="signUp">Create account</button>
            </div>
            ${tools}
        `;
        return;
    }

    const favoriteGames = (db.favs[currentUser] || []).filter((gameId) => db.games.some((game) => game.id == gameId));
    const savedGameKeys = Object.keys(db.saves).filter((key) => key.startsWith(currentUser + '|'));

    $('#app').innerHTML = `
        <h1>${escapeHtml(currentUser)}</h1>
        <p class="mu">Signed in with Supabase. Published games and player data are not yet saved to the server.</p>
        <div class="bar"><button class="b" data-a="signOut">Sign out</button></div>
        <h2>Favorites</h2>
        ${favoriteGames.length ? favoriteGames.map((gameId) => `<div class="row2"><a href="#play-${gameId}">${escapeHtml(titleForGame(gameId))}</a></div>`).join('') : '<p class="mu">Nothing yet.</p>'}
        <h2>Saved data</h2>
        ${savedGameKeys.length ? savedGameKeys.map((key) => `
            <div class="row2">
                <span>${escapeHtml(titleForGame(key.split('|')[1]))}, ${(db.saves[key].length / 1024).toFixed(2)} KB of 100 KB</span>
                <button class="b" data-a="clr" data-v="${escapeHtml(key)}">Clear</button>
            </div>
        `).join('') : '<p class="mu">No saves yet.</p>'}
        ${tools}
    `;
}

const actionHandlers = {
    fav(_, button) {
        if (!db.user) return toast('Sign in to favorite games.');
        const favorites = (db.favs[db.user] = db.favs[db.user] || []);
        const favoriteIndex = favorites.indexOf(currentRoute.id);
        if (favoriteIndex < 0) {
            favorites.push(currentRoute.id);
            button.textContent = '♥ Favorited';
        } else {
            favorites.splice(favoriteIndex, 1);
            button.textContent = '♡ Favorite';
        }
        saveData();
    },
    fs() {
        const frame = $('#pf');
        const requestFullscreen = frame.requestFullscreen && frame.requestFullscreen();
        if (requestFullscreen && requestFullscreen.catch) requestFullscreen.catch(() => toast('Fullscreen isn’t available here.'));
    },
    rep() {
        db.reports.push({ id: currentRoute.id, by: displayName() });
        saveData();
        toast('Reported. A moderator will take a look.');
    },
    tab(value) {
        activeTab = value;
        $('#ed').value = draft[value];
        document.querySelectorAll('[data-a=tab]').forEach((button) => button.classList.toggle('on', button.dataset.v == value));
    },
    upl() {
        $('#up').click();
    },
    tpl() {
        draft = { ...starterTemplate };
        fillStudioInputs();
    },
    async sub() {
        if (!db.user) return toast('Sign in on the Account page to submit.');
        if (!draft.title.trim()) return toast('Add a title.');
        if (!draft.js.trim() && !draft.html.trim()) return toast('Nothing to submit yet.');
        if (draft.id) return toast('Submitting new versions is not connected yet. Start from a new game template.');
        if (new TextEncoder().encode(draft.html + draft.css + draft.js).length > 1_800_000) {
            return toast('This game is too large for D1 storage. The limit is about 1.8 MB.');
        }
        if (!authClient) return toast('Supabase is not configured.');

        try {
            const { data, error: sessionError } = await authClient.auth.getSession();
            if (sessionError) throw sessionError;
            if (!data.session) return toast('Sign in again before submitting.');

            const response = await fetch(`${API_BASE_URL}/api/games`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${data.session.access_token}`
                },
                body: JSON.stringify({
                    title: draft.title.trim(),
                    description: draft.desc,
                    color: getColor(draft.color),
                    html: draft.html,
                    css: draft.css,
                    js: draft.js
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `Submission failed (${response.status})`);
            if (typeof result.id !== 'string' || result.status !== 'pending') {
                throw new Error('The server returned an invalid submission response.');
            }

            const submittedGame = {
                id: result.id,
                author: db.user,
                versions: [{
                    n: 1,
                    status: 'pending',
                    reason: '',
                    title: draft.title.trim(),
                    desc: draft.desc,
                    color: getColor(draft.color),
                    html: draft.html,
                    css: draft.css,
                    js: draft.js
                }]
            };
            db.games.push(submittedGame);
            draft.id = result.id;
            saveData();
            toast('Submitted to the server for review.');
            studio();
        } catch (error) {
            toast(`Could not submit game: ${error.message}`);
        }
    },
    edit(gameId) {
        const game = db.games.find((entry) => entry.id == gameId);
        const latestVersion = game.versions[game.versions.length - 1];
        draft = {
            id: game.id,
            title: latestVersion.title,
            desc: latestVersion.desc,
            color: latestVersion.color,
            html: latestVersion.html,
            css: latestVersion.css,
            js: latestVersion.js
        };
        studio();
    },
    rvp(value) {
        const [, previewVersion] = findGameVersion(value);
        $('#rvw').innerHTML = '<div class="frame" style="margin-bottom:12px"><iframe id="rf" title="Review preview" sandbox="allow-scripts allow-pointer-lock"></iframe></div>';
        $('#rf').srcdoc = wrapDocument(buildGameDocument(previewVersion));
    },
    appr(value) {
        const [, version] = findGameVersion(value);
        version.status = 'approved';
        saveData();
        toast('Approved and published.');
        review();
    },
    rej(value) {
        const [game, version] = findGameVersion(value);
        const rejectReasonInput = $('#r' + game.id + version.n);
        const reason = rejectReasonInput.value.trim();
        if (!reason) return toast('Add a reason to reject.');
        version.status = 'rejected';
        version.reason = reason;
        saveData();
        toast('Rejected.');
        review();
    },
    async signUp() {
        if (!authClient) return toast('Add your Supabase project URL and publishable key in script.js first.');
        const email = $('#auth-email').value.trim();
        const password = $('#auth-password').value;
        if (!email || !password) return toast('Enter your email and password.');
        if (password.length < 6) return toast('Use a password with at least 6 characters.');
        try {
            const { data, error } = await authClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: location.origin }
            });
            if (error) return toast(error.message);
            if (data.session) {
                db.user = data.user.email;
                saveData();
                render();
                return toast('Account created and signed in.');
            }
            toast('Check your email to confirm your account, then sign in.');
        } catch (error) {
            toast(`Could not create account: ${error.message}`);
        }
    },
    async signIn() {
        if (!authClient) return toast('Add your Supabase project URL and publishable key in script.js first.');
        const email = $('#auth-email').value.trim();
        const password = $('#auth-password').value;
        if (!email || !password) return toast('Enter your email and password.');
        try {
            const { data, error } = await authClient.auth.signInWithPassword({ email, password });
            if (error) return toast(error.message);
            db.user = data.user.email;
            saveData();
            render();
            toast('Signed in.');
        } catch (error) {
            toast(`Could not sign in: ${error.message}`);
        }
    },
    async signOut() {
        if (!authClient) return toast('Supabase is not configured.');
        const { error } = await authClient.auth.signOut();
        if (error) return toast(error.message);
        db.user = '';
        saveData();
        render();
    },
    clr(key) {
        delete db.saves[key];
        saveData();
        render();
    },
    del(_, button) {
        if (button.dataset.c != '1') {
            button.dataset.c = '1';
            button.textContent = 'Click again to confirm';
            return;
        }

        const user = db.user;
        Object.keys(db.saves).forEach((key) => key.startsWith(user + '|') && delete db.saves[key]);
        delete db.favs[user];
        Object.keys(db.scores).forEach((key) => {
            db.scores[key] = db.scores[key].filter((score) => score.u != user);
        });
        db.user = '';
        saveData();
        toast('Account and saved data deleted.');
        render();
    },
    mod() {
        db.mod = !db.mod;
        saveData();
        render();
    },
    rst() {
        db = seedData();
        draft = { ...starterTemplate };
        saveData();
        render();
    }
};

document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-a]');
    if (trigger && actionHandlers[trigger.dataset.a]) {
        actionHandlers[trigger.dataset.a](trigger.dataset.v, trigger);
    }
});

addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.pb !== 1) return;

    const frame = [[currentRoute.id, $('#pf')], ['test', $('#pv')], ['test', $('#rf')]].find(([id, element]) => element && element.contentWindow === event.source);
    if (!frame) return;

    const [id, target] = frame;
    const saveKey = displayName() + '|' + id;
    let response = null;

    if (message.t == 'user') response = { name: displayName() };
    else if (message.t == 'save') {
        const serialized = JSON.stringify(message.d);
        response = !!serialized && serialized.length <= 102400;
        if (response) {
            db.saves[saveKey] = serialized;
            saveData();
        }
    } else if (message.t == 'load') {
        try {
            response = db.saves[saveKey] ? JSON.parse(db.saves[saveKey]) : null;
        } catch (error) {
            response = null;
        }
    } else if (message.t == 'score' && typeof message.d == 'number' && isFinite(message.d)) {
        const scores = (db.scores[id] = db.scores[id] || []);
        scores.push({ u: displayName(), s: message.d });
        scores.sort((left, right) => right.s - left.s);
        scores.length = Math.min(scores.length, 50);
        saveData();
        response = true;
        board(id);
    }

    if (target && target.id == 'pv') {
        const logger = $('#log');
        logger.textContent = ((logger.dataset.u ? logger.textContent + '\n' : '') + message.t + ' ' + JSON.stringify(message.d === undefined ? '' : message.d)).slice(-1500);
        logger.dataset.u = '1';
        logger.scrollTop = 1e9;
    }

    event.source.postMessage({ pb: 1, i: message.i, v: response }, '*');
});

addEventListener('hashchange', go);
go();

if (
    window.supabase &&
    SUPABASE_URL !== 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE' &&
    SUPABASE_PUBLISHABLE_KEY !== 'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE'
) {
    authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    authClient.auth.onAuthStateChange((_event, session) => {
        db.user = session?.user.email || '';
        saveData();
        render();
    });
    authClient.auth.getSession().then(({ data, error }) => {
        if (error) {
            toast(`Could not restore sign-in: ${error.message}`);
            return;
        }
        db.user = data.session?.user.email || '';
        saveData();
        render();
    });
} else if (SUPABASE_URL !== 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE') {
    toast('Supabase client library did not load. Check your internet connection and reload.');
}
