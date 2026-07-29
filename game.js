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
    chips: document.getElementById('chips'),
    hint: document.getElementById('promptHint'),
    promptBar: document.getElementById('promptBar'),
    overlay: document.getElementById('overlay'),
    overlayInner: document.getElementById('overlayInner'),
    muteBtn: document.getElementById('muteBtn'),
    pauseBtn: document.getElementById('pauseBtn')
};

const FULL_KEY_POOL = ['W', 'A', 'S', 'D'];
const QUEUE_LENGTH = 4;
const COUNTDOWN_FROM = 3;

const view = { width: 0, height: 0 };

// title | howto | select | records | countdown | racing | paused | finished
let screen = 'title';
let level = Difficulty.DEFAULT;
let mapId = Maps.DEFAULT;
let keyPool = FULL_KEY_POOL;
let player, aiCars, allCars;
let pips = new Map();
let camera = 0;
let countdown = COUNTDOWN_FROM;
let lastCountdownBeep = -1;
let raceTime = 0;
let queue = [];
let promptShownAt = 0;
let streak = 0;
let bestStreak = 0;
let popups = [];
let shake = 0;
let prAtStart = null;
let lastResult = null;
let lastFrame = performance.now();

/* ---------------------------------------------------------------- setup -- */

function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Rebuilds the race to match the current map + level. Safe to call repeatedly
// while the player is still flicking through options on the select screen.
function applySettings() {
    const map = Maps.byId(mapId);
    Track.setTheme(map);
    Track.LENGTH = Math.round(Difficulty.trackLength(level) * map.lengthMult);
    Physics.decay = Physics.DECAY_BASE * Difficulty.decayMult(level) * map.decayMult;
    Physics.minSpeed = Difficulty.minSpeed(level);
    keyPool = FULL_KEY_POOL.slice(0, Difficulty.keyPoolSize(level));

    player = new PlayerCar(1);
    aiCars = AICar.ROSTER.map(cfg => new AICar(cfg, Difficulty.paceMult(level)));
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

function randomKey(avoid) {
    if (keyPool.length === 1) return keyPool[0];
    let key;
    do { key = keyPool[Math.floor(Math.random() * keyPool.length)]; } while (key === avoid);
    return key;
}

/* --------------------------------------------------------- screen flow -- */

function setScreen(next) {
    screen = next;
    const inMenu = ['title', 'howto', 'select', 'records', 'finished', 'paused'].includes(next);
    el.overlay.classList.toggle('dim', inMenu);
    el.overlay.classList.toggle('interactive', inMenu);
    el.hud.classList.toggle('hidden', ['title', 'howto', 'select', 'records'].includes(next));
    el.promptBar.style.display = ['countdown', 'racing', 'paused'].includes(next) ? '' : 'none';
    el.pauseBtn.classList.toggle('on', ['racing', 'countdown'].includes(next));
}

function showTitle() {
    applySettings();
    Particles.clear();
    setScreen('title');
    render_title();
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

function startRace() {
    applySettings();
    Difficulty.save(level);
    Maps.save(mapId);

    countdown = COUNTDOWN_FROM;
    lastCountdownBeep = -1;
    raceTime = 0;
    streak = 0;
    bestStreak = 0;
    popups = [];
    shake = 0;
    Particles.clear();
    prAtStart = Records.get(mapId, level);

    queue = [];
    for (let i = 0; i < QUEUE_LENGTH; i++) queue.push(randomKey(queue[queue.length - 1]));
    renderChips();

    el.hint.style.opacity = '1';
    el.ghost.style.display = prAtStart ? 'block' : 'none';
    el.pr.textContent = Records.format(prAtStart);
    setScreen('countdown');
    updateHud();
}

/* ---------------------------------------------------------------- input -- */

function onKey(key) {
    Sfx.ensure();   // first gesture unlocks audio

    if (screen === 'racing') {
        if (key === 'ESCAPE') { pauseRace(); return; }
        handleRaceKey(key);
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
        return;
    }

    if (screen === 'howto' || screen === 'records') {
        if (key === 'ESCAPE' || key === 'ENTER' || key === 'SPACE') showTitle();
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
        if (key === 'ARROWLEFT')  { level = Difficulty.clamp(level - 1); render_results(); }
        if (key === 'ARROWRIGHT') { level = Difficulty.clamp(level + 1); render_results(); }
        if (/^[0-9]$/.test(key)) { level = Difficulty.clamp(parseInt(key, 10)); render_results(); }
        if (key === 'ENTER' || key === 'SPACE') startRace();
        if (key === 'ESCAPE') showTitle();
    }
}

function handleRaceKey(key) {
    if (key === queue[0]) {
        const reaction = (performance.now() - promptShownAt) / 1000;
        const gain = player.boost(reaction, streak);
        streak++;
        bestStreak = Math.max(bestStreak, streak);

        const rating = Physics.ratingFor(reaction);
        popups.push({ text: rating.text, color: rating.color, life: 0.75, rise: 0 });
        Particles.boost(player.x - camera, Track.laneY(player.lane, view), gain / Physics.BOOST_FAST);
        Sfx.blip(streak);

        queue.shift();
        queue.push(randomKey(queue[queue.length - 1]));
        promptShownAt = performance.now();
        renderChips();
        el.hint.style.opacity = '0';
    } else if (keyPool.includes(key)) {
        player.miss();
        streak = 0;
        shake = 0.28;
        popups.push({ text: 'MISS', color: '#ff7b7b', life: 0.6, rise: 0 });
        Particles.miss(player.x - camera, Track.laneY(player.lane, view));
        Sfx.miss();
        const current = el.chips.querySelector('.chip.current');
        if (current) {
            current.classList.remove('miss');
            void current.offsetWidth;   // restart the shake animation
            current.classList.add('miss');
        }
    }
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
        case 'start':    startRace(); break;
        case 'again':    startRace(); break;
        case 'resume':   resumeRace(); break;
        case 'map':      mapId = value; applySettings(); render_select(); break;
        case 'level':    level = Difficulty.clamp(parseInt(value, 10)); applySettings();
                         (screen === 'finished' ? render_results : render_select)(); break;
        case 'clearPR':  Records.clear(); render_records(); break;
        case 'mute':     toggleMute(); break;
    }
}

function toggleMute() {
    const muted = Sfx.toggle();
    el.muteBtn.textContent = muted ? '🔇' : '🔊';
    el.muteBtn.classList.toggle('off', muted);
}

function pauseRace() {
    if (screen !== 'racing') return;
    setScreen('paused');
    render_paused();
}

function resumeRace() {
    if (screen !== 'paused') return;
    setScreen('racing');
    promptShownAt = performance.now();   // don't punish time spent paused
    el.overlayInner.innerHTML = '';
}

function renderChips() {
    el.chips.innerHTML = '';
    queue.forEach((key, i) => {
        const chip = document.createElement('div');
        chip.className = 'chip' + (i === 0 ? ' current' : '');
        chip.textContent = key;
        if (i === 0) {
            const timer = document.createElement('div');
            timer.className = 'timer';
            chip.appendChild(timer);
        }
        el.chips.appendChild(chip);
    });
}

/* ------------------------------------------------------------- screens -- */

function levelBar(clickable) {
    let segs = '';
    for (let i = Difficulty.MIN; i <= Difficulty.MAX; i++) {
        const on = i <= level;
        const style = on ? `background:${Difficulty.color(i)}` : '';
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
            <div class="how-item"><span class="num">1</span><span>A key appears in the big gold box, with the next few queued behind it. Press it.</span></div>
            <div class="how-item"><span class="num">2</span><span>Only <span class="kbd">W</span> <span class="kbd">A</span> <span class="kbd">S</span> <span class="kbd">D</span> are ever used, so your left hand stays put.</span></div>
            <div class="how-item"><span class="num">3</span><span>The faster you react, the bigger the speed boost. Under 0.3s is a <b>PERFECT!</b></span></div>
            <div class="how-item"><span class="num">4</span><span>Your speed constantly bleeds away — stop tapping and you slow down.</span></div>
            <div class="how-item"><span class="num">5</span><span>Wrong key costs you speed and resets your streak. A clean streak adds up to +25% per boost.</span></div>
            <div class="how-item"><span class="num">6</span><span>Beat the three rivals to the line. Your best time per map and level is saved.</span></div>
        </div>
        <div class="btn-row"><button class="btn" data-action="title">← Back</button></div>`;
}

function render_select() {
    const map = Maps.byId(mapId);
    const fastest = Math.max(...AICar.ROSTER.map(c => c.baseSpeed)) * Difficulty.paceMult(level);
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
                ${m.lengthMult < 0.9 ? '<span class="tag">sprint</span>' : ''}
                ${m.lengthMult > 1.15 ? '<span class="tag">endurance</span>' : ''}
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
            <span><b>${keyPool.join(' ')}</b></span>
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

function render_results() {
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

/* ---------------------------------------------------------------- update -- */

function update(dt) {
    if (screen === 'countdown') {
        countdown -= dt;
        const n = Math.ceil(countdown);
        if (n !== lastCountdownBeep) { Sfx.countdown(n); lastCountdownBeep = n; }
        if (countdown <= 0) {
            setScreen('racing');
            promptShownAt = performance.now();
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
            if (car.finishTime === null && car.x >= Track.LENGTH) car.finishTime = raceTime;
        }
        if (player.finishTime !== null || aiCars.every(c => c.finishTime !== null)) finishRace();
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

    if (screen === 'racing') {
        const elapsed = (performance.now() - promptShownAt) / 1000;
        const timer = el.chips.querySelector('.chip.current .timer');
        if (timer) {
            const remaining = Math.max(0, 1 - elapsed / Physics.SLOW_TIME);
            timer.style.width = (remaining * 100) + '%';
            timer.style.background = remaining > 0.55 ? '#6dff8f' : remaining > 0.25 ? '#ffd24a' : '#ff5f5f';
        }
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

    setScreen('finished');
    render_results();

    if (isRecord) { Sfx.record(); Particles.confetti(view.width, view.height); }
    else if (won) { Sfx.win(); Particles.confetti(view.width, view.height); }
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

window.addEventListener('resize', resize);
resize();
Sfx.init();
if (Sfx.muted) { el.muteBtn.textContent = '🔇'; el.muteBtn.classList.add('off'); }
InputHandler.init(onKey);
level = Difficulty.load();
mapId = Maps.load();
showTitle();
requestAnimationFrame(loop);
