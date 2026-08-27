// OpernLog Service Worker – Offline Caching
const CACHE_NAME = 'opernlog-v43';

// Getrennter Cache für Bilder: er überlebt eine Versionserhöhung der App-Shell,
// damit ein Code-Update nicht 175 mühsam geladene Bilder wegwirft.
const IMAGE_CACHE = 'opernlog-images-v1';

// Sämtliche Opern- und Hausbilder liegen bei Wikimedia. Ohne diese Ausnahme
// überspringt der Fetch-Handler sie als fremden Host – die installierte PWA
// zeigte den Katalog offline dann als leere Karten.
const IMAGE_HOSTS = ['upload.wikimedia.org'];

// Obergrenze, damit der Cache nicht unbegrenzt wächst. Bilder von fremden
// Hosts kommen als opaque Responses und zählen beim Speicherkontingent
// großzügig gepolstert – deshalb eher knapp bemessen.
const IMAGE_CACHE_LIMIT = 220;

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
    './src/pages/Home.js',
    './src/pages/HouseDetail.js',
    './src/pages/Houses.js',
    './src/pages/Invite.js',
    './src/pages/Lists.js',
    './src/pages/ListDetail.js',
    './src/pages/LogVisit.js',
    './src/pages/OperaDetail.js',
    './src/pages/Operas.js',
    './src/pages/Profile.js',
    './src/pages/ProfileSetup.js',
    './src/pages/Diary.js',
    './src/pages/VisitDetail.js',
    './src/pages/Wishlist.js',
    './src/components/Navigation.js',
    './src/components/ReviewCard.js',
    './src/components/RatingsHistogram.js',
    './src/components/StarRating.js',
    './src/store/store.js',
    './src/store/supabase.js',
    './src/data/operaHouses.js',
    './src/data/operas.js',
    './src/data/profileIcons.js',
    './src/data/brandMark.js',
    './src/utils.js',
];

// Install – cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell');
            return cache.addAll(APP_SHELL);
        }).catch((err) => {
            console.error('[SW] Failed to cache app shell:', err);
        })
    );
    self.skipWaiting();
});

// Activate – clean up old caches (der Bild-Cache bleibt bewusst stehen)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME && key !== IMAGE_CACHE)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Ältestes zuerst entfernen, wenn die Obergrenze überschritten ist
async function trimCache(cacheName, limit) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - limit; i++) {
        await cache.delete(keys[i]);
    }
}

// Bilder: erst der Cache, dann das Netz. Sie ändern sich nicht, also ist der
// zwischengespeicherte Stand immer richtig – und offline überhaupt der einzige.
async function serveImage(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        // Fremde Bilder kommen als opaque Response (status 0). Die lässt sich
        // nicht auf ok prüfen, aber sehr wohl speichern und später ausliefern.
        if (response && (response.ok || response.type === 'opaque')) {
            await cache.put(request, response.clone());
            trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT);
        }
        return response;
    } catch (e) {
        // Kein Netz und nichts im Cache: die Bild-Ebene malt dann nichts und
        // der farbige Verlauf darunter wird sichtbar (siehe coverBackground).
        return Response.error();
    }
}

// Fetch – network-first with cache fallback
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and Supabase/external API calls
    if (event.request.method !== 'GET') return;

    if (IMAGE_HOSTS.includes(url.hostname)) {
        event.respondWith(serveImage(event.request));
        return;
    }

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
