// Shared side-view car drawing, used by both the player and the AI cars.
const CarSprite = {
    LENGTH: 92,
    HEIGHT: 30,

    draw(ctx, x, y, colors, opts = {}) {
        const L = this.LENGTH;
        const H = this.HEIGHT;
        const left = x - L / 2;
        const topY = y - H / 2;
        const wheelR = 11;
        const speedRatio = opts.speedRatio || 0;

        ctx.save();

        // Shadow on the asphalt.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.beginPath();
        ctx.ellipse(x, y + H / 2 + 8, L * 0.5, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Speed streaks trailing behind at high speed.
        if (speedRatio > 0.35) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.14 + speedRatio * 0.3})`;
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const ly = topY + 6 + i * 9;
                const len = 26 + speedRatio * 60 + i * 8;
                ctx.beginPath();
                ctx.moveTo(left - 8, ly);
                ctx.lineTo(left - 8 - len, ly);
                ctx.stroke();
            }
        }

        // Wheels.
        ctx.fillStyle = '#15161a';
        for (const wx of [left + 22, left + L - 22]) {
            ctx.beginPath();
            ctx.arc(wx, y + H / 2, wheelR, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#9aa3b2';
        for (const wx of [left + 22, left + L - 22]) {
            ctx.beginPath();
            ctx.arc(wx, y + H / 2, wheelR * 0.42, 0, Math.PI * 2);
            ctx.fill();
        }

        // Body: wedge shape, nose pointing right (direction of travel).
        ctx.beginPath();
        ctx.moveTo(left, topY + H * 0.55);
        ctx.lineTo(left + 8, topY + H * 0.18);
        ctx.lineTo(left + L * 0.62, topY + H * 0.10);
        ctx.lineTo(left + L - 6, topY + H * 0.45);
        ctx.lineTo(left + L, topY + H * 0.72);
        ctx.lineTo(left + L, topY + H);
        ctx.lineTo(left, topY + H);
        ctx.closePath();
        const body = ctx.createLinearGradient(0, topY, 0, topY + H);
        body.addColorStop(0, colors.light);
        body.addColorStop(1, colors.dark);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Cockpit canopy.
        ctx.beginPath();
        ctx.moveTo(left + L * 0.34, topY + H * 0.14);
        ctx.lineTo(left + L * 0.50, topY - H * 0.22);
        ctx.lineTo(left + L * 0.66, topY - H * 0.22);
        ctx.lineTo(left + L * 0.74, topY + H * 0.14);
        ctx.closePath();
        ctx.fillStyle = '#16223c';
        ctx.fill();

        // Rear wing.
        ctx.fillStyle = colors.dark;
        ctx.fillRect(left - 2, topY - H * 0.30, 16, 6);
        ctx.fillRect(left + 4, topY - H * 0.30, 5, H * 0.45);

        // Racing stripe + number.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(left + 10, topY + H * 0.62, L - 24, 4);
        if (opts.number != null) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(opts.number), left + L * 0.24, topY + H * 0.52);
            ctx.textAlign = 'left';
        }

        // "YOU" tag floating above the player's car.
        if (opts.label) {
            ctx.fillStyle = '#ffd24a';
            ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(opts.label, x, topY - H * 0.75);
            ctx.beginPath();
            ctx.moveTo(x - 6, topY - H * 0.60);
            ctx.lineTo(x + 6, topY - H * 0.60);
            ctx.lineTo(x, topY - H * 0.32);
            ctx.closePath();
            ctx.fill();
            ctx.textAlign = 'left';
        }

        ctx.restore();
    }
};
