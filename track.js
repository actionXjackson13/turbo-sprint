// The track is a long straight strip in world coordinates. The camera scrolls
// horizontally; cars only ever move along X, never between lanes. All colours
// come from the active map's palette so a theme swap needs no code changes.
const Track = {
    LENGTH: 6200,   // world px from start to finish; set per map + difficulty
    LANES: 4,
    theme: null,    // the Maps entry currently being raced

    setTheme(map) { this.theme = map; },
    pal() { return this.theme.palette; },

    // Vertical band of the screen occupied by the asphalt. A full multiplayer grid
    // needs a wider road, or the lanes get thinner than the cars are tall.
    bandTop(view)    { return view.height * (this.LANES > 4 ? 0.40 : 0.50); },
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
        const top = this.bandTop(view);
        const bottom = this.bandBottom(view);
        const p = this.pal();

        this.drawSky(ctx, view, top);
        this.drawHills(ctx, view, camera, top);
        this.drawScenery(ctx, view, camera, top);
        this.drawAsphalt(ctx, view, camera, top, bottom);
        this.drawMarkers(ctx, view, camera, top);
        this.drawStartAndFinish(ctx, view, camera, top, bottom);

        const grass = ctx.createLinearGradient(0, bottom, 0, view.height);
        grass.addColorStop(0, p.groundTop);
        grass.addColorStop(1, p.groundBot);
        ctx.fillStyle = grass;
        ctx.fillRect(0, bottom, view.width, view.height - bottom);
    },

    drawSky(ctx, view, horizon) {
        const p = this.pal();
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, p.skyTop);
        sky.addColorStop(0.55, p.skyMid);
        sky.addColorStop(1, p.skyLow);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, view.width, horizon);

        // Stars for the night theme.
        if (this.theme.scenery === 'city') {
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            for (let i = 0; i < 70; i++) {
                const x = this.noise(i * 3.7) * view.width;
                const y = this.noise(i * 9.1) * horizon * 0.6;
                ctx.fillRect(x, y, 2, 2);
            }
        }
    },

    drawHills(ctx, view, camera, horizon) {
        const p = this.pal();
        const layers = [
            { factor: 0.12, height: 120, color: p.hillFar, spacing: 520 },
            { factor: 0.26, height: 84, color: p.hillNear, spacing: 380 }
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

    drawScenery(ctx, view, camera, horizon) {
        switch (this.theme.scenery) {
            case 'city':  this.drawCity(ctx, view, camera, horizon); break;
            case 'dunes': this.drawDunes(ctx, view, camera, horizon); break;
            case 'pines': this.drawPines(ctx, view, camera, horizon); break;
            default:      this.drawGrandstand(ctx, view, camera, horizon);
        }
        this.drawBarrier(ctx, view, camera, horizon);
    },

    drawGrandstand(ctx, view, camera, horizon) {
        const p = this.pal();
        const offset = camera * 0.45;
        const spacing = 260;
        const standH = 78;
        const y = horizon - standH;
        const start = Math.floor(offset / spacing) - 1;

        for (let i = start; i < start + Math.ceil(view.width / spacing) + 2; i++) {
            const x = i * spacing - offset;
            ctx.fillStyle = p.structure;
            ctx.fillRect(x, y, spacing - 8, standH);
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 14; col++) {
                    const n = this.noise(i * 97 + row * 13 + col);
                    if (n < 0.22) continue;
                    const hue = Math.floor(this.noise(i * 31 + row * 7 + col) * 360);
                    ctx.fillStyle = `hsl(${hue}, 55%, ${52 + row * 4}%)`;
                    ctx.fillRect(x + 8 + col * 17, y + 10 + row * 16, 7, 8);
                }
            }
            ctx.fillStyle = p.structureTop;
            ctx.fillRect(x, y, spacing - 8, 9);
        }
    },

    drawCity(ctx, view, camera, horizon) {
        const p = this.pal();
        const offset = camera * 0.4;
        const spacing = 120;
        const start = Math.floor(offset / spacing) - 1;

        for (let i = start; i < start + Math.ceil(view.width / spacing) + 3; i++) {
            const x = i * spacing - offset;
            const h = 70 + this.noise(i * 5.5) * 150;
            const w = spacing - 16;
            ctx.fillStyle = p.structure;
            ctx.fillRect(x, horizon - h, w, h);

            // Lit windows.
            for (let row = 0; row * 16 < h - 14; row++) {
                for (let col = 0; col < Math.floor(w / 16); col++) {
                    const n = this.noise(i * 61 + row * 17 + col * 3);
                    if (n < 0.55) continue;
                    ctx.fillStyle = n > 0.85 ? '#8ff5ff' : '#ffd98a';
                    ctx.fillRect(x + 6 + col * 16, horizon - h + 8 + row * 16, 6, 8);
                }
            }
            // Rooftop aircraft light.
            if (this.noise(i * 13.3) > 0.7) {
                ctx.fillStyle = '#ff2d95';
                ctx.fillRect(x + w / 2 - 2, horizon - h - 6, 4, 6);
            }
        }
    },

    drawDunes(ctx, view, camera, horizon) {
        const p = this.pal();
        const offset = camera * 0.4;
        const spacing = 200;
        const start = Math.floor(offset / spacing) - 1;

        for (let i = start; i < start + Math.ceil(view.width / spacing) + 3; i++) {
            const x = i * spacing - offset;
            // Cactus.
            if (this.noise(i * 7.1) > 0.45) {
                const h = 34 + this.noise(i * 2.3) * 30;
                ctx.fillStyle = p.structure;
                ctx.fillRect(x, horizon - h, 9, h);
                ctx.fillRect(x - 10, horizon - h * 0.72, 10, 7);
                ctx.fillRect(x - 10, horizon - h * 0.72, 7, 20);
                ctx.fillRect(x + 9, horizon - h * 0.55, 10, 7);
                ctx.fillRect(x + 12, horizon - h * 0.55, 7, 16);
            }
            // Rock.
            if (this.noise(i * 3.9) > 0.65) {
                const rx = x + 90, rh = 14 + this.noise(i * 8.8) * 16;
                ctx.fillStyle = p.structureTop;
                ctx.beginPath();
                ctx.ellipse(rx, horizon - rh / 2, rh * 1.3, rh, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    drawPines(ctx, view, camera, horizon) {
        const p = this.pal();
        const offset = camera * 0.42;
        const spacing = 96;
        const start = Math.floor(offset / spacing) - 1;

        for (let i = start; i < start + Math.ceil(view.width / spacing) + 3; i++) {
            const x = i * spacing - offset;
            const h = 56 + this.noise(i * 4.4) * 54;
            ctx.fillStyle = '#4a3524';
            ctx.fillRect(x + 8, horizon - 12, 6, 12);
            ctx.fillStyle = p.structure;
            for (let tier = 0; tier < 3; tier++) {
                const ty = horizon - 12 - (h / 3) * tier;
                const tw = 30 - tier * 7;
                ctx.beginPath();
                ctx.moveTo(x + 11, ty - h / 2.2);
                ctx.lineTo(x + 11 - tw / 2, ty);
                ctx.lineTo(x + 11 + tw / 2, ty);
                ctx.closePath();
                ctx.fill();
            }
            // Snow caps.
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.moveTo(x + 11, horizon - 12 - (h / 3) * 2 - h / 2.2);
            ctx.lineTo(x + 5, horizon - 12 - (h / 3) * 2 - h / 3.4);
            ctx.lineTo(x + 17, horizon - 12 - (h / 3) * 2 - h / 3.4);
            ctx.closePath();
            ctx.fill();
        }
    },

    drawBarrier(ctx, view, camera, horizon) {
        const p = this.pal();
        ctx.fillStyle = p.barrier;
        ctx.fillRect(0, horizon - 16, view.width, 16);
        ctx.fillStyle = p.barrierAccent;
        const bOff = camera * 0.7;
        const bStart = Math.floor(bOff / 90) - 1;
        for (let i = bStart; i < bStart + Math.ceil(view.width / 90) + 2; i++) {
            ctx.fillRect(i * 90 - bOff, horizon - 16, 45, 16);
        }
    },

    drawAsphalt(ctx, view, camera, top, bottom) {
        const p = this.pal();
        const road = ctx.createLinearGradient(0, top, 0, bottom);
        road.addColorStop(0, p.roadTop);
        road.addColorStop(0.5, p.roadMid);
        road.addColorStop(1, p.roadBot);
        ctx.fillStyle = road;
        ctx.fillRect(0, top, view.width, bottom - top);

        const stripe = 60;
        const off = camera % (stripe * 2);
        for (let x = -off; x < view.width + stripe * 2; x += stripe * 2) {
            ctx.fillStyle = p.rumbleA;
            ctx.fillRect(x, top, stripe, 10);
            ctx.fillRect(x + stripe, bottom - 10, stripe, 10);
            ctx.fillStyle = p.rumbleB;
            ctx.fillRect(x + stripe, top, stripe, 10);
            ctx.fillRect(x, bottom - 10, stripe, 10);
        }

        ctx.strokeStyle = p.lane;
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
        const p = this.pal();
        const step = this.LENGTH > 5000 ? 1000 : 500;
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        for (let d = 0; d <= this.LENGTH; d += step) {
            const x = d - camera;
            if (x < -60 || x > view.width + 60) continue;
            const remaining = Math.round(this.LENGTH - d);
            ctx.fillStyle = p.barrier;
            ctx.fillRect(x - 2, top - 46, 4, 30);
            ctx.fillStyle = 'rgba(10, 16, 34, 0.85)';
            ctx.fillRect(x - 28, top - 66, 56, 20);
            ctx.fillStyle = remaining === 0 ? '#ffd24a' : p.marker;
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
