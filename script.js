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
const CONTACT_EMAIL = ''; // shown on the privacy page and used for takedown requests; set before launch
let lastUserId = '';

const safeImageUrl = (url) => (typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(url) ? url : '');
const tagList = (value) => (Array.isArray(value) ? value : String(value || '').split(','))
    .map((tag) => String(tag).trim().toLowerCase().replace(/[^a-z0-9 -]/g, ''))
    .filter((tag, index, all) => tag.length >= 2 && tag.length <= 20 && all.indexOf(tag) === index)
    .slice(0, 5);
const thumbMarkup = (item) => {
    const source = /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(item.thumbData || '')
        ? item.thumbData
        : safeImageUrl(item.thumb_url);
    return source
        ? `<img src="${source}" alt="" loading="lazy">`
        : escapeHtml((item.title || '?')[0] || '?');
};
const shrinkImage = (file) => new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5e6) return reject(new Error('Unsupported image'));
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 300;
            const scale = Math.max(480 / image.width, 300 / image.height);
            const width = image.width * scale;
            const height = image.height * scale;
            canvas.getContext('2d').drawImage(image, (480 - width) / 2, (300 - height) / 2, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
});
const refreshCardPreview = () => {
    const card = $('#pc');
    if (!card) return;
    card.innerHTML = `<div class="th" style="background:${getColor(draft.color)}">${thumbMarkup(draft)}</div><div class="ct"><b>${escapeHtml(draft.title || 'Untitled')}</b><span class="mu sm">♥ 0</span></div><div class="mu sm dd" style="padding:0 12px 10px">${escapeHtml(draft.desc || '')}</div>`;
};

let memory = null;
let toastHandle;
let storageWarningShown = false;
let activeTab = 'html';
let currentRoute = { v: 'browse' };
let authClient = null;
let pendingRemoteGames = [];
let publicUsername = '';
let studioProjects = [];
let selectedStudioProjectId = '';
let studioWorkspaceOpen = false;
let studioFolders = new Set();
let studioTreeInitialized = false;
let activeProjectFilePath = '';
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
    about: '',
    tags: '',
    thumbData: '',
    thumb_url: '',
    removeThumb: false,
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
let draft = { ...starterTemplate, ...(db.draft || {}) };
db.user = '';

