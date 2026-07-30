// All sound is synthesised at runtime — no audio files, so the game stays a
// handful of text files and works offline from a file:// path.
const Sfx = {
    STORAGE_KEY: 'turboSprint.muted',
    ctx: null,
    muted: false,

    init() {
        try { this.muted = localStorage.getItem(this.STORAGE_KEY) === '1'; } catch (e) { /* ignore */ }
    },

    // Browsers only allow audio after a user gesture, so the context is created
    // lazily on the first key press or click.
    ensure() {
        if (this.muted) return null;
        if (!this.ctx) {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return null;
            try { this.ctx = new Ctor(); } catch (e) { return null; }
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },

    toggle() {
        this.muted = !this.muted;
        try { localStorage.setItem(this.STORAGE_KEY, this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
        if (!this.muted) this.blip(0);
        return this.muted;
    },

    tone({ freq, dur = 0.12, type = 'square', gain = 0.06, slideTo = null, delay = 0 }) {
        const ctx = this.ensure();
        if (!ctx) return;
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
        amp.gain.setValueAtTime(0.0001, t0);
        amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
        amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(amp).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    },

    // Pitch climbs with the streak so a good run audibly builds.
    blip(streak) {
        const step = Math.min(streak, 16);
        this.tone({ freq: 380 + step * 26, dur: 0.09, type: 'square', gain: 0.05 });
    },

    miss() {
        this.tone({ freq: 200, slideTo: 70, dur: 0.22, type: 'sawtooth', gain: 0.07 });
    },

    // The blue bonus box: a soft chime for the first tap, a two-note "ding-ding"
    // for the second — distinct from the regular blip so a tap on it doesn't get
    // mistaken for a normal one.
    bonusTap() {
        this.tone({ freq: 520, dur: 0.08, type: 'sine', gain: 0.05 });
    },

    bonusComplete() {
        [660, 990].forEach((f, i) =>
            this.tone({ freq: f, dur: 0.14, type: 'sine', gain: 0.07, delay: i * 0.07 }));
    },

    countdown(n) {
        this.tone({ freq: n > 0 ? 440 : 760, dur: n > 0 ? 0.14 : 0.32, type: 'triangle', gain: 0.08 });
    },

    win() {
        [523, 659, 784, 1047].forEach((f, i) =>
            this.tone({ freq: f, dur: 0.26, type: 'triangle', gain: 0.08, delay: i * 0.11 }));
    },

    lose() {
        [392, 330, 262].forEach((f, i) =>
            this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.07, delay: i * 0.13 }));
    },

    record() {
        [784, 988, 1319, 1568, 1976].forEach((f, i) =>
            this.tone({ freq: f, dur: 0.22, type: 'square', gain: 0.06, delay: i * 0.075 }));
    },

    click() {
        this.tone({ freq: 620, dur: 0.05, type: 'square', gain: 0.035 });
    }
};
