const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const el = {
    hud: document.getElementById('hud'),
    speed: document.getElementById('speedValue'),
    place: document.getElementById('placeValue'),
    streak: document.getElementById('streakValue'),
    time: document.getElementById('timeValue'),
    pr: document.getElementById('prValue'),
    progress: document.getElementById('progressTrack'),
    ghost: document.getElementById('progressGhost'),
    hint: document.getElementById('raceHint'),
    overlay: document.getElementById('overlay'),
    overlayInner: document.getElementById('overlayInner'),
    muteBtn: document.getElementById('muteBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    game: document.getElementById('game'),
    target: document.getElementById('tapTarget'),
    rotateHint: document.getElementById('rotateHint'),
    rotateClose: document.getElementById('rotateClose'),
    safeProbe: document.getElementById('safeProbe')
};

const COUNTDOWN_FROM = 3;
const ROTATE_HINT_KEY = 'turboSprint.rotateHintOff';

const view = { width: 0, height: 0, inset: { top: 0, right: 0, bottom: 0, left: 0 } };

// title | howto | select | records | mpMenu | lobby | countdown | racing |
// paused | finished
let screen = 'title';
let mp = false;            // is this a multiplayer race?
let mpError = '';
let mpBusy = '';           // spinner text while connecting
let mpStandings = null;    // results from the host, in multiplayer
let level = Difficulty.DEFAULT;
let mapId = Maps.DEFAULT;
let player, aiCars, allCars;
let pips = new Map();
let camera = 0;
let countdown = COUNTDOWN_FROM;
let lastCountdownBeep = -1;
let raceTime = 0;
let streak = 0;
let bestStreak = 0;
let popups = [];
let shake = 0;
let prAtStart = null;
let lastResult = null;
let lastFrame = performance.now();
let rotateHintOff = false;
try { rotateHintOff = localStorage.getItem(ROTATE_HINT_KEY) === '1'; } catch (e) { /* ignore */ }

/* ---------------------------------------------------------------- setup -- */

function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    view.inset = readSafeInsets();
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Target.refit(view, level);
    updateRotateHint();
}

// The safe-area insets aren't readable as numbers directly, so #safeProbe turns
// each env() value into a resolved padding we can parse.
function readSafeInsets() {
    const s = getComputedStyle(el.safeProbe);
    return {
        top: parseFloat(s.paddingTop) || 0,
        right: parseFloat(s.paddingRight) || 0,
        bottom: parseFloat(s.paddingBottom) || 0,
        left: parseFloat(s.paddingLeft) || 0
    };
}

// Suggested, not enforced: a portrait phone can still play, it just sees less
// of the track ahead.
function updateRotateHint() {
    const wanted = view.height > view.width
        && ['title', 'howto', 'select', 'records', 'mpMenu', 'lobby', 'finished'].includes(screen)
        && !rotateHintOff;
    el.rotateHint.classList.toggle('on', wanted);
}

// Rebuilds the race to match the current map + level. Safe to call repeatedly
// while the player is still flicking through options on the select screen.
function applySettings() {
    const map = Maps.byId(mapId);
    Track.setTheme(map);
    Track.LENGTH = Math.round(Difficulty.trackLength(level) * map.lengthMult);
    Physics.decay = Physics.DECAY_BASE * Difficulty.decayMult(level) * map.decayMult;
    Physics.minSpeed = Difficulty.minSpeed(level);

    if (mp && Net.active && Net.players.length) {
        // Multiplayer races are players only — no AI rivals to pad the grid.
        // One lane each, so the track splits evenly however many turned up.
        Track.LANES = Math.max(2, Net.players.length);
        const mine = Net.me();
        player = new PlayerCar(mine ? mine.lane : 0);
        player.name = mine ? mine.name : 'You';
        player.colors = mine ? mine.colors : { light: '#5cc8ff', dark: '#1667c4' };
        player.pipColor = player.colors.light;
        player.number = (mine ? mine.lane : 0) + 1;
        aiCars = Net.players.filter(p => !p.isMe).map(p => new RemoteCar(p));
    } else {
        Track.LANES = 4;
        player = new PlayerCar(1);
        aiCars = AICar.ROSTER.map(cfg => new AICar(cfg));   // rivals run one pace at every level
    }
    allCars = [player, ...aiCars];

    camera = cameraTarget();
    buildPips();
}

function buildPips() {
    el.progress.querySelectorAll('.pip').forEach(p => p.remove());
    pips = new Map();
    for (const car of allCars) {
        const pip = document.createElement('div');
        pip.className = 'pip' + (car.isPlayer ? ' player' : '');
        pip.style.background = car.pipColor;
        el.progress.appendChild(pip);
        pips.set(car, pip);
    }
}

