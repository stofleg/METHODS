'use strict';

const CACHE_NAME = 'blackscrab-v108';
const BASE  = new URL('.', self.location).href;
const ROOT  = new URL('..', self.location).href;

const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'app.js',
  BASE + 'dict.js',
  BASE + 'data.js',
  BASE + 'manifest.json',
  ROOT + 'ods_data.js',
  ROOT + 'icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('blackscrab-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage('update'))))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
