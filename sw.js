// Offline support for the installed app. Once the home-screen icon has been
// launched one time, the game runs with no network at all — which is the whole
// point of installing it rather than bookmarking it.
//
// CACHE is a purge knob, not a release knob: bump it to throw away everything
// and re-download. Ordinary updates don't need it, because of the
// stale-while-revalidate policy below.
const CACHE = 'turbo-sprint-v2';

const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './maps.js',
    './records.js',
    './audio.js',
    './particles.js',
    './difficulty.js',
    './physics.js',
    './track.js',
    './car-sprite.js',
    './input.js',
    './target.js',
    './bonus-target.js',
    './player.js',
    './ai-car.js',
    './net.js',
    './remote-car.js',
    './game.js',
    './manifest.webmanifest',
    './icons/apple-touch-icon.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Stale-while-revalidate: serve the cached copy immediately so the game starts
// instantly and works offline, while quietly refreshing it in the background so
// the next launch picks up any new build. No version bump needed to ship.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req, { ignoreSearch: true });

        const fetching = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
        });

        if (cached) {
            event.waitUntil(fetching.catch(() => { /* offline; the cache already answered */ }));
            return cached;
        }

        try {
            return await fetching;
        } catch (err) {
            // Offline and never cached: a page load can still fall back to the shell.
            if (req.mode === 'navigate') {
                const shell = await cache.match('./index.html');
                if (shell) return shell;
            }
            throw err;
        }
    })());
});