/* --------------------------------------------------------- screen flow -- */

function setScreen(next) {
    screen = next;
    const inMenu = ['title', 'howto', 'select', 'records', 'mpMenu', 'lobby', 'finished', 'paused'].includes(next);
    el.overlay.classList.toggle('dim', inMenu);
    el.overlay.classList.toggle('interactive', inMenu);
    el.hud.classList.toggle('hidden', ['title', 'howto', 'select', 'records', 'mpMenu', 'lobby'].includes(next));
    el.hint.classList.toggle('on', ['countdown', 'racing'].includes(next));
    el.pauseBtn.classList.toggle('on', !mp && ['racing', 'countdown'].includes(next));

    // The box is only tappable while actually racing.
    if (next === 'racing') Target.show(); else Target.hide();
    updateRotateHint();
}

function showTitle() {
    if (Net.active) Net.leave();
    mp = false;
    mpError = '';
    mpBusy = '';
    mpStandings = null;
    applySettings();
    Particles.clear();
    setScreen('title');
    render_title();
}

function showMpMenu() {
    if (Net.active) Net.leave();
    mp = false;
    mpBusy = '';
    mpStandings = null;
    applySettings();
    Particles.clear();
    setScreen('mpMenu');
    render_mpMenu();
}

function showLobby() {
    setScreen('lobby');
    render_lobby();
}

function showSelect() {
    applySettings();
    setScreen('select');
    render_select();
}

function showRecords() {
    setScreen('records');
    render_records();
}

function showHowTo() {
    setScreen('howto');
    render_howto();
}

// In multiplayer only the host may start, and it starts for everybody.
function requestStart() {
    if (mp && Net.role === 'host') {
        if (Net.players.length < 2) return;
        Net.armRace();
        Net.hostStart(mapId, level);   // fires the local 'start' handler too
        return;
    }
    startRace();
}

function startRace() {
    applySettings();
    Difficulty.save(level);
    Maps.save(mapId);
    mpStandings = null;

    countdown = COUNTDOWN_FROM;
    lastCountdownBeep = -1;
    raceTime = 0;
    streak = 0;
    bestStreak = 0;
    popups = [];
    shake = 0;
    Particles.clear();
    prAtStart = mp ? null : Records.get(mapId, level);

    Target.reset();
    el.hint.style.opacity = '1';
    // No personal-best pace car in multiplayer — you're chasing people, not a ghost.
    el.ghost.style.display = (!mp && prAtStart) ? 'block' : 'none';
    el.pr.textContent = mp ? '—' : Records.format(prAtStart);
    setScreen('countdown');
    updateHud();
}

/* ---------------------------------------------------------------- input -- */

// Keyboard is menus only now — speed comes from the tap target.
function onKey(key) {
    Sfx.ensure();   // first gesture unlocks audio

    if (screen === 'racing') {
        if (key === 'ESCAPE') pauseRace();
        return;
    }

    if (screen === 'paused') {
        if (key === 'ESCAPE' || key === 'ENTER' || key === 'SPACE') resumeRace();
        return;
    }

    if (screen === 'countdown') return;

    // Menu screens.
    if (key === 'M') { toggleMute(); return; }

    if (screen === 'title') {
        if (key === 'ENTER' || key === 'SPACE') showSelect();
        if (key === 'R') showRecords();
        if (key === 'H') showHowTo();
        if (key === 'F') showMpMenu();
        return;
    }

    if (screen === 'howto' || screen === 'records') {
        if (key === 'ESCAPE' || key === 'ENTER' || key === 'SPACE') showTitle();
        return;
    }

    if (screen === 'mpMenu') {
        if (key === 'ESCAPE') showTitle();
        return;
    }

    if (screen === 'lobby') {
        if (key === 'ESCAPE') showMpMenu();
        if ((key === 'ENTER' || key === 'SPACE') && Net.role === 'host') requestStart();
        if (/^[0-9]$/.test(key) && Net.role === 'host') {
            level = Difficulty.clamp(parseInt(key, 10));
            applySettings();
            render_lobby();
        }
        return;
    }

    if (screen === 'select') {
        if (key === 'ARROWLEFT')  { level = Difficulty.clamp(level - 1); applySettings(); render_select(); }
        if (key === 'ARROWRIGHT') { level = Difficulty.clamp(level + 1); applySettings(); render_select(); }
        if (key === 'ARROWUP' || key === 'ARROWDOWN') {
            const list = Maps.LIST;
            const i = list.findIndex(m => m.id === mapId);
            const next = key === 'ARROWDOWN' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
            mapId = list[next].id;
            applySettings();
            render_select();
        }
        if (/^[0-9]$/.test(key)) { level = Difficulty.clamp(parseInt(key, 10)); applySettings(); render_select(); }
        if (key === 'ENTER' || key === 'SPACE') startRace();
        if (key === 'ESCAPE') showTitle();
        return;
    }

    if (screen === 'finished') {
        if (!mp) {
            if (key === 'ARROWLEFT')  { level = Difficulty.clamp(level - 1); render_results(); }
            if (key === 'ARROWRIGHT') { level = Difficulty.clamp(level + 1); render_results(); }
            if (/^[0-9]$/.test(key)) { level = Difficulty.clamp(parseInt(key, 10)); render_results(); }
        }
        if (key === 'ENTER' || key === 'SPACE') requestStart();
        if (key === 'ESCAPE') { if (mp) showLobby(); else showTitle(); }
    }
}

