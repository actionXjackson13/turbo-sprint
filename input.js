// Raw keyboard plumbing. The game decides what a key press means; this just
// reports single presses (auto-repeat from a held key is ignored, so mashing
// is the only way to go fast).
const InputHandler = {
    init(handler) {
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (this.isTyping(e.target)) return;   // menu shortcuts must not fire mid-word
            const name = this.normalize(e);
            if (!name) return;
            if (name === 'SPACE' || name === 'ENTER') e.preventDefault();
            handler(name);
        });
    },

    // The name and game-code fields are real text inputs, so 'M' in a name can't
    // be allowed to mean "mute".
    isTyping(target) {
        if (!target || !target.tagName) return false;
        const tag = target.tagName.toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
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
