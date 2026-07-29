// The tap target: one box, somewhere on the screen, that you have to hit to
// accelerate. This module owns where the box is and how long it has been
// there; game.js owns what hitting it means.
//
// It's a DOM element rather than something drawn on the canvas so that hit
// testing is just a pointer event, and so the pop/shake animations come from
// CSS for free.
const Target = {
    el: null,
    timerEl: null,

    x: 0,          // centre, in CSS pixels
    y: 0,
    size: 110,
    shownAt: 0,    // performance.now() when this box appeared
    live: false,   // false = nothing to hit (menus, countdown, pause, finish)

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
