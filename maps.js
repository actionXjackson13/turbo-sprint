// Tracks the player can race on. Each map is a visual theme plus two gameplay
// modifiers: how long the track is and how fast speed bleeds away. Rival pace
// is deliberately NOT touched here — difficulty owns that, so a level means the
// same kind of challenge everywhere and only the character of the race changes.
const Maps = {
    DEFAULT: 'speedway',
    STORAGE_KEY: 'turboSprint.map',

    LIST: [
        {
            id: 'speedway',
            name: 'Sunset Speedway',
            blurb: 'The classic circuit. Balanced start to finish.',
            icon: '🏁',
            lengthMult: 1.0,
            decayMult: 1.0,
            scenery: 'grandstand',
            palette: {
                skyTop: '#1b3a6b', skyMid: '#3f78bd', skyLow: '#8ec3e8',
                hillFar: '#2b4f7a', hillNear: '#35618f',
                groundTop: '#2f6b34', groundBot: '#1d4522',
                roadTop: '#4a4f57', roadMid: '#3c4149', roadBot: '#31353c',
                lane: 'rgba(255,255,255,0.55)',
                rumbleA: '#e8e8e8', rumbleB: '#cf3d3d',
                structure: '#20304d', structureTop: '#16233a',
                barrier: '#dfe6f2', barrierAccent: '#c23b3b',
                marker: '#b9c7e2'
            }
        },
        {
            id: 'neon',
            name: 'Neon City',
            blurb: 'A short downtown sprint. Blink and it is over.',
            icon: '🌃',
            lengthMult: 0.78,
            decayMult: 1.0,
            scenery: 'city',
            palette: {
                skyTop: '#0a0620', skyMid: '#2a1055', skyLow: '#7b2a8c',
                hillFar: '#160a35', hillNear: '#241050',
                groundTop: '#1c1040', groundBot: '#0d0722',
                roadTop: '#2b2740', roadMid: '#232036', roadBot: '#1b1a2c',
                lane: 'rgba(120,240,255,0.65)',
                rumbleA: '#00e5ff', rumbleB: '#ff2d95',
                structure: '#140a2e', structureTop: '#0a0520',
                barrier: '#2de2ff', barrierAccent: '#ff2d95',
                marker: '#8ff5ff'
            }
        },
        {
            id: 'desert',
            name: 'Desert Dash',
            blurb: 'A long haul. Pace yourself or fade in the heat.',
            icon: '🏜️',
            lengthMult: 1.3,
            decayMult: 0.92,
            scenery: 'dunes',
            palette: {
                skyTop: '#7a3b12', skyMid: '#d9762c', skyLow: '#f6c177',
                hillFar: '#a75c2a', hillNear: '#c47a3d',
                groundTop: '#d9a566', groundBot: '#a97742',
                roadTop: '#6b6156', roadMid: '#5a5148', roadBot: '#48413a',
                lane: 'rgba(255,246,220,0.6)',
                rumbleA: '#f4e3c1', rumbleB: '#b5502a',
                structure: '#8a5a30', structureTop: '#6d4523',
                barrier: '#f0dfc0', barrierAccent: '#b5502a',
                marker: '#ffe9c2'
            }
        },
        {
            id: 'alpine',
            name: 'Alpine Pass',
            blurb: 'Cold asphalt. Your speed drains faster up here.',
            icon: '🏔️',
            lengthMult: 1.0,
            decayMult: 1.18,
            scenery: 'pines',
            palette: {
                skyTop: '#25406b', skyMid: '#6d9ac4', skyLow: '#cfe4f2',
                hillFar: '#8fa8c4', hillNear: '#b3c8dd',
                groundTop: '#e8f1f7', groundBot: '#c2d4e2',
                roadTop: '#5a6068', roadMid: '#4a505a', roadBot: '#3b414a',
                lane: 'rgba(255,255,255,0.7)',
                rumbleA: '#ffffff', rumbleB: '#3d6fa8',
                structure: '#2f4a3a', structureTop: '#22382b',
                barrier: '#ffffff', barrierAccent: '#3d6fa8',
                marker: '#e4f0fa'
            }
        }
    ],

    byId(id) {
        return this.LIST.find(m => m.id === id) || this.LIST[0];
    },

    load() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved && this.LIST.some(m => m.id === saved)) return saved;
        } catch (e) { /* storage blocked on file:// — fall through */ }
        return this.DEFAULT;
    },

    save(id) {
        try { localStorage.setItem(this.STORAGE_KEY, id); } catch (e) { /* ignore */ }
    }
};
