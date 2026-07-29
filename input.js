// Raw keyboard plumbing. The game decides what a key press means; this just
// reports single presses (auto-repeat from a held key is ignored, so mashing
// is the only way to go fast).
const InputHandler = {
    init(handler) {
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const name = this.normalize(e);
            if (!name) return;
            if (name === 'SPACE' || name === 'ENTER') e.preventDefault();
            handler(name);
        });
    },

    // Returns a canonical upper-case name like 'A', '7', 'ENTER', 'ARROWLEFT'.
    // `e.key` is the primary source; `e.code` is a fallback for environments
    // that leave `key` blank on named keys.
    normalize(e) {
        const key = e.key || '';
        if (key === ' ') return 'SPACE';
        if (key) return key.toUpperCase();

        const code = e.code || '';
        if (code === 'Space') return 'SPACE';
        if (code.startsWith('Key')) return code.slice(3).toUpperCase();
        if (code.startsWith('Digit')) return code.slice(5);
        return code.toUpperCase();
    }
};
