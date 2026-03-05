// OpernLog Service Worker – Offline Caching
const CACHE_NAME = 'opernlog-v3';

// App shell files to cache for offline use
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './src/main.js',
    './src/config.js',
    './src/pages/Auth.js',
    './src/pages/Community.js',
    './src/pages/Feed.js',
    './src/pages/HouseDetail.js',
    './src/pages/Houses.js',
    './src/pages/Invite.js',
    './src/pages/Lists.js',
    './src/pages/Log.js',
    './src/pages/OperaDetail.js',
    './src/pages/Operas.js',
    './src/pages/Profile.js',
    './src/pages/Diary.js',
    './src/components/ReviewCard.js',
    './src/components/RatingsHistogram.js',
    './src/store/store.js',
    './src/store/supabase.js',
    './src/data/operaHouses.js',
    './src/data/operas.js',
    './src/data/profileIcons.js',
];

// Install – cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell');
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

// Activate – clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch – network-first with cache fallback
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and Supabase/external API calls
    if (event.request.method !== 'GET') return;
    if (url.hostname !== self.location.hostname) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Offline fallback – serve from cache
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // For navigation requests, serve index.html (SPA routing)
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});
