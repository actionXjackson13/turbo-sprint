// Personal-record times, stored per map + difficulty so every combination has
// its own target to chase. Only completed races count — a DNF never sets a PR.
const Records = {
    STORAGE_KEY: 'turboSprint.records',

    key(mapId, level) { return `${mapId}:${level}`; },

    all() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    },

    get(mapId, level) {
        const value = this.all()[this.key(mapId, level)];
        return typeof value === 'number' ? value : null;
    },

    // Returns { isRecord, previous } so the results screen can celebrate.
    submit(mapId, level, time) {
        const previous = this.get(mapId, level);
        const isRecord = previous === null || time < previous;
        if (isRecord) {
            const data = this.all();
            data[this.key(mapId, level)] = time;
            try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
        }
        return { isRecord, previous };
    },

    // How many levels have a recorded time on this map — drives the map cards.
    countFor(mapId) {
        const data = this.all();
        return Object.keys(data).filter(k => k.startsWith(mapId + ':')).length;
    },

    clear() {
        try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) { /* ignore */ }
    },

    format(seconds) {
        return seconds === null || seconds === undefined ? '—' : seconds.toFixed(2) + 's';
    }
};
