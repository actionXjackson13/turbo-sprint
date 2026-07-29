class PlayerCar {
    constructor(lane) {
        this.name = 'You';
        this.lane = lane;
        this.x = 0;
        this.speed = 0;
        this.isPlayer = true;
        this.finishTime = null;
        this.colors = { light: '#5cc8ff', dark: '#1667c4' };
        this.pipColor = '#5cc8ff';
        this.number = 1;
    }

    // Coasts down every frame; boosts come from game.js on a correct key press.
    update(dt) {
        if (this.finishTime !== null) return;
        this.speed = Physics.coast(this.speed, dt);
        this.x += this.speed * dt;
    }

    boost(reaction, streak) {
        const gain = Physics.boostFor(reaction, streak);
        this.speed = Physics.applyBoost(this.speed, gain);
        return gain;
    }

    miss() {
        this.speed = Physics.applyMiss(this.speed);
    }

    draw(ctx, screenX, y) {
        CarSprite.draw(ctx, screenX, y, this.colors, {
            speedRatio: this.speed / Physics.MAX_SPEED,
            number: this.number,
            label: 'YOU'
        });
    }
}
