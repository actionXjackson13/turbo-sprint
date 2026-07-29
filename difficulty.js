// Difficulty 0-10. Level 10 is the reference tuning everything scales down from:
// the smallest and furthest-jumping tap target on the longest track. Lower levels
// pull every lever at once so the drop in challenge is felt immediately rather
// than being buried in one number.
//
// The rivals run the same speed at every level. What a level actually controls is
// how hard it is for *you* to keep up with them.
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

    // Every race is about 8 seconds, so the track only stretches a little as the
    // levels climb. The rivals' speed is NOT a difficulty lever any more — see
    // AICar.ROSTER — because the tap target already sets the pace you have to
    // keep, and stacking faster rivals on top of a meaner box just made the top
    // levels impossible.
    trackLength(level) { return Math.round(this.lerp(3700, 4400, level / this.MAX)); },

    // How quickly your speed bleeds away between taps.
    //
    // Solved by simulation rather than written by hand, which is why it isn't a
    // clean lerp: it peaks in the middle of the scale and eases off at the top.
    // That's deliberate. Past level 6 the box itself is eating so much of your
    // reaction budget that harsh decay on top would push the level past what a
    // thumb can physically do. Difficulty still rises the whole way — see the
    // "demand ratio" table in README.md — it just changes which lever carries it.
    DECAY_BY_LEVEL: [0.12, 0.20, 0.36, 0.51, 0.57, 0.60, 0.61, 0.60, 0.57, 0.53, 0.47],

    decayMult(level) { return this.DECAY_BY_LEVEL[this.clamp(level)]; },

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