const saveData = () => {
    memory = db;
    try {
        localStorage.setItem(KEY, JSON.stringify({ ...db, user: '' }));
        storageWarningShown = false;
    } catch {
        if (!storageWarningShown) {
            toast('Your changes could not be saved in this browser. Free up storage space and try again.');
            storageWarningShown = true;
        }
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
    const views = { browse, play, studio, docs, review, account, privacy };
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
                    <div class="th" style="background:${getColor(version.color)}">${thumbMarkup(version)}</div>
                    <div class="ct"><b>${escapeHtml(version.title)}</b><span class="mu sm">♥ ${countLikes(game.id)}</span></div>
                    <div class="mu sm dd" style="padding:0 12px 4px">${escapeHtml(version.desc || '')}</div>
                    <div class="mu sm" style="padding:0 12px 10px">by ${escapeHtml(publicAuthor(game.author))}</div>
                </a>
            `);
        const remoteCards = remoteGames
            .filter((game) => `${game.title} ${publicAuthor(game.author)} ${tagList(game.tags).join(' ')}`.toLowerCase().includes(query))
            .map((game) => `
                <a class="card" href="#play-api-${encodeURIComponent(game.id)}">
                    <div class="th" style="background:${getColor(game.color)}">${thumbMarkup(game)}</div>
                    <div class="ct"><b>${escapeHtml(game.title)}</b></div>
                    <div class="mu sm dd" style="padding:0 12px 4px">${escapeHtml(game.description || '')}</div>
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
                js: remoteVersion.js,
                about: remoteVersion.about || '',
                tags: remoteVersion.tags || []
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
        <div>${tagList(version.tags).map((tag) => `<span class="chip mu">${escapeHtml(tag)}</span>`).join('')}</div>
        ${version.about ? `<h2>About this game</h2><p class="about">${escapeHtml(version.about)}</p>` : ''}
        <h2>Top scores</h2>
        <div id="lb"></div>
        <p class="mu sm">${db.user ? 'Signed in as ' + escapeHtml(publicUsername || 'Player') + '. Your progress is saved to your account.' : 'Playing as guest. Your progress is saved locally only.'}</p>
    `;

    $('#pf').srcdoc = wrapDocument(buildGameDocument(version));
    board(game.id);
}

const runPreview = () => {
    const game = compileStudioProject(draft);
    const source = buildGameDocument(game, draft.title);
    const warnings = scanCode(source);
    $('#pv').srcdoc = wrapDocument(source);
    $('#fl').innerHTML = (warnings.length
        ? warnings.map((warning) => `<span class="chip wn">${escapeHtml(warning)}</span>`).join('')
        : '<span class="chip ok">No problems found</span>') + `<span class="mu sm">${(source.length / 1024).toFixed(1)} KB of 5 MB</span>`;

    refreshCardPreview();
    db.draft = draft;
    db.draftUser = db.user;
    saveData();
};

let previewTimer;
const triggerPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, 500);
};

const fillStudioInputs = () => {
    $('#ti').value = draft.title;
    const workspaceTitle = $('#workspace-title');
    if (workspaceTitle) workspaceTitle.textContent = draft.title || 'Untitled game';
    $('#ds').value = draft.desc;
    $('#co').value = getColor(draft.color);
    $('#ab').value = draft.about || '';
    $('#tg').value = draft.tags || '';
    $('#ed').value = draft[activeTab];
    runPreview();
};

const studioFileNames = { html: 'index.html', css: 'style.css', js: 'script.js' };

const normalizeProjectPath = (path) => String(path || '').replace(/\\/g, '/').split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.')
    .filter((part) => part !== '..')
    .join('/');

const projectFileType = (path) => path.split('.').pop().toLowerCase();

const compileStudioProject = (project) => {
    const files = Array.isArray(project.files) ? project.files : [];
    const findFile = (reference) => {
        const path = normalizeProjectPath(reference);
        const exact = files.find((entry) => normalizeProjectPath(entry.path) === path);
        if (exact) return exact;
        const name = path.split('/').pop();
        const matches = files.filter((entry) => entry.path.split('/').pop() === name);
        return matches.length === 1 ? matches[0] : null;
    };
    let html = project.html;
    let css = project.css;
    let js = project.js;
    const assets = files.filter((file) => file.dataUrl || projectFileType(file.path) === 'svg');
    const projectText = Object.fromEntries(files
        .filter((file) => !file.dataUrl && !['js', 'css', 'svg'].includes(projectFileType(file.path)))
        .map((file) => [file.path, file.content || '']));

    for (const file of files) {
        const type = projectFileType(file.path);
        if (type === 'css') css += `\n\n${file.content || ''}`;
        if (type === 'js') js += `\n;\n${file.content || ''}`;
    }
    if (Object.keys(projectText).length) {
        js = `window.Playbox.files = ${JSON.stringify(projectText)};\n${js}`;
    }

    html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script\s*>/gi, (tag, src) => {
        const file = findFile(src);
        const coreScript = ['script.js', 'src/script.js'].includes(normalizeProjectPath(src));
        return (file && projectFileType(file.path) === 'js') || coreScript ? '' : tag;
    });
    html = html.replace(/<link\b(?=[^>]*\brel=["']?stylesheet["']?)[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
        const file = findFile(href);
        const coreStyle = ['style.css', 'src/style.css'].includes(normalizeProjectPath(href));
        return (file && projectFileType(file.path) === 'css') || coreStyle ? '' : tag;
    });

    for (const asset of assets) {
        const encoded = asset.dataUrl || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.content || '')}`;
        const paths = [normalizeProjectPath(asset.path), asset.path.split('/').pop()];
        for (const path of new Set(paths)) {
            const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const reference = new RegExp(`(?<![A-Za-z0-9_])(?:\\.\\/)?${escapedPath.replace(/\//g, '\\/')}(?![A-Za-z0-9_.-])`, 'g');
            html = html.replace(reference, encoded);
            css = css.replace(reference, encoded);
            js = js.replace(reference, encoded);
        }
    }

    return { ...project, html, css, js };
};

const projectTextExtensions = new Set(['js', 'css', 'json', 'txt', 'svg', 'md', 'xml', 'csv', 'html', 'htm']);

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
});

const renderActiveStudioFile = () => {
    const file = activeProjectFilePath && draft.files.find((entry) => entry.path === activeProjectFilePath);
    const editor = $('#ed');
    const preview = $('#asset-preview');
    const deleteButton = $('[data-a="deleteProjectFile"]');
    if (!editor) return;
    $('#editor-file-name').textContent = file ? file.path : studioFileNames[activeTab];
    deleteButton.hidden = !file;
    preview.hidden = !(file && file.dataUrl);
    if (file && file.dataUrl) {
        editor.hidden = true;
        preview.innerHTML = `<p>${escapeHtml(file.path)} is a binary asset. Its references are embedded when publishing.</p>${file.dataUrl.startsWith('data:image/') ? `<img src="${file.dataUrl}" alt="${escapeHtml(file.path)}">` : ''}`;
    } else {
        editor.hidden = false;
        preview.innerHTML = '';
        editor.value = file ? file.content : draft[activeTab];
        editor.setAttribute('aria-label', file ? `Editor for ${file.path}` : 'Code editor');
    }
    renderStudioFileTree();
};

