// Raw keyboard plumbing. The game decides what a key press means; this just
// reports single presses (auto-repeat from a held key is ignored, so mashing
// is the only way to go fast).
const InputHandler = {
    handler: null,

    init(handler) {
        this.handler = handler;
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
            if (key === ' ' || key === 'Enter') e.preventDefault();
            this.handler(key === ' ' ? 'SPACE' : key.toUpperCase());
        });
    }
};