// Hit the box: reaction time is measured from the moment it appeared, so the
// sooner you find it and get your thumb there, the bigger the surge. A blue box
// wants two taps and only moves on after the second; each of them scores in full,
// so taking two taps to clear one box costs you nothing.
function onTargetHit(e) {
    if (e.button > 0) return;   // right / middle click isn't a tap
    e.preventDefault();
    e.stopPropagation();        // don't let this reach the miss handler on #game
    Sfx.ensure();
    if (screen !== 'racing' || !Target.live) return;

    const reaction = (performance.now() - Target.shownAt) / 1000;
    const gain = player.boost(reaction, streak);
    streak++;
    bestStreak = Math.max(bestStreak, streak);

    const rating = Physics.ratingFor(reaction);
    popups.push({ text: rating.text, color: rating.color, life: 0.75, rise: 0 });
    Particles.boost(player.x - camera, Track.laneY(player.lane, view), gain / Physics.BOOST_FAST);
    Sfx.blip(streak);

    if (Target.registerHit()) Target.spawn(view, level);
    el.hint.style.opacity = '0';
}

// Tap anywhere else on the track and you've fumbled it — same penalty the wrong
// key used to carry. Taps on the UI don't count.
function onFieldMiss(e) {
    if (e.button > 0) return;
    Sfx.ensure();
    if (screen !== 'racing' || !Target.live) return;
    if (e.target.closest('#tapTarget, #topRight, #overlay, #rotateHint')) return;

    player.miss();
    streak = 0;
    shake = 0.28;
    popups.push({ text: 'MISS', color: '#ff7b7b', life: 0.6, rise: 0 });
    Particles.miss(player.x - camera, Track.laneY(player.lane, view));
    Sfx.miss();
    Target.flashMiss();
}

// Every clickable thing in the menus routes through here.
function onAction(action, value) {
    Sfx.ensure();
    Sfx.click();
    switch (action) {
        case 'play':     showSelect(); break;
        case 'records':  showRecords(); break;
        case 'howto':    showHowTo(); break;
        case 'title':    showTitle(); break;
        case 'start':    requestStart(); break;
        case 'again':    requestStart(); break;
        case 'resume':   resumeRace(); break;
        case 'mp':       showMpMenu(); break;
        case 'mpHost':   hostGame(); break;
        case 'mpJoin':   joinGame(); break;
        case 'lobby':    if (Net.active) showLobby(); else showMpMenu(); break;
        case 'map':      mapId = value; applySettings();
                         if (screen === 'lobby') render_lobby(); else render_select(); break;
        case 'level':    level = Difficulty.clamp(parseInt(value, 10)); applySettings();
                         if (screen === 'lobby') render_lobby();
                         else if (screen === 'finished') render_results();
                         else render_select(); break;
        case 'clearPR':  Records.clear(); render_records(); break;
        case 'mute':     toggleMute(); break;
    }
}

/* --------------------------------------------------------- multiplayer -- */

function readName() {
    const input = document.getElementById('nameInput');
    const name = (input ? input.value : '').trim().slice(0, 12) || 'Racer';
    Net.saveName(name);
    return name;
}

async function hostGame() {
    const name = readName();
    mpError = '';
    mpBusy = 'Creating a game…';
    render_mpMenu();
    try {
        mp = true;
        await Net.startHosting(name);
        mpBusy = '';
        applySettings();
        showLobby();
    } catch (e) {
        mp = false;
        mpBusy = '';
        mpError = netErrorText(e);
        render_mpMenu();
    }
}

async function joinGame() {
    const codeInput = document.getElementById('codeInput');
    const code = (codeInput ? codeInput.value : '').trim().toUpperCase();
    if (code.length !== Net.CODE_LEN) {
        mpError = `A game code is ${Net.CODE_LEN} characters.`;
        render_mpMenu();
        return;
    }
    const name = readName();
    mpError = '';
    mpBusy = 'Looking for that game…';
    render_mpMenu();
    try {
        mp = true;
        await Net.joinGame(code, name);
        mpBusy = 'Connecting to the host…';
        render_mpMenu();
    } catch (e) {
        mp = false;
        mpBusy = '';
        mpError = netErrorText(e);
        render_mpMenu();
    }
}