const renderStudioFileTree = () => {
    const tree = $('#file-tree');
    if (!tree) return;
    if (!Array.isArray(draft.files)) draft.files = [];
    const files = [
        ...Object.entries(studioFileNames).map(([type, name]) => ({ path: `src/${name}`, type, core: true })),
        ...draft.files.map((file) => ({ ...file, path: normalizeProjectPath(file.path) }))
    ];
    if (!studioTreeInitialized) {
        studioFolders.add('');
        const addExpandedPath = (path, includeLeaf) => {
            const parts = normalizeProjectPath(path).split('/');
            if (!includeLeaf) parts.pop();
            for (let index = 1; index <= parts.length; index += 1) studioFolders.add(parts.slice(0, index).join('/'));
        };
        files.forEach((file) => addExpandedPath(file.path, false));
        (draft.folders || []).forEach((path) => addExpandedPath(path, true));
        studioTreeInitialized = true;
    }
    const folders = new Set(studioFolders);
    for (const file of files) {
        const parts = file.path.split('/');
        parts.pop();
        for (let index = 1; index <= parts.length; index += 1) folders.add(parts.slice(0, index).join('/'));
    }
    for (const folder of draft.folders || []) folders.add(normalizeProjectPath(folder));

    const renderFolder = (folderPath = '') => {
        const childFolders = [...folders]
            .filter((path) => path && path.substring(0, path.lastIndexOf('/')) === folderPath)
            .sort((left, right) => left.localeCompare(right));
        const childFiles = files
            .filter((file) => file.path.substring(0, file.path.lastIndexOf('/')) === folderPath)
            .sort((left, right) => left.path.localeCompare(right.path));
        return [
            ...childFolders.map((path) => {
                const name = path.split('/').pop();
                const expanded = studioFolders.has(path);
                return `<div class="file-tree-entry"><button type="button" role="treeitem" class="file-tree-folder" data-a="toggleFolder" data-v="${escapeHtml(path)}" aria-expanded="${expanded}"><span aria-hidden="true">${expanded ? '▾' : '▸'}</span> ${escapeHtml(name)}</button>${expanded ? `<div class="file-tree-children" role="group">${renderFolder(path)}</div>` : ''}</div>`;
            }),
            ...childFiles.map((file) => {
                const isSelected = file.core ? !activeProjectFilePath && activeTab === file.type : activeProjectFilePath === file.path;
                const action = file.core ? 'fileTab' : 'openProjectFile';
                const value = file.core ? file.type : file.path;
                const icon = file.dataUrl || file.core ? '▧' : '▤';
                return `<button type="button" role="treeitem" class="file-tree-file${isSelected ? ' selected' : ''}" data-a="${action}" data-v="${escapeHtml(value)}" aria-current="${isSelected ? 'page' : 'false'}"><span aria-hidden="true">${icon}</span> ${escapeHtml(file.path.split('/').pop())}</button>`;
            })
        ].join('');
    };
    tree.innerHTML = `<button type="button" role="treeitem" class="file-tree-folder file-tree-root" data-a="toggleFolder" data-v="" aria-expanded="${studioFolders.has('')}"><span aria-hidden="true">${studioFolders.has('') ? '▾' : '▸'}</span> ${escapeHtml(draft.title || 'Game project')}</button>${studioFolders.has('') ? `<div class="file-tree-children" role="group">${renderFolder()}</div>` : ''}`;
};

const addProjectPath = (path, isFolder) => {
    const rawPath = String(path || '').trim().replace(/\\/g, '/');
    if (!rawPath || /[\u0000-\u001f]/.test(rawPath) || rawPath.split('/').some((part) => part === '..')) {
        toast('Enter a valid project path.');
        return false;
    }
    const normalized = normalizeProjectPath(rawPath);
    if (!normalized || normalized.startsWith('/')) {
        toast('Enter a valid project path.');
        return false;
    }
    if (isFolder) {
        const filePaths = [...(draft.files || []).map((file) => file.path), ...Object.values(studioFileNames).map((name) => `src/${name}`)];
        const hasFileConflict = filePaths.some((filePath) =>
            filePath === normalized || normalized.startsWith(`${filePath}/`)
        );
        if (hasFileConflict) {
            toast('A file already uses that path.');
            return false;
        }
        draft.folders = [...new Set([...(draft.folders || []), normalized])];
        const parts = normalized.split('/');
        for (let index = 1; index <= parts.length; index += 1) studioFolders.add(parts.slice(0, index).join('/'));
    } else {
        const extension = projectFileType(normalized);
        if (!projectTextExtensions.has(extension)) {
            toast('Choose a text file type such as .js, .css, .json, .txt, or .svg.');
            return false;
        }
        const exists = (draft.files || []).some((file) => file.path === normalized) ||
            Object.values(studioFileNames).some((name) => `src/${name}` === normalized) ||
            (draft.folders || []).some((folder) => normalizeProjectPath(folder) === normalized);
        if (exists) {
            toast('A file already uses that path.');
            return false;
        }
        if ([...(draft.files || []).map((file) => file.path), ...Object.values(studioFileNames).map((name) => `src/${name}`)]
            .some((filePath) => filePath.startsWith(`${normalized}/`))) {
            toast('That path is already used by a folder.');
            return false;
        }
        draft.files = [...(draft.files || []), { path: normalized, content: '' }];
        activeProjectFilePath = normalized;
        const parts = normalized.split('/');
        parts.pop();
        for (let index = 1; index <= parts.length; index += 1) studioFolders.add(parts.slice(0, index).join('/'));
    }
    studioFolders.add('');
    runPreview();
    if (!isFolder) renderActiveStudioFile();
    else renderStudioFileTree();
    return true;
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
            : 'No saved projects yet. Create a game to get started.';
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
    if (studioWorkspaceOpen) {
        renderStudioWorkspace();
    } else {
        renderStudioDashboard();
    }
    loadStudioProjects();
}

