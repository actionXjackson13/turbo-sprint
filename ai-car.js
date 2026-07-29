class AICar {
    // `pace` scales the roster's level-10 speeds down for easier difficulties.
    constructor(config, pace = 1) {
        this.name = config.name;
        this.lane = config.lane;
        this.x = 0;
        this.baseSpeed = config.baseSpeed * pace;
        this.surgeAmp = config.surgeAmp * pace;
        this.surgeFreq = config.surgeFreq;
        this.phase = Math.random() * Math.PI * 2;
        this.speed = this.baseSpeed;
        this.isPlayer = false;
        this.finishTime = null;
        this.colors = config.colors;
        this.pipColor = config.colors.light;
        this.number = config.number;
        this.t = 0;
    }

    // AI cars run a steady pace with a slow surge/fade so the lead changes hands.
    update(dt) {
        if (this.finishTime !== null) return;
        this.t += dt;
        this.speed = this.baseSpeed + Math.sin(this.t * this.surgeFreq + this.phase) * this.surgeAmp;
        this.x += this.speed * dt;
    }

    draw(ctx, screenX, y) {
        CarSprite.draw(ctx, screenX, y, this.colors, {
            speedRatio: this.speed / Physics.MAX_SPEED,
            number: this.number
        });
    }
}

// Three rivals: a steady pacer, a fast-but-streaky one, and a strong closer.
// These speeds apply at *every* difficulty — the rivals always run the same
// pace, and what changes with the level is how hard it is for you to match it
// (box size, box travel, speed decay). See the balance notes in README.md.
//
// Vortex at 611 is the one to beat, so every race is a fight to average ~611
// px/s. That works out to roughly a 7-8 second race.
//
// These sit at ~86% of the player's hard speed cap, which is close to the wall:
// the player's best possible *average* is held down by the cap and by the time
// spent accelerating off the line, so pushing the rivals up another 10% makes
// every level unwinnable at any tap rate. Raise Physics.MAX_SPEED first if these
// need to go up.
AICar.ROSTER = [
    { name: 'Blaze',   lane: 0, baseSpeed: 582, surgeAmp: 58, surgeFreq: 0.55, number: 7,  colors: { light: '#ff7d6b', dark: '#c02a1c' } },
    { name: 'Vortex',  lane: 2, baseSpeed: 611, surgeAmp: 78, surgeFreq: 0.85, number: 12, colors: { light: '#a97dff', dark: '#5a2ec0' } },
    { name: 'Comet',   lane: 3, baseSpeed: 597, surgeAmp: 43, surgeFreq: 0.35, number: 4,  colors: { light: '#7dffb0', dark: '#1f9a55' } }
];
