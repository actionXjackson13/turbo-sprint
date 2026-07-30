// The tap target: one box, somewhere on the screen, that you have to hit to
// accelerate. This module owns where the box is and how long it has been
// there; game.js owns what hitting it means.
//
// There is only ever one box live. Most of them are the ordinary gold TAP box,
// but every so often the box that appears is a blue DOUBLE instead, which needs
// two taps to clear rather than one. It's the same slot in the same rotation —
// clear one and the next appears immediately, whichever kind it is.
//
// It's a DOM element rather than something drawn on the canvas so that hit
// testing is just a pointer event, and so the pop/shake animations come from
// CSS for free.
const Target = {
    el: null,
    timerEl: null,
    capEl: null,
    pipEls: null,

    x: 0,          // centre, in CSS pixels
    y: 0,
    size: 110,
    shownAt: 0,    // performance.now() when this box appeared
    live: false,   // false = nothing to hit (menus, countdown, pause, finish)

    kind: 'normal',   // 'normal' | 'double'
    taps: 0,          // taps landed on the current box
    sinceDouble: 0,   // ordinary boxes cleared since the last DOUBLE

    // How often a spawn is a DOUBLE. The minimum gap keeps them from clumping
    // together; with these two the run works out to roughly one box in six.
    DOUBLE_CHANCE: 0.28,
    DOUBLE_MIN_GAP: 2,

    // A DOUBLE costs you the time of a second tap, so it pays a little over what
    // that same (longer) reaction would earn on an ordinary box. Deliberately
    // small — it's a nudge, not a second income stream.
    BOOST_BONUS: 0.12,

    // Keep-out margins. The top one clears the HUD strip, the bottom one keeps
    // the box out of the iOS home-indicator / edge-swipe gutter, and the corner
    // block is the mute + pause cluster in #topRight.
    PAD_TOP: 92,
    PAD_SIDE: 12,
    PAD_BOTTOM: 22,
    CORNER_W: 108,
    CORNER_H: 58,

    SPAWN_TRIES: 16,

    init(el) {
        this.el = el;
        this.timerEl = el.querySelector('.timer');
        this.capEl = el.querySelector('.cap');
        this.pipEls = [...el.querySelectorAll('.tap-pip')];
    },

    isDouble() { return this.kind === 'double'; },

    tapsNeeded() { return this.kind === 'double' ? 2 : 1; },

    // Start of a race: the first couple of boxes are always ordinary ones, so
    // nobody's opening move is a DOUBLE.
    resetRotation() {
        this.sinceDouble = 0;
    },

    pickKind() {
        if (this.sinceDouble < this.DOUBLE_MIN_GAP || Math.random() >= this.DOUBLE_CHANCE) {
            this.sinceDouble++;
            return 'normal';
        }
        this.sinceDouble = 0;
        return 'double';
    },

    // Registers a tap. Returns false while a DOUBLE still needs another one,
    // true once the box is cleared.
    registerTap() {
        this.taps++;
        if (this.taps < this.tapsNeeded()) {
            // Adding .armed is what plays the acknowledging bump, so there's no
            // pop() call here; clearing .miss stops a previous fumble's red from
            // sticking to a box that's still in play.
            this.el.classList.remove('miss');
            this.renderKind();
            return false;
        }
        return true;
    },

    // Paints the current kind and tap progress onto the element.
    renderKind() {
        const dbl = this.isDouble();
        this.el.classList.toggle('double', dbl);
        this.el.classList.toggle('armed', dbl && this.taps > 0);
        this.capEl.textContent = dbl ? 'DOUBLE' : 'TAP';
        this.pipEls.forEach((p, i) => p.classList.toggle('filled', i < this.taps));
    },

    // The rectangle the box's *centre* may land in, in screen coordinates.
    // Narrow screens can squeeze this to nothing, so both axes are collapsed
    // to a single valid line rather than allowed to invert.
    zone(view) {
        const inset = view.inset;
        const half = this.size / 2;
        const left = inset.left + this.PAD_SIDE + half;
        const top = inset.top + this.PAD_TOP + half;
        const right = view.width - inset.right - this.PAD_SIDE - half;
        const bottom = view.height - inset.bottom - this.PAD_BOTTOM - half;
        return {
            left, top,
            right: Math.max(left, right),
            bottom: Math.max(top, bottom)
        };
    },

    // True if a box centred here would sit under the corner buttons.
    hitsCorner(view, x, y) {
        const half = this.size / 2;
        return x + half > view.width - view.inset.right - this.CORNER_W
            && y - half < view.inset.top + this.CORNER_H;
    },

    // Picks a new spot and restarts the clock. The candidate has to land in a ring
    // around the last one — far enough that the box visibly moves, close enough
    // that the level's reach is respected. Sampling can miss that ring near the
    // edges, so any in-bounds candidate is kept as a fallback.
    spawn(view, level) {
        this.size = Difficulty.targetSize(level, view);
        const zone = this.zone(view);
        const diagonal = Math.hypot(zone.right - zone.left, zone.bottom - zone.top);
        const minJump = Difficulty.travelSpread(level) * diagonal;
        const maxJump = Difficulty.travelReach(level) * diagonal;

        let chosen = null;
        let fallback = null;
        for (let i = 0; i < this.SPAWN_TRIES && !chosen; i++) {
            const cx = zone.left + Math.random() * (zone.right - zone.left);
            const cy = zone.top + Math.random() * (zone.bottom - zone.top);
            if (this.hitsCorner(view, cx, cy)) continue;
            if (!fallback) fallback = [cx, cy];

            const jump = Math.hypot(cx - this.x, cy - this.y);
            if (!this.live || (jump >= minJump && jump <= maxJump)) chosen = [cx, cy];
        }

        const [x, y] = chosen || fallback || [zone.left, zone.top];
        this.x = x;
        this.y = y;
        this.live = true;
        this.shownAt = performance.now();
        this.kind = this.pickKind();
        this.taps = 0;
        this.renderKind();
        this.place();
        this.show();
        this.pop();
    },

    place() {
        const s = this.size;
        this.el.style.width = s + 'px';
        this.el.style.height = s + 'px';
        this.el.style.left = Math.round(this.x - s / 2) + 'px';
        this.el.style.top = Math.round(this.y - s / 2) + 'px';
        this.el.style.borderRadius = Math.round(s * 0.2) + 'px';
    },

    // Restarts the spawn animation. Removing the class and forcing a reflow is
    // what makes it replay on a box that is already on screen.
    pop() {
        this.el.classList.remove('pop', 'miss');
        void this.el.offsetWidth;
        this.el.classList.add('pop');
    },

    flashMiss() {
        this.el.classList.remove('miss');
        void this.el.offsetWidth;
        this.el.classList.add('miss');
    },

    // Depleting bar, 1 = full. Mirrors the old key-prompt timer.
    setTimer(remaining) {
        this.timerEl.style.width = (remaining * 100) + '%';
        this.timerEl.style.background =
            remaining > 0.55 ? '#6dff8f' : remaining > 0.25 ? '#ffd24a' : '#ff5f5f';
    },

    show() {
        if (this.live) this.el.classList.remove('hidden');
    },

    hide() {
        this.el.classList.add('hidden');
    },

    // Coming back from a pause: keep the box where it was but don't charge the
    // player for the time spent paused.
    resume() {
        this.shownAt = performance.now();
        this.show();
    },

    reset() {
        this.live = false;
        this.kind = 'normal';
        this.taps = 0;
        this.renderKind();
        this.hide();
    },

    // A rotation or window resize can leave the box off-screen or under the
    // notch, and changes the size the level calls for.
    refit(view, level) {
        if (!this.live) return;
        this.size = Difficulty.targetSize(level, view);
        const zone = this.zone(view);
        this.x = Math.min(zone.right, Math.max(zone.left, this.x));
        this.y = Math.min(zone.bottom, Math.max(zone.top, this.y));
        this.place();
    }
};