function renderStudioDashboard() {
    $('#app').innerHTML = `
        <section class="studio-page studio-dashboard">
            <div class="studio-dashboard-heading">
                <div><p class="studio-eyebrow">PLAYBOX STUDIO</p><h1>Your games</h1><p class="mu">Open a project to keep building, or start something new.</p></div>
                <button class="b p" data-a="newProject">＋ New project</button>
            </div>
            <div class="studio-dashboard-grid">
                <section class="studio-panel" aria-label="Your projects">
                    <div class="studio-sidebar-heading"><h2>My projects</h2></div>
                    <p id="project-status" class="mu studio-status">Loading your projects…</p>
                    <div id="project-list" class="studio-project-list"></div>
                    <div class="studio-project-actions" id="project-actions" hidden>
                        <button class="b p" data-a="editProject">Open selected</button>
                        <button class="b" data-a="playProject">Play</button>
                        <button class="b" id="toggle-visibility" data-a="toggleVisibility">Archive (make private)</button>
                        <button class="b" data-a="deleteProject">Delete permanently</button>
                    </div>
                    ${db.draft ? '<button class="b studio-continue" data-a="continueDraft">Continue local draft</button>' : ''}
                </section>
                <section class="studio-welcome">
                    <div class="studio-welcome-icon" aria-hidden="true">✦</div>
                    <h2>Make something playable</h2>
                    <p class="mu">Each game has its own files, live preview, and publishing details. Your work is saved as you edit.</p>
                    <button class="b p" data-a="newProject">Create a game</button>
                </section>
            </div>
        </section>
    `;
}

