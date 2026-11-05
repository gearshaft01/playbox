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
let pendingRemoteGames = [];
let publicUsername = '';
let studioProjects = [];
let selectedStudioProjectId = '';
let moderatorAccess = false;
let moderatorAccessError = '';
let moderatorCheckPromise = null;
let moderatorCheckId = 0;
let moderatorUserId = '';

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
const publicAuthor = (author) => {
    if (typeof author !== 'string' || !author) return 'Player';
    if (author === db.user && publicUsername) return publicUsername;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(author) || author.includes('@')) return 'Player';
    return author || 'Player';
};
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

const authenticatedApiRequest = async (path, options = {}) => {
    if (!authClient) throw new Error('Supabase is not configured.');

    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Sign in before using moderation tools.');

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${data.session.access_token}`
        }
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`The API returned an unreadable response (${response.status}).`);
    }

    if (!response.ok) {
        throw new Error(result.error || `API request failed (${response.status}).`);
    }
    return result;
};

const board = (gameId) => {
    const leaderboard = $('#lb');
    if (!leaderboard) return;

    const entries = (db.scores[gameId] || []).slice(0, 5);
    leaderboard.innerHTML = entries.length
        ? entries.map((row, index) => `<div class="row2"><span>${index + 1}. ${escapeHtml(row.u)}</span><b>${row.s}</b></div>`).join('')
        : '<p class="mu">No scores yet. Be the first.</p>';
};

const resetModeratorAccess = () => {
    moderatorAccess = false;
    moderatorAccessError = '';
    moderatorCheckPromise = null;
    moderatorCheckId += 1;
    moderatorUserId = '';
    pendingRemoteGames = [];
};

const checkModeratorAccess = async (refresh = false) => {
    if (!authClient || !db.user) {
        moderatorAccess = false;
        moderatorAccessError = 'Sign in with a moderator account to access the review queue.';
        return false;
    }
    if (moderatorAccess && !refresh) return true;
    if (moderatorCheckPromise) return moderatorCheckPromise;
    if (refresh && moderatorAccess) {
        moderatorAccess = false;
        renderNavigation();
    }

    const checkId = ++moderatorCheckId;
    const promise = (async () => {
        try {
            const result = await authenticatedApiRequest('/api/moderation/pending');
            if (checkId !== moderatorCheckId) return false;
            if (!Array.isArray(result.games)) throw new Error('The API returned an invalid review queue.');
            moderatorAccess = true;
            moderatorAccessError = '';
            pendingRemoteGames = result.games;
            return true;
        } catch (error) {
            if (checkId === moderatorCheckId) {
                moderatorAccess = false;
                moderatorAccessError = error.message;
                pendingRemoteGames = [];
            }
            return false;
        } finally {
            if (checkId === moderatorCheckId) {
                moderatorCheckPromise = null;
                renderNavigation();
            }
        }
    })();
    moderatorCheckPromise = promise;
    return promise;
};

const renderNavigation = () => {
    $('#nav').innerHTML = [['browse', 'Browse'], ['studio', 'Studio'], ['docs', 'Game API'], ...(moderatorAccess ? [['review', 'Review']] : []), ['account', 'Account']]
        .map(([routeKey, label]) => `<a class="b${currentRoute.v == routeKey ? ' on' : ''}" href="#${routeKey}">${label}</a>`)
        .join('');
    $('#me').textContent = publicUsername || (db.user ? 'Signed in' : 'Guest');
};

function go() {
    const hash = location.hash.slice(1) || 'browse';
    if (hash.startsWith('play-private-')) {
        currentRoute = { v: 'play', id: decodeURIComponent(hash.slice(13)), ownerOnly: true };
    } else if (hash.startsWith('play-api-')) {
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
    const views = { browse, play, studio, docs, review, account };
    (views[currentRoute.v] || browse)();
}

async function browse() {
    $('#app').innerHTML = '<h1>Games made by players</h1><p class="mu">Every game here was checked by a moderator and runs in a locked sandbox.</p><input id="q" type="search" placeholder="Search games" aria-label="Search games"><div class="grid" id="gr"></div>';
    let remoteGames = [];

    const redrawCatalog = () => {
        const query = $('#q').value.toLowerCase();
        const localCards = publishedGames()
            .filter(({ game, version }) => `${version.title} ${publicAuthor(game.author)}`.toLowerCase().includes(query))
            .map(({ game, version }) => `
                <a class="card" href="#play-${game.id}">
                    <div class="th" style="background:${getColor(version.color)}">${escapeHtml(version.title[0] || '?')}</div>
                    <div class="ct"><b>${escapeHtml(version.title)}</b><span class="mu sm">♥ ${countLikes(game.id)}</span></div>
                    <div class="mu sm" style="padding:0 12px 10px">by ${escapeHtml(publicAuthor(game.author))}</div>
                </a>
            `);
        const remoteCards = remoteGames
            .filter((game) => `${game.title} ${publicAuthor(game.author)}`.toLowerCase().includes(query))
            .map((game) => `
                <a class="card" href="#play-api-${encodeURIComponent(game.id)}">
                    <div class="th" style="background:${getColor(game.color)}">${escapeHtml(game.title[0] || '?')}</div>
                    <div class="ct"><b>${escapeHtml(game.title)}</b></div>
                    <div class="mu sm" style="padding:0 12px 10px">by ${escapeHtml(publicAuthor(game.author))}</div>
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

    if (currentRoute.remote || currentRoute.ownerOnly) {
        const requestedGameId = currentRoute.id;
        $('#app').innerHTML = '<p class="mu">Loading game…</p>';
        try {
            const response = currentRoute.ownerOnly
                ? await (async () => {
                    if (!authClient) throw new Error('Sign in to play your private project.');
                    const { data, error } = await authClient.auth.getSession();
                    if (error) throw error;
                    if (!data.session) throw new Error('Sign in to play your private project.');
                    return fetch(`${API_BASE_URL}/api/my/games/${encodeURIComponent(requestedGameId)}/play`, {
                        headers: { Authorization: `Bearer ${data.session.access_token}` }
                    });
                })()
                : await fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(requestedGameId)}`);
            if (!response.ok) {
                if (response.status === 404) throw new Error('Game not found or not published.');
                throw new Error(`API request failed (${response.status})`);
            }
            const result = await response.json();
            if (!result.game) throw new Error('API returned an invalid game response');
            if (currentRoute.v !== 'play' || currentRoute.id !== requestedGameId) return;
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
            if (currentRoute.v !== 'play' || currentRoute.id !== requestedGameId) return;
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
        <p class="mu">by ${escapeHtml(publicAuthor(game.author))}, version ${version.n}</p>
        <div class="frame"><iframe id="pf" title="${escapeHtml(version.title)}" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen"></iframe></div>
        <div class="bar">
            <button class="b" data-a="fav">${isFavorite ? '♥ Favorited' : '♡ Favorite'}</button>
            <button class="b" data-a="fs">Fullscreen</button>
            <button class="b" data-a="rep">Report</button>
        </div>
        <p>${escapeHtml(version.desc)}</p>
        <h2>Top scores</h2>
        <div id="lb"></div>
        <p class="mu sm">${db.user ? 'Signed in as ' + escapeHtml(publicUsername || 'Player') + '. Your progress is saved to your account.' : 'Playing as guest. Your progress is saved locally only.'}</p>
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

const renderStudioProjects = () => {
    const list = $('#project-list');
    const actions = $('#project-actions');
    if (!list || !actions) return;

    if (!studioProjects.some((project) => project.id === selectedStudioProjectId)) {
        selectedStudioProjectId = '';
    }
    list.innerHTML = studioProjects.length
        ? studioProjects.map((project) => {
            const visibility = project.visibility === 'private' ? 'Private' : 'Public';
            const selected = project.id === selectedStudioProjectId;
            return `<button type="button" class="studio-project${selected ? ' selected' : ''}" data-a="selectProject" data-v="${escapeHtml(project.id)}" aria-pressed="${selected}">
                <span class="studio-project-title">${escapeHtml(project.title)}</span>
                <span class="studio-project-meta">v${escapeHtml(project.version_number)} · ${escapeHtml(project.status)} · ${visibility}</span>
            </button>`;
        }).join('')
        : '<p class="mu studio-empty">No projects yet. Create a game to get started.</p>';
    actions.hidden = !selectedStudioProjectId;

    const selectedProject = studioProjects.find((project) => project.id === selectedStudioProjectId);
    const visibilityButton = $('#toggle-visibility');
    if (visibilityButton && selectedProject) {
        visibilityButton.textContent = selectedProject.visibility === 'private'
            ? 'Make public'
            : 'Archive (make private)';
    }

    const status = $('#project-status');
    if (status) {
        status.textContent = studioProjects.length
            ? `${studioProjects.length} project${studioProjects.length === 1 ? '' : 's'} saved to your account.`
            : 'No server projects yet. Create a game below and submit it for review.';
    }
};

async function loadStudioProjects() {
    const status = $('#project-status');
    if (!db.user) {
        studioProjects = [];
        renderStudioProjects();
        if (status) status.textContent = 'Sign in to manage projects across devices.';
        return;
    }

    if (status) status.textContent = 'Loading your projects…';
    try {
        const result = await authenticatedApiRequest('/api/my/games');
        if (currentRoute.v !== 'studio') return;
        if (!Array.isArray(result.games)) throw new Error('The API returned an invalid project list.');
        studioProjects = result.games;
        renderStudioProjects();
    } catch (error) {
        if (currentRoute.v !== 'studio') return;
        studioProjects = [];
        renderStudioProjects();
        if (status) status.textContent = `Could not load projects: ${error.message}`;
    }
}

function studio() {
    activeTab = 'html';
    selectedStudioProjectId = draft.id || '';

    $('#app').innerHTML = `
        <h1>Studio</h1>
        <p class="mu">A game is one file: HTML, CSS and JavaScript. Write it here or upload your own files and Studio bundles them. Use data: URLs for images and audio, and no external links.</p>
        <div class="studio-shell">
            <aside class="studio-sidebar" aria-label="Your projects">
                <div class="studio-sidebar-heading">
                    <h2>My projects</h2>
                    <button class="b" data-a="newProject">New</button>
                </div>
                <p id="project-status" class="mu studio-status">Loading your projects…</p>
                <div id="project-list" class="studio-project-list"></div>
                <div class="studio-project-actions" id="project-actions" hidden>
                    <button class="b p" data-a="editProject">Open selected</button>
                    <button class="b" data-a="playProject">Play</button>
                    <button class="b" id="toggle-visibility" data-a="toggleVisibility">Archive (make private)</button>
                    <button class="b" data-a="deleteProject">Delete permanently</button>
                </div>
            </aside>
            <div class="studio-main">
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
                <button class="b p" data-a="sub">Submit for review</button>
                <span class="mu sm">${db.user ? 'Signed in as ' + escapeHtml(publicUsername || 'Player') + '.' : 'Sign in on the Account page to submit.'}</span>
            </div>
        </div>
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
    renderStudioProjects();
    loadStudioProjects();
}

function docs() {
    const examples = [
        {
            name: 'Playbox.getUser()',
            signature: 'Playbox.getUser() -> Promise<{ name: string }>',
            description: 'Gets the current player label. The name is the signed-in email or "guest"; the saved public username is not currently available through the game SDK. Avoid displaying this value publicly.',
            example: `const user = await Playbox.getUser();\nconsole.log(user.name);`
        },
        {
            name: 'Playbox.saveData(data)',
            signature: 'Playbox.saveData(data) -> Promise<boolean>',
            description: 'Saves JSON-serializable progress for this player and game in this browser. Resolves true when saved, or false if it exceeds the roughly 100 KB limit.',
            example: `const saved = await Playbox.saveData({ level: 4, coins: 25 });\nif (!saved) console.log('Save is too large.');`
        },
        {
            name: 'Playbox.loadData()',
            signature: 'Playbox.loadData() -> Promise<any | null>',
            description: 'Loads this player’s saved data for this game from this browser. Resolves to the saved value, or null when no save exists.',
            example: `const data = await Playbox.loadData();\nconst level = data?.level ?? 1;`
        },
        {
            name: 'Playbox.submitScore(score)',
            signature: 'Playbox.submitScore(score) -> Promise<boolean>',
            description: 'Submits a finite numeric score to the game’s leaderboard. Scores are currently stored in this browser only; up to 50 scores are kept per game.',
            example: `const score = 1200;\nawait Playbox.submitScore(score);`
        }
    ];

    $('#app').innerHTML = `
        <h1>Game API</h1>
        <p class="mu">Use these methods in your game JavaScript. Playbox is injected into games in Browse, Play, and Studio preview.</p>
        <div class="bar"><a class="b" href="#studio">Back to Studio</a></div>
        <div class="docs-notice">
            <b>Current storage limits</b>
            <p>Game saves and scores are stored in the current browser and are not synced across devices or uploaded to the Playbox database yet. Player account usernames are used for published game attribution, but the game SDK does not currently provide a username lookup.</p>
        </div>
        <h2>Available methods</h2>
        <div class="docs-list">
            ${examples.map((entry) => `
                <article class="docs-method">
                    <h3>${escapeHtml(entry.name)}</h3>
                    <code class="docs-signature">${escapeHtml(entry.signature)}</code>
                    <p>${escapeHtml(entry.description)}</p>
                    <pre><code>${escapeHtml(entry.example)}</code></pre>
                </article>
            `).join('')}
        </div>
        <h2>Complete example</h2>
        <pre class="docs-example"><code>${escapeHtml(`async function startGame() {
  const user = await Playbox.getUser();
  const saved = await Playbox.loadData();
  let score = saved?.bestScore ?? 0;

  document.querySelector('#player').textContent = user.name;
  document.querySelector('#score').textContent = score;

  function finishGame(finalScore) {
    Playbox.submitScore(finalScore);
    if (finalScore > score) {
      score = finalScore;
      Playbox.saveData({ bestScore: score });
    }
  }
}`)}</code></pre>
        <p class="mu sm">These methods return Promises, so use <code>await</code> or <code>.then(...)</code>. Games run in a sandbox and cannot make direct network requests.</p>
    `;
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

async function review() {
    $('#app').innerHTML = '<h1>Review queue</h1><p class="mu">Checking moderator access…</p>';

    if (!await checkModeratorAccess(true)) {
        if (currentRoute.v !== 'review') return;
        $('#app').innerHTML = `<h1>Review unavailable</h1><p class="mu">${escapeHtml(moderatorAccessError || 'Moderator access required.')}</p>`;
        return;
    }
    if (currentRoute.v !== 'review') return;

    try {
        const pending = pendingRemoteGames;
        $('#app').innerHTML = '<h1>Review queue</h1><div id="rvw"></div>' +
            (pending.length ? pending.map((game) => {
                const version = {
                    title: game.title,
                    desc: game.description,
                    color: game.color,
                    html: game.html,
                    css: game.css,
                    js: game.js
                };
                const previewDoc = buildGameDocument(version);
                const warnings = scanCode(previewDoc);
                const key = `${game.game_id}.${game.version_number}`;
                return `<div class="row2"><div><b>${escapeHtml(game.title)}</b> v${game.version_number} by ${escapeHtml(publicAuthor(game.author))}<div class="mu sm">${escapeHtml(game.description)}</div><div>${(previewDoc.length / 1024).toFixed(1)} KB ${warnings.map((warning) => `<span class="chip wn">${escapeHtml(warning)}</span>`).join('') || '<span class="chip ok">no flags</span>'}</div><input id="r${game.game_id}${game.version_number}" placeholder="Reason (required to reject)" aria-label="Rejection reason"></div><div class="bar"><button class="b" data-a="rvp" data-v="${key}">Play</button><button class="b p" data-a="appr" data-v="${key}">Approve</button><button class="b" data-a="rej" data-v="${key}">Reject</button></div></div>`;
            }).join('') : '<p>Nothing waiting for review.</p>') +
            '<h2>Reports</h2><p class="mu">Report management is not connected to the server yet.</p>';
    } catch (error) {
        if (currentRoute.v !== 'review') return;
        $('#app').innerHTML = `<h1>Review queue unavailable</h1><p class="mu">${escapeHtml(error.message)}</p>`;
    }
}

async function account() {
    const currentUser = db.user;
    const tools = `<h2>Prototype tools</h2><p class="mu sm">These controls affect only this browser. Moderator mode does not grant server permissions.</p><div class="bar"><button class="b" data-a="mod">Moderator mode: ${db.mod ? 'on' : 'off'}</button><button class="b" data-a="rst">Reset local prototype data</button></div>`;

    if (!currentUser) {
        publicUsername = '';
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
    let profileNotice = '';

    try {
        const result = await authenticatedApiRequest('/api/profile');
        if (currentRoute.v !== 'account' || db.user !== currentUser) return;
        if (typeof result.username !== 'string') throw new Error('The API returned an invalid username profile.');
        publicUsername = result.username;
        renderNavigation();
    } catch (error) {
        if (currentRoute.v !== 'account' || db.user !== currentUser) return;
        profileNotice = `<p class="mu">Could not load your username: ${escapeHtml(error.message)}</p>`;
    }

    $('#app').innerHTML = `
        <h1>Account</h1>
        <p class="mu">Signed in with Supabase. Published games and player data are not yet saved to the server.</p>
        <div class="bar"><button class="b" data-a="signOut">Sign out</button></div>
        <h2>Public username</h2>
        <p class="mu">This name appears as the author of your games. Your account ID stays private.</p>
        ${profileNotice}
        <div class="auth-form">
            <label>Username <input id="public-username" type="text" value="${escapeHtml(publicUsername)}" minlength="3" maxlength="24" autocomplete="username"></label>
        </div>
        <button class="b p" data-a="saveUsername">Save username</button>
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
        if (!publicUsername) return toast('Choose and save a public username on the Account page before submitting.');
        if (!draft.title.trim()) return toast('Add a title.');
        if (!draft.js.trim() && !draft.html.trim()) return toast('Nothing to submit yet.');
        if (new TextEncoder().encode(draft.html + draft.css + draft.js).length > 1_800_000) {
            return toast('This game is too large for D1 storage. The limit is about 1.8 MB.');
        }

        try {
            const isNewProject = !draft.id;
            const path = isNewProject
                ? '/api/games'
                : `/api/my/games/${encodeURIComponent(draft.id)}/versions`;
            const result = await authenticatedApiRequest(path, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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
            if (isNewProject) {
                if (typeof result.id !== 'string' || result.status !== 'pending') {
                    throw new Error('The server returned an invalid submission response.');
                }
                draft.id = result.id;
            } else if (result.status !== 'pending') {
                throw new Error('The server returned an invalid version response.');
            }

            selectedStudioProjectId = draft.id;
            saveData();
            toast(`Version ${result.version_number || 1} submitted for review.`);
            await loadStudioProjects();
        } catch (error) {
            toast(`Could not submit game: ${error.message}`);
        }
    },
    async editProject() {
        const projectId = selectedStudioProjectId;
        const project = studioProjects.find((entry) => entry.id === projectId);
        if (!project) return toast('Select a project first.');
        draft = {
            id: project.id,
            title: project.title,
            desc: project.description,
            color: project.color,
            html: project.html,
            css: project.css,
            js: project.js
        };
        selectedStudioProjectId = project.id;
        fillStudioInputs();
        toast(`Editing ${project.title}. Submitting changes creates a new review version.`);
    },
    selectProject(projectId) {
        selectedStudioProjectId = projectId;
        renderStudioProjects();
    },
    newProject() {
        draft = { ...starterTemplate };
        selectedStudioProjectId = '';
        activeTab = 'html';
        fillStudioInputs();
        renderStudioProjects();
    },
    playProject() {
        const projectId = selectedStudioProjectId;
        if (!projectId) return toast('Select a project first.');
        location.hash = `#play-private-${encodeURIComponent(projectId)}`;
    },
    async toggleVisibility() {
        const projectId = selectedStudioProjectId;
        const project = studioProjects.find((entry) => entry.id === projectId);
        if (!project) return toast('Select a project first.');
        const visibility = project.visibility === 'private' ? 'public' : 'private';
        try {
            await authenticatedApiRequest(`/api/my/games/${encodeURIComponent(projectId)}/visibility`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibility })
            });
            toast(visibility === 'private' ? 'Project archived and made private.' : 'Project made public.');
            await loadStudioProjects();
        } catch (error) {
            toast(`Could not update project visibility: ${error.message}`);
        }
    },
    async deleteProject() {
        const projectId = selectedStudioProjectId;
        const project = studioProjects.find((entry) => entry.id === projectId);
        if (!project) return toast('Select a project first.');
        if (!confirm(`Permanently delete "${project.title}" and all its versions, saves, favorites, and scores? This cannot be undone.`)) return;
        try {
            await authenticatedApiRequest(`/api/my/games/${encodeURIComponent(projectId)}`, {
                method: 'DELETE'
            });
            studioProjects = studioProjects.filter((entry) => entry.id !== projectId);
            selectedStudioProjectId = '';
            if (draft.id === projectId) draft = { ...starterTemplate };
            fillStudioInputs();
            renderStudioProjects();
            toast('Project permanently deleted.');
        } catch (error) {
            toast(`Could not delete project: ${error.message}`);
        }
    },
    rvp(value) {
        const [gameId, versionNumber] = value.split('.');
        const game = pendingRemoteGames.find((entry) =>
            entry.game_id === gameId && String(entry.version_number) === versionNumber
        );
        if (!game) return toast('That pending game is no longer in the review queue.');
        const previewVersion = {
            title: game.title,
            desc: game.description,
            color: game.color,
            html: game.html,
            css: game.css,
            js: game.js
        };
        $('#rvw').innerHTML = '<div class="frame" style="margin-bottom:12px"><iframe id="rf" title="Review preview" sandbox="allow-scripts allow-pointer-lock"></iframe></div>';
        $('#rf').srcdoc = wrapDocument(buildGameDocument(previewVersion));
    },
    async appr(value) {
        const [gameId, versionNumber] = value.split('.');
        try {
            await authenticatedApiRequest(
                `/api/moderation/games/${encodeURIComponent(gameId)}/versions/${encodeURIComponent(versionNumber)}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'approved' })
                }
            );
            toast('Approved and published.');
            await review();
        } catch (error) {
            toast(`Could not approve game: ${error.message}`);
        }
    },
    async rej(value) {
        const [gameId, versionNumber] = value.split('.');
        const rejectReasonInput = document.getElementById(`r${gameId}${versionNumber}`);
        const reason = rejectReasonInput?.value.trim();
        if (!reason) return toast('Add a reason to reject.');
        try {
            await authenticatedApiRequest(
                `/api/moderation/games/${encodeURIComponent(gameId)}/versions/${encodeURIComponent(versionNumber)}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'rejected', reason })
                }
            );
            toast('Rejected.');
            await review();
        } catch (error) {
            toast(`Could not reject game: ${error.message}`);
        }
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
        publicUsername = '';
        saveData();
        render();
    },
    async saveUsername() {
        const input = $('#public-username');
        const username = input.value.trim();
        if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
            return toast('Use 3–24 letters, numbers, or underscores.');
        }

        try {
            const result = await authenticatedApiRequest('/api/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            if (typeof result.username !== 'string') throw new Error('The API returned an invalid username profile.');
            publicUsername = result.username;
            renderNavigation();
            toast('Username saved.');
            await account();
        } catch (error) {
            toast(`Could not save username: ${error.message}`);
        }
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

if (window.supabase && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
    authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const syncAuthSession = (session) => {
        const userId = session?.user.id || '';
        if (userId !== moderatorUserId) resetModeratorAccess();
        moderatorUserId = userId;
        db.user = session?.user.email || '';
        publicUsername = '';
        saveData();
        render();
        if (userId) checkModeratorAccess();
    };
    authClient.auth.onAuthStateChange((_event, session) => syncAuthSession(session));
    authClient.auth.getSession().then(({ data, error }) => {
        if (error) {
            toast(`Could not restore sign-in: ${error.message}`);
            return;
        }
        syncAuthSession(data.session);
    });
} else if (!window.supabase) {
    toast('Supabase client library did not load. Check your internet connection and reload.');
} else {
    toast('Supabase is not configured. Add your project URL and publishable key in script.js.');
}
