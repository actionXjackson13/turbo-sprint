const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const el = {
    speed: document.getElementById('speedValue'),
    place: document.getElementById('placeValue'),
    streak: document.getElementById('streakValue'),
    time: document.getElementById('timeValue'),
    progress: document.getElementById('progressTrack'),
    chips: document.getElementById('chips'),
    hint: document.getElementById('promptHint'),
    promptBar: document.getElementById('promptBar'),
    overlay: document.getElementById('overlay'),
    overlayInner: document.getElementById('overlayInner')
};

const FULL_KEY_POOL = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const QUEUE_LENGTH = 4;
const COUNTDOWN_FROM = 3;

const view = { width: 0, height: 0 };

let state = 'menu';            // menu | countdown | racing | finished
let level = Difficulty.DEFAULT;
let keyPool = FULL_KEY_POOL;
let player, aiCars, allCars;
let pips = new Map();
let camera = 0;
let countdown = COUNTDOWN_FROM;
let raceTime = 0;
let queue = [];
let promptShownAt = 0;
let streak = 0;
let popups = [];               // floating PERFECT/GREAT text
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

// Rebuilds the whole race to match `level`. Safe to call repeatedly while the
// player is still flicking through difficulties on the menu.
function applyDifficulty(newLevel) {
    level = Difficulty.clamp(newLevel);
    Physics.decay = Physics.DECAY_BASE * Difficulty.decayMult(level);
    Physics.minSpeed = Difficulty.minSpeed(level);
    Track.LENGTH = Difficulty.trackLength(level);
    keyPool = FULL_KEY_POOL.slice(0, Difficulty.keyPoolSize(level));

    player = new PlayerCar(1);
    aiCars = AICar.ROSTER.map(cfg => new AICar(cfg, Difficulty.paceMult(level)));
    allCars = [player, ...aiCars];

    camera = cameraTarget();
    buildPips();
}

function showMenu() {
    state = 'menu';
    applyDifficulty(level);
    raceTime = 0;
    streak = 0;
    popups = [];
    el.promptBar.style.display = 'none';
    el.overlay.classList.add('dim');
    renderMenu();
    updateHud();
}

