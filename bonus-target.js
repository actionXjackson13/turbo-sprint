// A second, rarer tap target: blue, labelled DOUBLE, and it takes two taps to
// clear instead of one. It exists alongside the regular box rather than
// replacing it — going for it is optional, and ignoring it costs nothing.
//
// Because clearing it costs the extra time of a second tap, the payout uses the
// same reaction-time curve the main box uses (see Physics.boostFor), just nudged
// up a little — see BOOST_BONUS — so it's never a worse trade than the main loop
// alone, without being a big detour from it either.
const BonusTarget = {
    el: null,
    pipEls: null,

    x: 0,
    y: 0,
    size: 90,
    shownAt: 0,   // performance.now() when this spawn appeared
    live: false,
    taps: 0,      // 0 = untouched, 1 = one tap in, needs one more

    dueAt: Infinity,   // raceTime at which the next one should appear

    // Noticeably rarer than the main box, which effectively respawns as fast as
    // you can hit it. Both are in seconds of race time, not wall-clock time, so
    // pausing the race pauses the countdown to the next spawn too.
    MIN_DELAY: 2.4,
    MAX_DELAY: 4.2,
    MIN_COOLDOWN: 3.8,
    MAX_COOLDOWN: 6.5,

    SIZE_SCALE: 0.84,   // a little smaller than the main box, so it reads as secondary
    SIZE_FLOOR: 60,
    SIZE_VIEW_CAP: 0.26,

    BOOST_BONUS: 0.12,  // +12% over what the same reaction time earns on a single tap

    MIN_SEPARATION: 40, // keep clear of the live main box so the hit areas don't touch

    SPAWN_TRIES: 16,

    init(el) {
        this.el = el;
        this.pipEls = [...el.querySelectorAll('.tap-pip')];
    },

    randDelay(min, max) { return min + Math.random() * (max - min); },

    // Called once at the start of a race: nothing on screen yet, wait a while
    // before the first one shows up.
    armForRace(raceTime) {
        this.live = false;
        this.taps = 0;
        this.hide();
        this.dueAt = raceTime + this.randDelay(this.MIN_DELAY, this.MAX_DELAY);
    },

    // Reuses the regular target's keep-out margins so both boxes respect the
    // same notch/home-indicator/corner-button boundaries.
    zone(view) {
        const inset = view.inset;
        const half = this.size / 2;
        const left = inset.left + Target.PAD_SIDE + half;
        const top = inset.top + Target.PAD_TOP + half;
        const right = view.width - inset.right - Target.PAD_SIDE - half;
        const bottom = view.height - inset.bottom - Target.PAD_BOTTOM - half;
        return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
    },

    hitsCorner(view, x, y) {
        const half = this.size / 2;
        return x + half > view.width - view.inset.right - Target.CORNER_W
            && y - half < view.inset.top + Target.CORNER_H;
    },

    computeSize(view, level) {
        const cap = Math.min(view.width, view.height) * this.SIZE_VIEW_CAP;
        return Math.round(Math.max(this.SIZE_FLOOR, Math.min(Difficulty.targetSize(level, view) * this.SIZE_SCALE, cap)));
    },

    spawn(view, level) {
        this.size = this.computeSize(view, level);
        const zone = this.zone(view);
        const minSep = this.size / 2 + Target.size / 2 + this.MIN_SEPARATION;

        let chosen = null, fallback = null;
        for (let i = 0; i < this.SPAWN_TRIES && !chosen; i++) {
            const cx = zone.left + Math.random() * (zone.right - zone.left);
            const cy = zone.top + Math.random() * (zone.bottom - zone.top);
            if (this.hitsCorner(view, cx, cy)) continue;
            if (!fallback) fallback = [cx, cy];

            const clear = !Target.live || Math.hypot(cx - Target.x, cy - Target.y) >= minSep;
            if (clear) chosen = [cx, cy];
        }

        const [x, y] = chosen || fallback || [zone.left, zone.top];
        this.x = x;
        this.y = y;
        this.live = true;
        this.taps = 0;
        this.shownAt = performance.now();
        this.setTapsUi();
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

    pop() {
        this.el.classList.remove('pop');
        void this.el.offsetWidth;
        this.el.classList.add('pop');
    },

    setTapsUi() {
        this.el.classList.toggle('armed', this.taps > 0);
        this.pipEls.forEach((p, i) => p.classList.toggle('filled', i < this.taps));
    },

    // Registers one tap. Returns null if that was only the first of the two
    // required taps; returns the total reaction time (spawn to clear, in seconds)
    // once the second tap lands, and schedules the next appearance.
    tap(raceTime) {
        this.taps++;
        if (this.taps < 2) {
            this.setTapsUi();
            this.pop();
            return null;
        }
        const reaction = (performance.now() - this.shownAt) / 1000;
        this.live = false;
        this.hide();
        this.dueAt = raceTime + this.randDelay(this.MIN_COOLDOWN, this.MAX_COOLDOWN);
        return reaction;
    },

    show() {
        if (this.live) this.el.classList.remove('hidden');
    },

    hide() {
        this.el.classList.add('hidden');
    },

    // Coming back from a pause: keep the box (and its tap progress) where it
    // was, but don't charge the player reaction time for the paused stretch.
    resume() {
        this.shownAt = performance.now();
        this.show();
    },

    reset() {
        this.live = false;
        this.taps = 0;
        this.dueAt = Infinity;
        this.hide();
    },

    refit(view, level) {
        if (!this.live) return;
        this.size = this.computeSize(view, level);
        const zone = this.zone(view);
        this.x = Math.min(zone.right, Math.max(zone.left, this.x));
        this.y = Math.min(zone.bottom, Math.max(zone.top, this.y));
        this.place();
    }
};