function netErrorText(e) {
    const msg = (e && e.message) || '';
    if (msg === 'SIGNAL-FAILED' || msg === 'SIGNAL-CLOSED') {
        return "Couldn't reach the matchmaking server. Check your internet connection — multiplayer needs one, even though the game itself doesn't.";
    }
    if (msg === 'ID-TAKEN') return 'Every code we tried was busy. Try again.';
    return 'Something went wrong setting that up. Try again.';
}

Net.handlers = {
    lobby() {
        applySettings();
        if (screen === 'mpMenu' || screen === 'lobby') {
            mpBusy = '';
            mpError = '';
            showLobby();
        } else if (screen === 'finished') {
            render_results();   // keep the swatches fresh if someone leaves
        }
    },

    start(info) {
        mp = true;
        mapId = info.mapId;
        level = Difficulty.clamp(info.level);
        Net.armRace();
        startRace();
    },

    results(standings) { onMpResults(standings); },

    playerLeft() {
        if (screen === 'lobby') render_lobby();
    },

    error(text) {
        mpError = text;
        mpBusy = '';
        mp = false;
        if (['racing', 'countdown', 'paused', 'finished'].includes(screen)) {
            Target.reset();
            showMpMenu();
        } else {
            showMpMenu();
        }
        mpError = text;      // showMpMenu clears it, so set it after
        render_mpMenu();
    }
};

function toggleMute() {
    const muted = Sfx.toggle();
    el.muteBtn.textContent = muted ? '🔇' : '🔊';
    el.muteBtn.classList.toggle('off', muted);
}

function pauseRace() {
    if (screen !== 'racing') return;
    if (mp) return;   // pausing would freeze only your car while everyone else races on
    setScreen('paused');
    render_paused();
}

function resumeRace() {
    if (screen !== 'paused') return;
    setScreen('racing');
    Target.resume();   // don't charge the player for time spent paused
    el.overlayInner.innerHTML = '';
}

/* ------------------------------------------------------------- screens -- */

function levelBar(clickable) {
    let segs = '';
    for (let i = Difficulty.MIN; i <= Difficulty.MAX; i++) {
        const on = i <= level;
        // background-color, not the shorthand: the shorthand would reset the
        // background-clip that keeps the segment's tap area bigger than its bar.
        const style = on ? `background-color:${Difficulty.color(i)}` : '';
        const attrs = clickable ? ` data-action="level" data-value="${i}" title="Level ${i} — ${Difficulty.name(i)}"` : '';
        segs += `<span class="seg${on ? ' on' : ''}" style="${style}"${attrs}></span>`;
    }
    return `<div class="level-bar">${segs}</div>`;
}

function render_title() {
    el.overlayInner.innerHTML = `
        <div class="title-logo">TURBO SPRINT</div>
        <div class="title-tag">Tap to build speed · No steering, just pace</div>
        <div class="menu-list">
            <button class="btn primary" data-action="play">▶  Race</button>
            <button class="btn" data-action="mp">👥  Race Your Friends</button>
            <button class="btn" data-action="records">🏆  Personal Records</button>
            <button class="btn" data-action="howto">?  How to Play</button>
        </div>
        <div class="menu-hint"><b>Enter</b> race · <b>R</b> records · <b>H</b> help · <b>M</b> mute</div>`;
}

function render_howto() {
    el.overlayInner.innerHTML = `
        <div class="section-title">How to Play</div>
        <div class="section-sub">You never steer. You only control speed.</div>
        <div class="how-list">
            <div class="how-item"><span class="num">1</span><span>A gold box pops up somewhere on the screen. Tap it.</span></div>
            <div class="how-item"><span class="num">2</span><span>The moment you hit it, it reappears somewhere else. Keep chasing it.</span></div>
            <div class="how-item"><span class="num">3</span><span>A <b>blue</b> box takes two taps and stays put until the second one. Both taps boost you in full, so it never costs you speed.</span></div>
            <div class="how-item"><span class="num">4</span><span>The faster you get to it, the bigger the speed boost. Under 0.5s is a <b>PERFECT!</b></span></div>
            <div class="how-item"><span class="num">5</span><span>Your speed constantly bleeds away — stop tapping and you slow down.</span></div>
            <div class="how-item"><span class="num">6</span><span>Tapping anywhere else costs you speed and resets your streak. A clean streak adds up to +25% per boost.</span></div>
            <div class="how-item"><span class="num">7</span><span>Higher levels shrink the box and fling it further across the screen.</span></div>
            <div class="how-item"><span class="num">8</span><span>Beat the three rivals to the line. Your best time per map and level is saved.</span></div>
        </div>
        <div class="btn-row"><button class="btn" data-action="title">← Back</button></div>`;
}