function startRace() {
    applyDifficulty(level);
    Difficulty.save(level);

    state = 'countdown';
    countdown = COUNTDOWN_FROM;
    raceTime = 0;
    streak = 0;
    popups = [];

    queue = [];
    for (let i = 0; i < QUEUE_LENGTH; i++) queue.push(randomKey(queue[queue.length - 1]));
    renderChips();

    el.promptBar.style.display = '';
    el.hint.style.opacity = '1';
    el.overlay.classList.remove('dim');
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

/* ---------------------------------------------------------------- input -- */

function onKey(key) {
    if (state === 'menu') {
        if (key === 'ARROWLEFT')  { applyDifficulty(level - 1); renderMenu(); }
        if (key === 'ARROWRIGHT') { applyDifficulty(level + 1); renderMenu(); }
        if (/^[0-9]$/.test(key))  { applyDifficulty(parseInt(key, 10)); renderMenu(); }
        if (key === 'ENTER' || key === 'SPACE') startRace();
        return;
    }

    if (state === 'finished') {
        if (key === 'ARROWLEFT')  { level = Difficulty.clamp(level - 1); renderResults(); }
        if (key === 'ARROWRIGHT') { level = Difficulty.clamp(level + 1); renderResults(); }
        if (/^[0-9]$/.test(key))  { level = Difficulty.clamp(parseInt(key, 10)); renderResults(); }
        if (key === 'ENTER' || key === 'SPACE') startRace();
        return;
    }

    if (state !== 'racing') return;

    if (key === queue[0]) {
        const reaction = (performance.now() - promptShownAt) / 1000;
        player.boost(reaction, streak);
        streak++;

        const rating = Physics.ratingFor(reaction);
        popups.push({ text: rating.text, color: rating.color, life: 0.75, rise: 0 });

        queue.shift();
        queue.push(randomKey(queue[queue.length - 1]));
        promptShownAt = performance.now();
        renderChips();
        el.hint.style.opacity = '0';
    } else if (keyPool.includes(key)) {
        player.miss();
        streak = 0;
        popups.push({ text: 'MISS', color: '#ff7b7b', life: 0.6, rise: 0 });
        const current = el.chips.querySelector('.chip.current');
        if (current) {
            current.classList.remove('miss');
            void current.offsetWidth;   // restart the shake animation
            current.classList.add('miss');
        }
    }
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

/* ------------------------------------------------------- difficulty UI -- */

function levelBar() {
    let segs = '';
    for (let i = Difficulty.MIN; i <= Difficulty.MAX; i++) {
        const on = i <= level;
        segs += `<span class="seg${on ? ' on' : ''}" style="${on ? `background:${Difficulty.color(i)}` : ''}"></span>`;
    }
    return `<div class="level-bar">${segs}</div>`;
}

// Rough guide so the player knows what they're picking, not just a number.
function levelFacts() {
    const fastest = Math.max(...AICar.ROSTER.map(c => c.baseSpeed)) * Difficulty.paceMult(level);
    const rivalTime = (Track.LENGTH / fastest).toFixed(1);
    return `<div class="level-facts">
        <span><b>${keyPool.length}</b> keys</span>
        <span><b>${Track.LENGTH}</b>m track</span>
        <span>rivals finish in <b>~${rivalTime}s</b></span>
    </div>`;
}

function renderMenu() {
    el.overlayInner.innerHTML = `
        <div class="menu">
            <div class="menu-title">TURBO SPRINT</div>
            <div class="menu-sub">Tap the key prompts to build speed — no steering, just pace.</div>
            <div class="level-head">
                <span class="level-num" style="color:${Difficulty.color(level)}">${level}</span>
                <span class="level-name">${Difficulty.name(level)}</span>
            </div>
            ${levelBar()}
            ${levelFacts()}
            <div class="menu-hint"><b>&larr;</b> <b>&rarr;</b> or <b>0-9</b> to set difficulty &nbsp;·&nbsp; <b>Enter</b> to race</div>
        </div>`;
}

/* ---------------------------------------------------------------- update -- */

function update(dt) {
    if (state === 'menu') {
        camera += (cameraTarget() - camera) * Math.min(1, dt * 8);
        return;
    }

    if (state === 'countdown') {
        countdown -= dt;
        if (countdown <= 0) {
            state = 'racing';
            promptShownAt = performance.now();
        }
        drawOverlayCountdown();
        updateHud();   // otherwise the previous race's numbers linger on screen
        return;
    }

    if (state === 'racing') {
        raceTime += dt;
        for (const car of allCars) {
            car.update(dt);
            if (car.finishTime === null && car.x >= Track.LENGTH) car.finishTime = raceTime;
        }
        // The race is over once you cross — or once every rival has, since at
        // that point last place is already locked in.
        if (player.finishTime !== null || aiCars.every(c => c.finishTime !== null)) {
            finishRace();
        }
    }

    camera += (cameraTarget() - camera) * Math.min(1, dt * 8);

    for (let i = popups.length - 1; i >= 0; i--) {
        popups[i].life -= dt;
        popups[i].rise += dt * 60;
        if (popups[i].life <= 0) popups.splice(i, 1);
    }

    updateHud();
}

// Keep the player about a third of the way across the screen, but never scroll
// so far left that the starting grid is off-screen.
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
        const pct = Math.min(1, car.x / Track.LENGTH);
        pips.get(car).style.left = (pct * usable) + 'px';
    }

    if (state === 'racing') {
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
    ctx.clearRect(0, 0, view.width, view.height);
    Track.draw(ctx, view, camera);

    // Draw far lanes first so nearer cars overlap correctly.
    const ordered = [...allCars].sort((a, b) => a.lane - b.lane);
    for (const car of ordered) {
        const screenX = car.x - camera;
        if (screenX < -160 || screenX > view.width + 160) continue;
        car.draw(ctx, screenX, Track.laneY(car.lane, view));
    }

    // Floating hit-rating text above the player's car.
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
}

function drawOverlayCountdown() {
    const n = Math.ceil(countdown);
    el.overlayInner.innerHTML = n > 0
        ? `<div class="count">${n}</div>`
        : `<div class="count go">GO!</div>`;
}

function finishRace() {
    state = 'finished';
    el.promptBar.style.display = 'none';
    el.overlay.classList.add('dim');
    renderResults();
}

function renderResults() {
    // Cars still running are ranked behind by their remaining distance.
    const standings = [...allCars].sort((a, b) => {
        if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
        if (a.finishTime !== null) return -1;
        if (b.finishTime !== null) return 1;
        return b.x - a.x;
    });

    const rank = standings.indexOf(player) + 1;
    const won = rank === 1;

    const rows = standings.map((car, i) => {
        const split = car.finishTime !== null
            ? `${car.finishTime.toFixed(2)}s`
            : `${Math.round(Track.LENGTH - car.x)}m back`;
        return `<div class="standing${car.isPlayer ? ' you' : ''}">
                    <span class="rank">${ordinal(i + 1)}</span>
                    <span class="swatch" style="background:${car.colors.light}"></span>
                    <span class="name">${car.name}</span>
                    <span class="split">${split}</span>
                </div>`;
    }).join('');

    el.overlayInner.innerHTML = `
        <div class="result-title ${won ? 'win' : 'lose'}">${won ? 'YOU WIN!' : ordinal(rank) + ' PLACE'}</div>
        <div class="result-sub">${won
            ? (level === Difficulty.MAX ? 'Nothing left to beat. That was Legend.' : 'Try the next level up.')
            : 'Tap faster off the line to take the lead.'}</div>
        <div class="standings">${rows}</div>
        <div class="next-level">
            Difficulty <span class="level-num small" style="color:${Difficulty.color(level)}">${level}</span>
            <span class="level-name">${Difficulty.name(level)}</span>
        </div>
        ${levelBar()}
        <div class="menu-hint"><b>&larr;</b> <b>&rarr;</b> change difficulty &nbsp;·&nbsp; <b>Enter</b> to race again</div>`;
}

/* ------------------------------------------------------------------ loop -- */

function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    update(dt);
    render();

    if (state === 'racing') el.overlayInner.innerHTML = '';

    requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
InputHandler.init(onKey);
level = Difficulty.load();
showMenu();
requestAnimationFrame(loop);
