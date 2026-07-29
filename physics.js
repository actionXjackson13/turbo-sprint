// Speed model for the tap-to-accelerate mechanic.
// The car always coasts downhill in speed; every correct key press shoves it
// back up. How hard the shove is depends on how fast you reacted.
const Physics = {
    MIN_SPEED_BASE: 150, // px/s floor at difficulty 10
    minSpeed: 150,       // live value; a higher floor at low levels is what
                         // keeps a slow tapper from spiralling out of the race
    MAX_SPEED: 620,      // hard cap on player speed
    DECAY_BASE: 135,     // px/s lost per second at difficulty 10
    decay: 135,          // live value; Difficulty scales it per level

    BOOST_FAST: 112,    // px/s gained for a press inside FAST_TIME
    BOOST_SLOW: 44,     // px/s gained for a press at (or past) SLOW_TIME
    FAST_TIME: 0.25,    // s — anything quicker than this is a "perfect" tap
    SLOW_TIME: 1.20,    // s — beyond this you get the floor boost

    MISS_FACTOR: 0.78,  // speed multiplier when you hit the wrong key
    STREAK_CAP: 12,     // streak length where the bonus maxes out
    STREAK_BONUS: 0.25, // up to +25% boost for a long clean streak

    // Boost for a press that landed `reaction` seconds after the key appeared.
    boostFor(reaction, streak) {
        const t = Math.min(Math.max(reaction, this.FAST_TIME), this.SLOW_TIME);
        const ramp = (t - this.FAST_TIME) / (this.SLOW_TIME - this.FAST_TIME);
        const base = this.BOOST_FAST + (this.BOOST_SLOW - this.BOOST_FAST) * ramp;
        const bonus = 1 + this.STREAK_BONUS * Math.min(streak, this.STREAK_CAP) / this.STREAK_CAP;
        return base * bonus;
    },

    // Rating used for the floating "PERFECT / GREAT / GOOD" popups.
    ratingFor(reaction) {
        if (reaction <= 0.30) return { text: 'PERFECT!', color: '#6dff8f' };
        if (reaction <= 0.55) return { text: 'GREAT',    color: '#ffd24a' };
        if (reaction <= 0.90) return { text: 'GOOD',     color: '#9fd0ff' };
        return { text: 'SLOW', color: '#c3cbdd' };
    },

    coast(speed, dt) {
        return Math.max(this.minSpeed, speed - this.decay * dt);
    },

    applyBoost(speed, boost) {
        return Math.min(this.MAX_SPEED, speed + boost);
    },

    applyMiss(speed) {
        return Math.max(this.minSpeed, speed * this.MISS_FACTOR);
    }
};