function renderStudioWorkspace() {
    $('#app').innerHTML = `
        <section class="studio-page studio-workspace">
            <div class="studio-workspace-heading">
                <div><button class="b studio-back" data-a="backToProjects">← All projects</button><p class="studio-eyebrow">PROJECT WORKSPACE</p><h1 id="workspace-title">${escapeHtml(draft.title || 'Untitled game')}</h1></div>
                <button class="b p studio-publish" data-a="publish">Publish</button>
            </div>
            <div class="studio-workspace-grid">
                <aside class="studio-file-sidebar" aria-label="Game files">
                    <div class="file-sidebar-heading"><b>FILES</b><div class="file-sidebar-actions"><button type="button" class="b" data-a="newFile">＋ File</button><button type="button" class="b" data-a="newFolder">＋ Folder</button></div></div>
                    <div id="file-tree" class="file-tree" role="tree"></div>
                    <button type="button" class="b file-upload-button" data-a="upl">Upload files</button>
                    <input id="up" type="file" multiple hidden>
                    <p class="mu sm file-tree-note">CSS and JavaScript are included; use <code>Playbox.files["path"]</code> for text files. Images and SVGs are embedded.</p>
                </aside>
                <div class="studio-editor-preview">
                    <section class="studio-editor-pane" aria-label="Code editor">
                        <div class="editor-file-heading"><span aria-hidden="true">▧</span><b id="editor-file-name"></b><button class="b" data-a="deleteProjectFile" hidden>Delete file</button><button class="b" data-a="tpl">Reset starter</button></div>
                        <div id="asset-preview" class="asset-preview" hidden></div>
                        <textarea id="ed" class="ed" spellcheck="false" aria-label="Code editor"></textarea>
                    </section>
                    <section class="studio-preview-pane" aria-label="Live preview">
                        <div class="preview-heading"><b>Live preview</b><span class="mu sm">Updates as you edit</span></div>
                        <div class="frame"><iframe id="pv" title="Live preview" sandbox="allow-scripts allow-pointer-lock"></iframe></div>
                        <pre class="log" id="log">SDK calls from your game show up here.</pre>
                        <div id="fl"></div>
                    </section>
                </div>
            </div>
            <dialog id="publish-dialog" class="publish-dialog" aria-labelledby="publish-title">
                <div class="publish-dialog-heading"><div><p class="studio-eyebrow">READY TO SHARE?</p><h2 id="publish-title">Publish your game</h2></div><button type="button" class="b" data-a="closePublish" aria-label="Close">×</button></div>
                <p class="mu">Add the details players will see. Your game will be submitted for review.</p>
                <label class="studio-field">Game name<input id="ti" placeholder="Game title" aria-label="Game name"></label>
                <label class="studio-field">Description<input id="ds" maxlength="120" placeholder="One-line description shown on the card" aria-label="Description"></label>
                <label class="studio-field">About this game<textarea id="ab" class="in" maxlength="2000" placeholder="How to play, controls, credits" aria-label="About this game"></textarea></label>
                <label class="studio-field">Tags<input id="tg" placeholder="Tags, separated by commas (up to 5)" aria-label="Tags"></label>
                <div class="publish-details">
                    <div>
                        <div class="card" id="pc"></div>
                        <div class="bar"><button class="b" data-a="thb">Choose thumbnail</button><button class="b" data-a="thx">Remove</button></div>
                        <label class="mu sm">Fallback color <input id="co" type="color"></label>
                        <input id="tf" type="file" accept="image/png,image/jpeg,image/webp" hidden>
                        <p class="mu sm">PNG, JPEG or WebP; cropped to 8:5. Moderators review it with your game.</p>
                    </div>
                    <div class="publish-preview-note"><b>What happens next?</b><p class="mu">We’ll review your game before it appears in Browse. You can keep editing it from your Studio dashboard.</p></div>
                </div>
                <div class="bar publish-actions"><button type="button" class="b" data-a="closePublish">Cancel</button><button type="button" class="b p" data-a="sub">Submit for review</button></div>
                <p class="mu sm">${db.user ? 'Signed in as ' + escapeHtml(publicUsername || 'Player') + '.' : 'Sign in on the Account page to publish.'}</p>
            </dialog>
            <dialog id="new-file-dialog" class="publish-dialog new-file-dialog" aria-labelledby="new-file-title">
                <div class="publish-dialog-heading"><div><p class="studio-eyebrow">PROJECT FILES</p><h2 id="new-file-title">Add a file</h2></div><button type="button" class="b" data-a="closeNewFile" aria-label="Close">×</button></div>
                <label class="studio-field">Name<input id="new-file-name" placeholder="src/helpers.js" autocomplete="off"></label>
                <p class="mu sm">Use a name or relative path. Supported text types include JS, CSS, JSON, TXT, and SVG.</p>
                <div class="bar publish-actions"><button type="button" class="b" data-a="closeNewFile">Cancel</button><button type="button" class="b p" data-a="createProjectFile">Add file</button></div>
            </dialog>
            <dialog id="new-folder-dialog" class="publish-dialog new-file-dialog" aria-labelledby="new-folder-title">
                <div class="publish-dialog-heading"><div><p class="studio-eyebrow">PROJECT FOLDERS</p><h2 id="new-folder-title">Add a folder</h2></div><button type="button" class="b" data-a="closeNewFolder" aria-label="Close">×</button></div>
                <label class="studio-field">Folder name<input id="new-folder-name" placeholder="src/components" autocomplete="off"></label>
                <div class="bar publish-actions"><button type="button" class="b" data-a="closeNewFolder">Cancel</button><button type="button" class="b p" data-a="createProjectFolder">Add folder</button></div>
            </dialog>
        </section>
    `;

    renderStudioFileTree();
    renderActiveStudioFile();
    $('#ed').oninput = (event) => {
        if (activeProjectFilePath) {
            const file = draft.files.find((entry) => entry.path === activeProjectFilePath);
            if (file) file.content = event.target.value;
        } else {
            draft[activeTab] = event.target.value;
        }
        triggerPreview();
    };
    $('#ti').oninput = (event) => {
        draft.title = event.target.value;
        $('#workspace-title').textContent = draft.title || 'Untitled game';
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
    $('#ab').oninput = (event) => {
        draft.about = event.target.value;
        triggerPreview();
    };
    $('#tg').oninput = (event) => {
        draft.tags = event.target.value;
        triggerPreview();
    };
    $('#tf').onchange = async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            draft.thumbData = await shrinkImage(file);
            draft.removeThumb = false;
            runPreview();
        } catch (error) {
            toast('Couldn’t read that image. Use a PNG, JPEG or WebP under 5 MB.');
        }
    };
    $('#up').onchange = async (event) => {
        try {
            await ingest(event.target.files);
        } catch (error) {
            toast(`Could not add files: ${error.message}`);
        }
        event.target.value = '';
    };
    fillStudioInputs();
}

