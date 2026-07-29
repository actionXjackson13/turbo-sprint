// Difficulty 0-10. Level 10 is the reference tuning everything scales down from:
// full-speed rivals, the smallest and furthest-jumping tap target, the longest
// track and the harshest speed decay. Lower levels pull all five levers at once
// so the drop in challenge is felt immediately rather than being buried in one
// number.
const Difficulty = {
    MIN: 0,
    MAX: 10,
    DEFAULT: 4,
    STORAGE_KEY: 'turboSprint.level',

    NAMES: [
        'Training Wheels',  // 0
        'Sunday Driver',    // 1
        'Rookie',           // 2
        'Amateur',          // 3
        'Club Racer',       // 4
        'Semi-Pro',         // 5
        'Pro',              // 6
        'Ace',              // 7
        'Champion',         // 8
        'Elite',            // 9
        'Legend'            // 10
    ],

    lerp(a, b, t) { return a + (b - a) * t; },

    clamp(level) { return Math.max(this.MIN, Math.min(this.MAX, Math.round(level))); },

    // How fast the rivals run, as a fraction of their level-10 pace.
    paceMult(level) { return this.lerp(0.52, 1, level / this.MAX); },

    // Shorter tracks at low levels keep every race roughly 13-15s long even
    // though the rivals are much slower.
    trackLength(level) { return Math.round(this.lerp(3000, 6200, level / this.MAX)); },

    // How quickly your speed bleeds away between taps. The single biggest
    // factor in how forgiving a slow tapper finds the game.
    decayMult(level) { return this.lerp(0.38, 1, level / this.MAX); },

    // The speed you coast down to if you stop tapping entirely. Kept close to
    // the rivals' pace at low levels so a beginner is never hopelessly adrift.
    minSpeed(level) { return Math.round(this.lerp(200, 150, level / this.MAX)); },

    // Size of the tap box in CSS pixels. A big box is both easier to hit and
    // easier to spot. The viewport cap keeps it from swallowing a phone screen
    // at low levels; the floor keeps it comfortably above a thumb's width.
    targetSize(level, view) {
        const base = this.lerp(148, 78, level / this.MAX);
        const cap = Math.min(view.width, view.height) * 0.32;
        return Math.round(Math.max(64, Math.min(base, cap)));
    },

    // How far the next box lands from the last one, as a fraction of the playable
    // area's diagonal. Both ends matter: the minimum stops the box reappearing
    // under your thumb, and the maximum is what actually makes low levels gentle
    // — at level 0 it only drifts a short hop, so your hand stays put. Past
    // level ~8 the maximum exceeds the diagonal, meaning "anywhere".
    travelSpread(level) { return this.lerp(0.06, 0.62, level / this.MAX); },
    travelReach(level)  { return this.lerp(0.20, 1.45, level / this.MAX); },

    // Player-facing shorthand for the two levers above, for the select screen.
    targetLabel(level) {
        const size = level <= 2 ? 'huge' : level <= 5 ? 'big' : level <= 8 ? 'small' : 'tiny';
        const move = level <= 2 ? 'short hops' : level <= 5 ? 'drifts' : level <= 8 ? 'jumps' : 'jumps anywhere';
        return `${size} box · ${move}`;
    },

    name(level) { return this.NAMES[this.clamp(level)]; },

    // Green through yellow to red as the level climbs.
    color(level) { return `hsl(${Math.round(this.lerp(142, 0, level / this.MAX))}, 78%, 58%)`; },

    load() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved !== null) return this.clamp(parseInt(saved, 10));
        } catch (e) { /* file:// with storage blocked — just use the default */ }
        return this.DEFAULT;
    },

    save(level) {
        try { localStorage.setItem(this.STORAGE_KEY, String(level)); } catch (e) { /* ignore */ }
    }
};
