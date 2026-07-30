import '@testing-library/jest-dom/vitest'

// jsdom does not implement matchMedia, which Tailwind-driven components and
// the reduced-motion check may consult.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// crypto.randomUUID is used for guest ids and toast ids; older jsdom builds
// expose `crypto` without it.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () =>
      '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0'),
    configurable: true,
  })
}