function docs() {
    const examples = [
        {
            name: 'Playbox.getUser()',
            signature: 'Playbox.getUser() -> Promise<{ name: string }>',
            description: 'Gets the player’s public name: their Playbox username when signed in, otherwise "Player". It is never an email address.',
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
            <p>Game saves and scores are stored in the current browser and are not synced across devices or uploaded to the Playbox database yet. Games only ever see a player’s public username, never their email.</p>
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
    const uploads = [...files];
    if (!uploads.length) return;
    if (uploads.some((file) => file.size > 1_000_000)) throw new Error('Each uploaded file must be under 1 MB.');
    const totalSize = uploads.reduce((total, file) => total + file.size, 0) +
        (draft.files || []).reduce((total, file) => total + (file.content || file.dataUrl || '').length, 0);
    if (totalSize > 3_000_000) throw new Error('The project file limit is 3 MB.');

    const uploaded = [];
    for (const file of uploads) {
        const path = normalizeProjectPath(file.webkitRelativePath || file.name);
        const extension = projectFileType(path);
        const isText = projectTextExtensions.has(extension) || file.type.startsWith('text/') ||
            /(?:javascript|json|xml)/i.test(file.type);
        uploaded.push({
            path,
            content: isText ? await file.text() : '',
            dataUrl: isText ? '' : await readFileAsDataUrl(file)
        });
    }

    const htmlFile = uploaded.find((file) => ['index.html', 'index.htm'].includes(file.path.split('/').pop().toLowerCase()));
    if (htmlFile) {
        const parsed = new DOMParser().parseFromString(htmlFile.content, 'text/html');
        const inlineCss = [];
        const inlineJs = [];
        parsed.querySelectorAll('style').forEach((style) => {
            inlineCss.push(style.textContent);
            style.remove();
        });
        parsed.querySelectorAll('script:not([src])').forEach((script) => {
            inlineJs.push(script.textContent);
            script.remove();
        });
        draft.html = parsed.body.innerHTML.trim();
        if (parsed.title) draft.title = parsed.title;
        if (inlineCss.length) draft.css = `${draft.css}\n${inlineCss.join('\n')}`;
        if (inlineJs.length) draft.js = `${draft.js}\n;\n${inlineJs.join('\n;\n')}`;
        activeTab = 'html';
        activeProjectFilePath = '';
    }

    for (const file of uploaded) {
        const basename = file.path.split('/').pop().toLowerCase();
        if (file === htmlFile) continue;
        if (['style.css', 'src/style.css'].includes(file.path)) {
            draft.css = file.content;
            continue;
        }
        if (['script.js', 'src/script.js'].includes(file.path)) {
            draft.js = file.content;
            continue;
        }
        if (file.path === 'src/index.html') {
            draft.html = new DOMParser().parseFromString(file.content, 'text/html').body.innerHTML.trim();
            continue;
        }
        const existing = draft.files.findIndex((entry) => entry.path === file.path);
        if (existing < 0) draft.files.push(file);
        else draft.files[existing] = file;
        const parts = file.path.split('/');
        parts.pop();
        for (let index = 1; index <= parts.length; index += 1) studioFolders.add(parts.slice(0, index).join('/'));
    }
    studioFolders.add('');
    activeTab = 'html';
    activeProjectFilePath = '';
    fillStudioInputs();
    renderActiveStudioFile();
    toast(`Added ${uploads.length} file${uploads.length === 1 ? '' : 's'} to the project.`);
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
                return `<div class="row2"><div><b>${escapeHtml(game.title)}</b> v${game.version_number} by ${escapeHtml(publicAuthor(game.author))}<div class="mu sm">${escapeHtml(game.description)}</div>${tagList(game.tags).map((tag) => `<span class="chip mu">${escapeHtml(tag)}</span>`).join('')}${game.about ? `<div class="mu sm about">${escapeHtml(game.about)}</div>` : ''}${safeImageUrl(game.thumb_url) ? `<img class="review-thumb" src="${safeImageUrl(game.thumb_url)}" alt="Submitted thumbnail" width="160">` : '<span class="chip wn">no thumbnail</span>'}<div>${(previewDoc.length / 1024).toFixed(1)} KB ${warnings.map((warning) => `<span class="chip wn">${escapeHtml(warning)}</span>`).join('') || '<span class="chip ok">no flags</span>'}</div><input id="r${game.game_id}${game.version_number}" placeholder="Reason (required to reject)" aria-label="Rejection reason"></div><div class="bar"><button class="b" data-a="rvp" data-v="${key}">Play</button><button class="b p" data-a="appr" data-v="${key}">Approve</button><button class="b" data-a="rej" data-v="${key}">Reject</button></div></div>`;
            }).join('') : '<p>Nothing waiting for review.</p>') +
            '<h2>Reports</h2><p class="mu">Report management is not connected to the server yet.</p>';
    } catch (error) {
        if (currentRoute.v !== 'review') return;
        $('#app').innerHTML = `<h1>Review queue unavailable</h1><p class="mu">${escapeHtml(error.message)}</p>`;
    }
}

