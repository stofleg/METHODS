'use strict';

/* ══ Service Worker QUIZODS — network-first (mise à jour fiable du PWA) ══ */
const CACHE_NAME = "quizods-v21";

self.addEventListener('install', e => { e.waitUntil(self.skipWaiting()); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('quizods-') && k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore.googleapis.com')) return;
  const req = e.request.mode === 'navigate'
    ? new Request(e.request, { cache: 'no-store' })
    : e.request;
  e.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
