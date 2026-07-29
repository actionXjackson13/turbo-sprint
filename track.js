// The track is a long straight strip in world coordinates. The camera scrolls
// horizontally; cars only ever move along X, never between lanes.
const Track = {
    LENGTH: 6200,   // world px from start line to finish line
    LANES: 4,

    // Vertical band of the screen occupied by the asphalt.
    bandTop(view)    { return view.height * 0.50; },
    bandBottom(view) { return view.height * 0.90; },

    laneY(index, view) {
        const top = this.bandTop(view);
        const h = this.bandBottom(view) - top;
        return top + h * (index + 0.5) / this.LANES;
    },

    // Deterministic pseudo-random in [0,1) so scenery doesn't flicker per frame.
    noise(n) {
        const x = Math.sin(n * 127.1) * 43758.5453;
        return x - Math.floor(x);
    },

    draw(ctx, view, camera) {
        const W = view.width;
        const H = view.height;
        const top = this.bandTop(view);
        const bottom = this.bandBottom(view);

        this.drawSky(ctx, view, top);
        this.drawHills(ctx, view, camera, top);
        this.drawGrandstand(ctx, view, camera, top);
        this.drawAsphalt(ctx, view, camera, top, bottom);
        this.drawMarkers(ctx, view, camera, top);
        this.drawStartAndFinish(ctx, view, camera, top, bottom);

        // Foreground grass strip below the track.
        const grass = ctx.createLinearGradient(0, bottom, 0, H);
        grass.addColorStop(0, '#2f6b34');
        grass.addColorStop(1, '#1d4522');
        ctx.fillStyle = grass;
        ctx.fillRect(0, bottom, W, H - bottom);
    },

    drawSky(ctx, view, horizon) {
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#1b3a6b');
        sky.addColorStop(0.55, '#3f78bd');
        sky.addColorStop(1, '#8ec3e8');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, view.width, horizon);
    },

    drawHills(ctx, view, camera, horizon) {
        const layers = [
            { factor: 0.12, height: 120, color: '#2b4f7a', spacing: 520 },
            { factor: 0.26, height: 84,  color: '#35618f', spacing: 380 }
        ];
        for (const layer of layers) {
            const offset = camera * layer.factor;
            const start = Math.floor(offset / layer.spacing) - 1;
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for (let i = start; i < start + Math.ceil(view.width / layer.spacing) + 3; i++) {
                const x = i * layer.spacing - offset;
                const h = layer.height * (0.6 + this.noise(i) * 0.7);
                ctx.lineTo(x, horizon);
                ctx.lineTo(x + layer.spacing * 0.5, horizon - h);
                ctx.lineTo(x + layer.spacing, horizon);
            }
            ctx.lineTo(view.width, horizon);
            ctx.closePath();
            ctx.fill();
        }
    },

    drawGrandstand(ctx, view, camera, horizon) {
        const offset = camera * 0.45;
        const spacing = 260;
        const standH = 78;
        const y = horizon - standH;
        const start = Math.floor(offset / spacing) - 1;

        for (let i = start; i < start + Math.ceil(view.width / spacing) + 2; i++) {
            const x = i * spacing - offset;

            ctx.fillStyle = '#20304d';
            ctx.fillRect(x, y, spacing - 8, standH);

            // Crowd: rows of little dots in random-ish colours.
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 14; col++) {
                    const n = this.noise(i * 97 + row * 13 + col);
                    if (n < 0.22) continue;
                    const hue = Math.floor(this.noise(i * 31 + row * 7 + col) * 360);
                    ctx.fillStyle = `hsl(${hue}, 55%, ${52 + row * 4}%)`;
                    ctx.fillRect(x + 8 + col * 17, y + 10 + row * 16, 7, 8);
                }
            }

            ctx.fillStyle = '#16233a';
            ctx.fillRect(x, y, spacing - 8, 9);
        }

        // Barrier wall in front of the stands.
        ctx.fillStyle = '#dfe6f2';
        ctx.fillRect(0, horizon - 16, view.width, 16);
        ctx.fillStyle = '#c23b3b';
        const bOff = camera * 0.7;
        const bStart = Math.floor(bOff / 90) - 1;
        for (let i = bStart; i < bStart + Math.ceil(view.width / 90) + 2; i++) {
            ctx.fillRect(i * 90 - bOff, horizon - 16, 45, 16);
        }
    },

    drawAsphalt(ctx, view, camera, top, bottom) {
        const road = ctx.createLinearGradient(0, top, 0, bottom);
        road.addColorStop(0, '#4a4f57');
        road.addColorStop(0.5, '#3c4149');
        road.addColorStop(1, '#31353c');
        ctx.fillStyle = road;
        ctx.fillRect(0, top, view.width, bottom - top);

        // Rumble strips top and bottom.
        const stripe = 60;
        const off = camera % (stripe * 2);
        for (let x = -off; x < view.width + stripe * 2; x += stripe * 2) {
            ctx.fillStyle = '#e8e8e8';
            ctx.fillRect(x, top, stripe, 10);
            ctx.fillRect(x + stripe, bottom - 10, stripe, 10);
            ctx.fillStyle = '#cf3d3d';
            ctx.fillRect(x + stripe, top, stripe, 10);
            ctx.fillRect(x, bottom - 10, stripe, 10);
        }

        // Dashed lane dividers.
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 3;
        ctx.setLineDash([34, 30]);
        ctx.lineDashOffset = camera % 64;
        const h = bottom - top;
        for (let i = 1; i < this.LANES; i++) {
            const y = top + h * i / this.LANES;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(view.width, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    },

    drawMarkers(ctx, view, camera, top) {
        // Distance posts every 500 world px so the sense of speed is readable.
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        for (let d = 0; d <= this.LENGTH; d += 500) {
            const x = d - camera;
            if (x < -60 || x > view.width + 60) continue;
            const remaining = this.LENGTH - d;
            ctx.fillStyle = '#dfe6f2';
            ctx.fillRect(x - 2, top - 46, 4, 30);
            ctx.fillStyle = 'rgba(10, 16, 34, 0.85)';
            ctx.fillRect(x - 26, top - 66, 52, 20);
            ctx.fillStyle = remaining === 0 ? '#ffd24a' : '#b9c7e2';
            ctx.fillText(remaining === 0 ? 'FINISH' : `${remaining}m`, x, top - 51);
        }
        ctx.textAlign = 'left';
    },

    drawStartAndFinish(ctx, view, camera, top, bottom) {
        const cell = 22;
        const rows = Math.ceil((bottom - top) / cell);

        const drawChecker = (worldX) => {
            const x = worldX - camera;
            if (x < -80 || x > view.width + 80) return;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < 3; c++) {
                    ctx.fillStyle = (r + c) % 2 === 0 ? '#f2f2f2' : '#1a1a1a';
                    ctx.fillRect(x + c * cell, top + r * cell, cell, Math.min(cell, bottom - (top + r * cell)));
                }
            }
        };

        drawChecker(0);
        drawChecker(this.LENGTH);

        // Finish banner overhead.
        const fx = this.LENGTH - camera;
        if (fx > -300 && fx < view.width + 300) {
            ctx.fillStyle = '#0f1830';
            ctx.fillRect(fx - 110, top - 118, 250, 42);
            ctx.strokeStyle = '#ffd24a';
            ctx.lineWidth = 3;
            ctx.strokeRect(fx - 110, top - 118, 250, 42);
            ctx.fillStyle = '#ffd24a';
            ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('FINISH', fx + 15, top - 88);
            ctx.textAlign = 'left';
        }
    }
};