function privacy() {
    $('#app').innerHTML = `
        <h1>Privacy</h1>
        <p class="mu">A plain-language summary of what Playbox stores.</p>
        <h2>What we store</h2>
        <p>Your email address (used only to sign in and never shown to other people), your public username, and the games you submit, including their descriptions and thumbnails. Game saves, scores and favorites currently stay in your own browser.</p>
        <h2>What other people see</h2>
        <p>Your username next to games you publish. Games run in a sandbox and never receive your email address.</p>
        <h2>Age</h2>
        <p>Playbox is for people 13 and older.</p>
        <h2>Deleting your data</h2>
        <p>You can delete your account from the Account page. That removes your account, games, versions and thumbnails.</p>
        ${CONTACT_EMAIL ? `<h2>Contact</h2><p>Questions, privacy requests and takedown notices: <a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a></p>` : ''}
    `;
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
                <label class="check"><input id="age-ok" type="checkbox"> <span>I’m 13 or older and agree to the <a href="#privacy">privacy policy</a> (required to create an account).</span></label>
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
        <h2>Delete account</h2>
        <p class="mu">This permanently deletes your account, your games with every version and thumbnail, and your username. It can’t be undone.</p>
        <button class="b" data-a="deleteAccount">Delete my account</button>
        <p class="mu sm"><a href="#privacy">Privacy policy</a></p>
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
    async rep() {
        if (!currentRoute.remote) {
            db.reports.push({ id: currentRoute.id, by: displayName() });
            saveData();
            return toast('Reported. A moderator will take a look.');
        }
        if (!db.user) return toast('Sign in to report a game.');
        try {
            await authenticatedApiRequest(`/api/games/${encodeURIComponent(currentRoute.id)}/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Reported from the play page' })
            });
            toast('Reported. A moderator will take a look.');
        } catch (error) {
            toast(`Could not send report: ${error.message}`);
        }
    },
    tab(value) {
        activeTab = value;
        activeProjectFilePath = '';
        renderActiveStudioFile();
    },
    fileTab(value) {
        this.tab(value);
    },
    openProjectFile(path) {
        activeProjectFilePath = path;
        const parts = path.split('/');
        parts.pop();
        for (let index = 1; index <= parts.length; index += 1) studioFolders.add(parts.slice(0, index).join('/'));
        const file = draft.files.find((entry) => entry.path === path);
        if (file) renderActiveStudioFile();
    },
    toggleFolder(value) {
        if (studioFolders.has(value)) studioFolders.delete(value);
        else studioFolders.add(value);
        renderStudioFileTree();
    },
    newFile() {
        $('#new-file-name').value = '';
        $('#new-file-dialog').showModal();
        $('#new-file-name').focus();
    },
    newFolder() {
        $('#new-folder-name').value = '';
        $('#new-folder-dialog').showModal();
        $('#new-folder-name').focus();
    },
    closeNewFile() {
        $('#new-file-dialog').close();
    },
    closeNewFolder() {
        $('#new-folder-dialog').close();
    },
    createProjectFile() {
        if (addProjectPath($('#new-file-name').value, false)) $('#new-file-dialog').close();
    },
    createProjectFolder() {
        if (addProjectPath($('#new-folder-name').value, true)) $('#new-folder-dialog').close();
    },
    deleteProjectFile() {
        if (!activeProjectFilePath) return;
        draft.files = draft.files.filter((file) => file.path !== activeProjectFilePath);
        activeProjectFilePath = '';
        renderActiveStudioFile();
        runPreview();
    },
    thb() {
        $('#tf').click();
    },
    thx() {
        draft.thumbData = '';
        draft.thumb_url = '';
        draft.removeThumb = true;
        runPreview();
    },
    upl() {
        $('#up').click();
    },
    tpl() {
        if (activeProjectFilePath) {
            const file = draft.files.find((entry) => entry.path === activeProjectFilePath);
            if (file) file.content = '';
            renderActiveStudioFile();
        } else {
            draft[activeTab] = starterTemplate[activeTab];
            renderActiveStudioFile();
        }
        runPreview();
    },
    publish() {
        const dialog = $('#publish-dialog');
        if (!dialog.open) dialog.showModal();
    },
    closePublish() {
        $('#publish-dialog').close();
    },
    backToProjects() {
        studioWorkspaceOpen = false;
        studio();
    },
    continueDraft() {
        if (!db.draft) return toast('There is no saved local draft to continue.');
        draft = { ...starterTemplate, ...db.draft };
        if (!Array.isArray(draft.files)) draft.files = [];
        if (!Array.isArray(draft.folders)) draft.folders = [];
        selectedStudioProjectId = draft.id || '';
        activeTab = 'html';
        activeProjectFilePath = '';
        studioWorkspaceOpen = true;
        studio();
    },
    async sub() {
        if (!db.user) return toast('Sign in on the Account page to submit.');
        if (!publicUsername) return toast('Choose and save a public username on the Account page before submitting.');
        if (!draft.title.trim()) return toast('Add a title.');
        if (!draft.desc.trim()) return toast('Add a one-line description.');
        if (!draft.js.trim() && !draft.html.trim()) return toast('Nothing to submit yet.');
        const compiled = compileStudioProject(draft);
        if (new TextEncoder().encode(compiled.html + compiled.css + compiled.js).length > 1_800_000) {
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
                    html: compiled.html,
                    css: compiled.css,
                    js: compiled.js,
                    about: (draft.about || '').trim(),
                    tags: tagList(draft.tags),
                    thumbnail: draft.thumbData || undefined,
                    remove_thumbnail: draft.removeThumb && !draft.thumbData ? true : undefined
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

            if (!db.projectWorkspaces) db.projectWorkspaces = {};
            const previousVersion = studioProjects.find((project) => project.id === draft.id)?.version_number;
            db.projectWorkspaces[draft.id] = {
                version_number: result.version_number || (isNewProject ? 1 : Number(previousVersion) + 1),
                html: draft.html,
                css: draft.css,
                js: draft.js,
                files: draft.files || [],
                folders: draft.folders || []
            };
            selectedStudioProjectId = draft.id;
            saveData();
            draft.thumb_url = typeof result.thumb_url === 'string' ? result.thumb_url : draft.thumb_url;
            draft.thumbData = '';
            draft.removeThumb = false;
            studioWorkspaceOpen = false;
            renderStudioDashboard();
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
        const savedWorkspace = db.projectWorkspaces && db.projectWorkspaces[project.id];
        const hasSavedWorkspace = savedWorkspace &&
            String(savedWorkspace.version_number) === String(project.version_number);
        draft = {
            id: project.id,
            title: project.title,
            desc: project.description,
            color: project.color,
            html: hasSavedWorkspace ? savedWorkspace.html : project.html,
            css: hasSavedWorkspace ? savedWorkspace.css : project.css,
            js: hasSavedWorkspace ? savedWorkspace.js : project.js,
            about: project.about || '',
            tags: tagList(project.tags).join(', '),
            thumb_url: project.thumb_url || '',
            thumbData: '',
            removeThumb: false,
            files: hasSavedWorkspace ? savedWorkspace.files : [],
            folders: hasSavedWorkspace ? savedWorkspace.folders : []
        };
        selectedStudioProjectId = project.id;
        activeTab = 'html';
        activeProjectFilePath = '';
        studioFolders = new Set();
        studioTreeInitialized = false;
        studioWorkspaceOpen = true;
        studio();
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
        activeProjectFilePath = '';
        studioFolders = new Set();
        studioTreeInitialized = false;
        studioWorkspaceOpen = true;
        studio();
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
            if (db.projectWorkspaces) delete db.projectWorkspaces[projectId];
            studioProjects = studioProjects.filter((entry) => entry.id !== projectId);
            selectedStudioProjectId = '';
            if (draft.id === projectId) {
                draft = { ...starterTemplate };
                studioWorkspaceOpen = false;
            }
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
        if (!$('#age-ok').checked) return toast('Please confirm you’re 13 or older and agree to the privacy policy.');
        try {
            const { data, error } = await authClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: location.origin }
            });
            if (error) return toast(error.message);
            if (data.session) {
                db.user = data.user.id;
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
            db.user = data.user.id;
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
    async deleteAccount(_, button) {
        if (button.dataset.c !== '1') {
            button.dataset.c = '1';
            button.textContent = 'Click again to permanently delete';
            return;
        }
        button.disabled = true;
        try {
            await authenticatedApiRequest('/api/account', { method: 'DELETE' });
        } catch (error) {
            button.disabled = false;
            return toast(`Could not delete account: ${error.message}`);
        }
        const userId = db.user;
        Object.keys(db.saves).forEach((key) => key.startsWith(userId + '|') && delete db.saves[key]);
        delete db.favs[userId];
        db.projectWorkspaces = {};
        draft = { ...starterTemplate };
        db.draft = null;
        saveData();
        await authClient.auth.signOut({ scope: 'local' });
        toast('Your account and data were deleted.');
        location.hash = '#browse';
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

    if (message.t == 'user') response = { name: publicUsername || 'Player' };
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
        scores.push({ u: publicUsername || 'Guest', s: message.d });
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
    let syncToken = 0;
    const syncAuthSession = async (session) => {
        const userId = session?.user.id || '';
        if (userId === lastUserId) return; // token refresh or tab refocus: nothing changed
        const token = ++syncToken;
        lastUserId = userId;
        resetModeratorAccess();
        moderatorUserId = userId;
        if (db.draftUser && db.draftUser !== userId) {
            // A different person (or nobody) is signed in now: drop the previous user's draft and projects.
            draft = { ...starterTemplate };
            db.draft = null;
            db.draftUser = '';
            db.projectWorkspaces = {};
            studioProjects = [];
            selectedStudioProjectId = '';
        }
        db.user = userId;
        publicUsername = '';
        saveData();
        render();
        if (!userId) return;
        try {
            const me = await authenticatedApiRequest('/api/profile');
            if (token !== syncToken) return;
            publicUsername = typeof me.username === 'string' ? me.username : '';
            if (me.is_moderator === true) moderatorAccess = true; // only shows the nav link; the server still enforces it
            else if (me.is_moderator === undefined) checkModeratorAccess(); // older API: fall back to probing the queue
        } catch (error) {
            // Account page shows profile errors.
        }
        if (token === syncToken) renderNavigation();
    };
    // setTimeout avoids a supabase-js deadlock when a callback makes further Supabase calls.
    authClient.auth.onAuthStateChange((_event, session) => setTimeout(() => syncAuthSession(session), 0));
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
