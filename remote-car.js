// Another player's car. Unlike PlayerCar and AICar it isn't simulated — its
// position comes off the network. Updates arrive ~15 times a second, so between
// them the car keeps rolling at its last reported speed and eases toward the
// authoritative position instead of snapping to it.
class RemoteCar {
    constructor(entry) {
        this.id = entry.id;
        this.name = entry.name;
        this.lane = entry.lane;
        this.colors = entry.colors;
        this.pipColor = entry.colors.light;
        this.number = entry.lane + 1;
        this.isPlayer = false;
        this.isRemote = true;

        this.x = 0;
        this.speed = 0;
        this.finishTime = null;
        this.net = entry;      // live record that Net keeps updating
    }

    update(dt) {
        const targetX = this.net.x || 0;
        this.speed = this.net.speed || 0;
        this.finishTime = this.net.finishTime;

        // Dead reckon forward, then close the gap to where the network says we
        // are. A hard snap on every packet looks like stuttering.
        this.x += this.speed * dt;
        const gap = targetX - this.x;
        this.x += gap * Math.min(1, dt * 9);

        // A big gap means a stall or a hiccup, not jitter — just go there.
        if (Math.abs(gap) > 320) this.x = targetX;
    }

    draw(ctx, screenX, y) {
        CarSprite.draw(ctx, screenX, y, this.colors, {
            speedRatio: this.speed / Physics.MAX_SPEED,
            number: this.number,
            label: this.name.slice(0, 8).toUpperCase()
        });
    }
}