function render_mpMenu() {
    const name = escapeHtml(Net.loadName());
    el.overlayInner.innerHTML = `
        <div class="section-title">Race Your Friends</div>
        <div class="section-sub">One of you hosts and shares the code. Everyone else joins with it.</div>

        <div class="field">
            <label for="nameInput">Your name</label>
            <input id="nameInput" class="text-input" type="text" maxlength="12"
                   autocomplete="off" autocapitalize="words" spellcheck="false"
                   placeholder="Racer" value="${name}">
        </div>

        ${mpBusy ? `<div class="mp-busy">${escapeHtml(mpBusy)}</div>` : ''}
        ${mpError ? `<div class="mp-error">${escapeHtml(mpError)}</div>` : ''}

        <div class="mp-split">
            <div class="mp-card">
                <div class="mp-card-title">Host a race</div>
                <div class="mp-card-body">You pick the track and difficulty, and you start the race.</div>
                <button class="btn primary" data-action="mpHost">Create a game</button>
            </div>
            <div class="mp-card">
                <div class="mp-card-title">Join a race</div>
                <div class="mp-card-body">Type the 4-character code the host gives you.</div>
                <input id="codeInput" class="text-input code" type="text" maxlength="4"
                       autocomplete="off" autocapitalize="characters" spellcheck="false"
                       inputmode="text" placeholder="CODE">
                <button class="btn" data-action="mpJoin">Join game</button>
            </div>
        </div>

        <div class="btn-row"><button class="btn small" data-action="title">← Menu</button></div>`;
}

function render_lobby() {
    const v = Net.lobbyView();
    const isHost = v.role === 'host';
    const rows = v.players.map((p, i) => `
        <div class="standing${p.isMe ? ' you' : ''}">
            <span class="rank">${i + 1}</span>
            <span class="swatch" style="background:${p.colors ? p.colors.light : '#888'}"></span>
            <span class="name">${escapeHtml(p.name)}${p.isMe ? ' (you)' : ''}</span>
            <span class="split">${i === 0 ? 'host' : 'ready'}</span>
        </div>`).join('');

    const map = Maps.byId(mapId);
    const canStart = isHost && v.players.length >= 2;

    el.overlayInner.innerHTML = `
        <div class="section-title">Lobby</div>
        <div class="code-display">
            <span class="code-label">Game code</span>
            <span class="code-value">${escapeHtml(v.code || '····')}</span>
        </div>
        <div class="section-sub">${isHost
            ? 'Share that code. The race starts when you say so.'
            : 'Waiting for the host to start the race.'}</div>

        ${mpError ? `<div class="mp-error">${escapeHtml(mpError)}</div>` : ''}

        <div class="standings">${rows}</div>

        <div class="next-level">
            ${map.icon} ${escapeHtml(map.name)} ·
            <span class="level-num small" style="color:${Difficulty.color(level)}">${level}</span>
            <span class="level-name" style="font-size:1em">${Difficulty.name(level)}</span>
        </div>
        ${isHost ? levelBar(true) : ''}
        ${isHost ? `<div class="lobby-maps">${Maps.LIST.map(m => `
            <button class="btn small${m.id === mapId ? ' primary' : ''}" data-action="map" data-value="${m.id}">${m.icon} ${escapeHtml(m.name)}</button>`).join('')}</div>` : ''}

        <div class="btn-row">
            ${isHost
                ? `<button class="btn primary" data-action="start"${canStart ? '' : ' disabled'}>▶  Start Race${canStart ? '' : ' (need 2+)'}</button>`
                : ''}
            <button class="btn small" data-action="mp">← Leave</button>
        </div>`;
}

