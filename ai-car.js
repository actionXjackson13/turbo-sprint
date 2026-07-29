class AICar {
    constructor(config) {
        this.name = config.name;
        this.lane = config.lane;
        this.x = 0;
        this.baseSpeed = config.baseSpeed;
        this.surgeAmp = config.surgeAmp;
        this.surgeFreq = config.surgeFreq;
        this.phase = Math.random() * Math.PI * 2;
        this.speed = config.baseSpeed;
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
// Pace is tuned so a relaxed tap rate (~500ms) is a photo finish and a brisk
// one (~350ms) wins clearly. See the balance notes in README.md.
AICar.ROSTER = [
    { name: 'Blaze',   lane: 0, baseSpeed: 405, surgeAmp: 40, surgeFreq: 0.55, number: 7,  colors: { light: '#ff7d6b', dark: '#c02a1c' } },
    { name: 'Vortex',  lane: 2, baseSpeed: 425, surgeAmp: 55, surgeFreq: 0.85, number: 12, colors: { light: '#a97dff', dark: '#5a2ec0' } },
    { name: 'Comet',   lane: 3, baseSpeed: 415, surgeAmp: 30, surgeFreq: 0.35, number: 4,  colors: { light: '#7dffb0', dark: '#1f9a55' } }
];
