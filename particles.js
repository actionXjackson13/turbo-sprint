// Lightweight particle layer drawn on the canvas: exhaust puffs on a good tap,
// sparks on a miss, and confetti when you win.
const Particles = {
    items: [],

    spawn(count, make) {
        for (let i = 0; i < count; i++) this.items.push(make());
    },

    boost(x, y, strength) {
        this.spawn(3 + Math.round(strength * 4), () => ({
            x: x - 46, y: y + 6 + (Math.random() - 0.5) * 10,
            vx: -110 - Math.random() * 130, vy: (Math.random() - 0.5) * 40,
            life: 0.45, max: 0.45, size: 3 + Math.random() * 4,
            color: '255,255,255', shape: 'puff'
        }));
    },

    miss(x, y) {
        this.spawn(10, () => ({
            x, y,
            vx: (Math.random() - 0.5) * 320, vy: (Math.random() - 0.5) * 260,
            life: 0.4, max: 0.4, size: 2 + Math.random() * 3,
            color: '255,110,110', shape: 'spark'
        }));
    },

    confetti(width, height) {
        const colors = ['255,210,74', '109,255,143', '92,200,255', '255,125,180', '169,125,255'];
        this.spawn(90, () => ({
            x: Math.random() * width, y: -20 - Math.random() * height * 0.5,
            vx: (Math.random() - 0.5) * 90, vy: 120 + Math.random() * 220,
            life: 2.6, max: 2.6, size: 4 + Math.random() * 5,
            spin: (Math.random() - 0.5) * 12, angle: Math.random() * Math.PI,
            color: colors[Math.floor(Math.random() * colors.length)], shape: 'confetti'
        }));
    },

    update(dt) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const p = this.items[i];
            p.life -= dt;
            if (p.life <= 0) { this.items.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.shape === 'confetti') {
                p.vy += 90 * dt;             // gravity
                p.angle += p.spin * dt;
            } else {
                p.vx *= 0.94;
                p.vy *= 0.94;
            }
        }
    },

    draw(ctx, cameraShiftX) {
        for (const p of this.items) {
            const alpha = Math.max(0, p.life / p.max);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgb(${p.color})`;
            const x = p.shape === 'confetti' ? p.x : p.x - cameraShiftX;
            if (p.shape === 'confetti') {
                ctx.save();
                ctx.translate(x, p.y);
                ctx.rotate(p.angle);
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    },

    clear() { this.items.length = 0; }
};