function render_select() {
    const map = Maps.byId(mapId);
    const fastest = Math.max(...AICar.ROSTER.map(c => c.baseSpeed));
    const rivalTime = (Track.LENGTH / fastest).toFixed(1);
    const pr = Records.get(mapId, level);

    const cards = Maps.LIST.map(m => {
        const done = Records.countFor(m.id);
        const len = Math.round(Difficulty.trackLength(level) * m.lengthMult);
        return `<div class="map-card${m.id === mapId ? ' selected' : ''}" data-action="map" data-value="${m.id}">
            <div class="map-name">${m.icon} ${m.name}</div>
            <div class="map-blurb">${m.blurb}</div>
            <div class="map-tags">
                <span class="tag">${len}m</span>
                ${m.decayMult > 1 ? '<span class="tag">slippery</span>' : ''}
                ${m.lengthMult < 0.97 ? '<span class="tag">sprint</span>' : ''}
                ${m.lengthMult > 1.1 ? '<span class="tag">endurance</span>' : ''}
                ${done ? `<span class="tag pr">${done} PR${done > 1 ? 's' : ''}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    el.overlayInner.innerHTML = `
        <div class="section-title">Choose Your Race</div>
        <div class="section-sub">Pick a track, then set the difficulty.</div>
        <div class="map-grid">${cards}</div>
        <div class="level-head">
            <span class="level-num" style="color:${Difficulty.color(level)}">${level}</span>
            <span class="level-name">${Difficulty.name(level)}</span>
        </div>
        ${levelBar(true)}
        <div class="level-facts">
            <span><b>${Difficulty.targetLabel(level)}</b></span>
            <span><b>${Track.LENGTH}</b>m</span>
            <span>rivals finish in <b>~${rivalTime}s</b></span>
            <span class="pr-fact">your best <b>${Records.format(pr)}</b></span>
        </div>
        <div class="btn-row">
            <button class="btn primary" data-action="start">▶  Start Race</button>
            <button class="btn small" data-action="title">← Menu</button>
        </div>
        <div class="menu-hint"><b>↑</b><b>↓</b> map · <b>←</b><b>→</b> or <b>0-9</b> difficulty · <b>Enter</b> start</div>`;
}

function render_records() {
    const header = Maps.LIST.map(m => `<th title="${m.name}">${m.icon}</th>`).join('');
    let rows = '';
    for (let lv = Difficulty.MIN; lv <= Difficulty.MAX; lv++) {
        const cells = Maps.LIST.map(m => {
            const t = Records.get(m.id, lv);
            return t === null
                ? '<td class="empty">—</td>'
                : `<td class="time">${t.toFixed(2)}</td>`;
        }).join('');
        rows += `<tr><td class="lvl"><span style="color:${Difficulty.color(lv)}">${lv}</span> ${Difficulty.name(lv)}</td>${cells}</tr>`;
    }

    const total = Object.keys(Records.all()).length;
    el.overlayInner.innerHTML = `
        <div class="section-title">Personal Records</div>
        <div class="section-sub">${total ? `${total} best time${total > 1 ? 's' : ''} recorded · only finished races count` : 'No times yet — win a race to set your first record.'}</div>
        <div class="records-wrap">
            <table class="records">
                <thead><tr><th style="text-align:left">Level</th>${header}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div class="btn-row">
            <button class="btn" data-action="title">← Back</button>
            ${total ? '<button class="btn small" data-action="clearPR">Clear all records</button>' : ''}
        </div>`;
}

function render_paused() {
    el.overlayInner.innerHTML = `
        <div class="section-title">Paused</div>
        <div class="section-sub">${Maps.byId(mapId).name} · Level ${level} ${Difficulty.name(level)}</div>
        <div class="btn-row">
            <button class="btn primary" data-action="resume">▶  Resume</button>
            <button class="btn" data-action="again">↻  Restart</button>
            <button class="btn" data-action="title">⌂  Main Menu</button>
        </div>
        <div class="menu-hint"><b>Esc</b> to resume</div>`;
}

// Player names go through innerHTML, and they come off the network.
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function render_results() {
    if (mp) { render_mpResults(); return; }

    const r = lastResult;
    if (!r) return;

    const rows = r.standings.map((s, i) => `
        <div class="standing${s.isPlayer ? ' you' : ''}">
            <span class="rank">${ordinal(i + 1)}</span>
            <span class="swatch" style="background:${s.color}"></span>
            <span class="name">${s.name}</span>
            <span class="split">${s.split}</span>
        </div>`).join('');

    let badge = '';
    if (r.isRecord) {
        badge = `<div class="record-badge">★ NEW RECORD ${r.previous !== null ? `· −${(r.previous - r.time).toFixed(2)}s` : ''}</div>`;
    } else if (r.time !== null && r.previous !== null) {
        badge = `<div class="result-sub">Best ${r.previous.toFixed(2)}s · ${(r.time - r.previous).toFixed(2)}s off</div>`;
    }

    el.overlayInner.innerHTML = `
        <div class="result-title ${r.won ? 'win' : 'lose'}">${r.won ? 'YOU WIN!' : ordinal(r.rank) + ' PLACE'}</div>
        <div class="result-sub">${r.blurb}</div>
        ${badge}
        <div class="standings">${rows}</div>
        <div class="next-level">
            ${Maps.byId(mapId).icon} ${Maps.byId(mapId).name} ·
            <span class="level-num small" style="color:${Difficulty.color(level)}">${level}</span>
            <span class="level-name" style="font-size:1em">${Difficulty.name(level)}</span>
            · best streak ${r.bestStreak}
        </div>
        ${levelBar(true)}
        <div class="btn-row">
            <button class="btn primary" data-action="again">↻  Race Again</button>
            <button class="btn" data-action="play">◈  Change Track</button>
            <button class="btn" data-action="title">⌂  Menu</button>
        </div>
        <div class="menu-hint"><b>←</b><b>→</b> difficulty · <b>Enter</b> race again</div>`;
}

function render_mpResults() {
    const isHost = Net.role === 'host';

    if (!mpStandings) {
        el.overlayInner.innerHTML = `
            <div class="section-title">Finished!</div>
            <div class="section-sub">Your time: <b>${raceTime.toFixed(2)}s</b></div>
            <div class="mp-busy">Waiting for the others to cross the line…</div>
            <div class="btn-row"><button class="btn small" data-action="lobby">Back to lobby</button></div>`;
        return;
    }

    const mineIdx = mpStandings.findIndex(s => s.id === Net.myId);
    const won = mineIdx === 0;
    const rows = mpStandings.map((s, i) => {
        const p = Net.players.find(q => q.id === s.id);
        const color = p && p.colors ? p.colors.light : '#888';
        return `<div class="standing${s.id === Net.myId ? ' you' : ''}">
            <span class="rank">${ordinal(i + 1)}</span>
            <span class="swatch" style="background:${color}"></span>
            <span class="name">${escapeHtml(s.name)}</span>
            <span class="split">${s.time !== null ? s.time.toFixed(2) + 's' : Math.max(0, Math.round(Track.LENGTH - s.x)) + 'm back'}</span>
        </div>`;
    }).join('');

    el.overlayInner.innerHTML = `
        <div class="result-title ${won ? 'win' : 'lose'}">${won ? 'YOU WIN!' : ordinal(mineIdx + 1) + ' PLACE'}</div>
        <div class="result-sub">${escapeHtml(Maps.byId(mapId).name)} · Level ${level} ${Difficulty.name(level)} · best streak ${bestStreak}</div>
        <div class="standings">${rows}</div>
        <div class="btn-row">
            ${isHost ? '<button class="btn primary" data-action="again">↻  Race Again</button>' : ''}
            <button class="btn" data-action="lobby">👥  Lobby</button>
            <button class="btn small" data-action="title">⌂  Menu</button>
        </div>
        ${isHost ? '' : '<div class="menu-hint-always">The host decides when to run it again.</div>'}`;
}

/* ---------------------------------------------------------------- update -- */

function update(dt) {
    if (screen === 'countdown') {
        countdown -= dt;
        const n = Math.ceil(countdown);
        if (n !== lastCountdownBeep) { Sfx.countdown(n); lastCountdownBeep = n; }
        if (countdown <= 0) {
            Target.spawn(view, level);   // place the first box before it's shown
            setScreen('racing');
            el.overlayInner.innerHTML = '';
        } else {
            el.overlayInner.innerHTML = n > 0
                ? `<div class="count">${n}</div>`
                : `<div class="count go">GO!</div>`;
        }
        updateHud();
        return;
    }

    if (screen === 'racing') {
        raceTime += dt;
        for (const car of allCars) {
            car.update(dt);
            // Remote cars own their own finish time; it arrives over the network.
            if (!car.isRemote && car.finishTime === null && car.x >= Track.LENGTH) {
                car.finishTime = raceTime;
                if (mp && car.isPlayer) Net.reportFinish(raceTime);
            }
        }

        if (mp) {
            Net.reportPosition(player.x, player.speed);
            // The host decides when a multiplayer race is over; everyone waits
            // for the standings rather than ending on their own line crossing.
            if (player.finishTime !== null && screen === 'racing') finishRace();
        } else if (player.finishTime !== null || aiCars.every(c => c.finishTime !== null)) {
            finishRace();
        }
    }

    if (screen !== 'paused') {
        camera += (cameraTarget() - camera) * Math.min(1, dt * 8);
        Particles.update(dt);
        if (shake > 0) shake = Math.max(0, shake - dt);
        for (let i = popups.length - 1; i >= 0; i--) {
            popups[i].life -= dt;
            popups[i].rise += dt * 60;
            if (popups[i].life <= 0) popups.splice(i, 1);
        }
    }

    if (['racing', 'finished', 'paused'].includes(screen)) updateHud();
}

function cameraTarget() {
    return Math.max(-140, player.x - view.width * 0.32);
}

function placeOf(car) {
    return allCars.filter(c => c.x > car.x).length + 1;
}

function ordinal(n) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function updateHud() {
    el.speed.textContent = Math.round(player.speed * 0.55);
    el.place.textContent = ordinal(placeOf(player));
    el.streak.textContent = streak;
    el.time.textContent = raceTime.toFixed(1);

    const usable = el.progress.clientWidth - 26;
    for (const car of allCars) {
        pips.get(car).style.left = (Math.min(1, car.x / Track.LENGTH) * usable) + 'px';
    }

    // Ghost marker = where your PR pace would be at this moment.
    if (prAtStart && screen === 'racing') {
        el.ghost.style.left = (Math.min(1, raceTime / prAtStart) * usable) + 'px';
    }

    if (screen === 'racing' && Target.live) {
        const elapsed = (performance.now() - Target.shownAt) / 1000;
        Target.setTimer(Math.max(0, 1 - elapsed / Physics.SLOW_TIME));
    }
}

/* ---------------------------------------------------------------- render -- */

function render() {
    ctx.save();
    if (shake > 0) {
        const m = shake * 16;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    ctx.clearRect(-40, -40, view.width + 80, view.height + 80);
    Track.draw(ctx, view, camera);

    const ordered = [...allCars].sort((a, b) => a.lane - b.lane);
    for (const car of ordered) {
        const screenX = car.x - camera;
        if (screenX < -160 || screenX > view.width + 160) continue;
        car.draw(ctx, screenX, Track.laneY(car.lane, view));
    }

    Particles.draw(ctx, 0);

    const px = player.x - camera;
    const py = Track.laneY(player.lane, view) - 62;
    ctx.textAlign = 'center';
    for (const p of popups) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.5));
        ctx.fillStyle = p.color;
        ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
        ctx.fillText(p.text, px, py - p.rise);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    ctx.restore();
}

function finishRace() {
    if (mp) { finishMultiplayerRace(); return; }

    const standings = [...allCars].sort((a, b) => {
        if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
        if (a.finishTime !== null) return -1;
        if (b.finishTime !== null) return 1;
        return b.x - a.x;
    });

    const rank = standings.indexOf(player) + 1;
    const won = rank === 1;
    const time = player.finishTime;

    // Only a completed race can set a personal record.
    let isRecord = false, previous = prAtStart;
    if (time !== null) {
        const res = Records.submit(mapId, level, time);
        isRecord = res.isRecord;
        previous = res.previous;
    }

    lastResult = {
        won, rank, time, isRecord, previous, bestStreak,
        blurb: won
            ? (level === Difficulty.MAX ? 'Nothing left to beat. That was Legend.' : 'Try the next level up.')
            : 'Tap faster off the line to take the lead.',
        standings: standings.map(c => ({
            name: c.name,
            isPlayer: c.isPlayer,
            color: c.colors.light,
            split: c.finishTime !== null ? `${c.finishTime.toFixed(2)}s` : `${Math.round(Track.LENGTH - c.x)}m back`
        }))
    };

    Target.reset();
    setScreen('finished');
    render_results();

    if (isRecord) { Sfx.record(); Particles.confetti(view.width, view.height); }
    else if (won) { Sfx.win(); Particles.confetti(view.width, view.height); }
    else Sfx.lose();
}

// You've crossed the line but the race isn't decided until the host says so, so
// park on a "waiting" screen until the standings land.
function finishMultiplayerRace() {
    Target.reset();
    setScreen('finished');
    render_results();
}

// The standings arrived (or we're the host and just computed them).
function onMpResults(standings) {
    mpStandings = standings;
    if (screen !== 'finished') { Target.reset(); setScreen('finished'); }
    render_results();

    const mine = standings.findIndex(s => s.id === Net.myId);
    if (mine === 0) { Sfx.win(); Particles.confetti(view.width, view.height); }
    else Sfx.lose();
}

/* ------------------------------------------------------------------ loop -- */

function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
}

el.overlayInner.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    onAction(target.dataset.action, target.dataset.value);
});
el.muteBtn.addEventListener('click', () => { Sfx.ensure(); toggleMute(); });
el.pauseBtn.addEventListener('click', () => { Sfx.ensure(); pauseRace(); });

// pointerdown, not click: on a touch screen `click` lands ~100ms late, and here
// that delay would be indistinguishable from a slow reaction.
el.target.addEventListener('pointerdown', onTargetHit);
el.game.addEventListener('pointerdown', onFieldMiss);
el.game.addEventListener('contextmenu', (e) => e.preventDefault());   // no long-press menu mid-race

el.rotateClose.addEventListener('click', () => {
    rotateHintOff = true;
    try { localStorage.setItem(ROTATE_HINT_KEY, '1'); } catch (e) { /* ignore */ }
    updateRotateHint();
});

window.addEventListener('resize', resize);
// iOS can report the old viewport size during the rotation itself.
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

Target.init(el.target);
resize();
Sfx.init();
if (Sfx.muted) { el.muteBtn.textContent = '🔇'; el.muteBtn.classList.add('off'); }
InputHandler.init(onKey);
level = Difficulty.load();
mapId = Maps.load();
showTitle();
requestAnimationFrame(loop);
