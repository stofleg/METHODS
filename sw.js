/* ══ Service Worker METHODS — stratégie network-first ══
   Refresh = toujours la dernière version (réseau en priorité).
   Le cache sert uniquement de fallback si l'appareil est hors-ligne.
   Aucune manipulation manuelle de cache nécessaire.
*/
const CACHE_NAME = "methods-cache";

self.addEventListener("install", e => {
  // Prendre le contrôle immédiatement sans attendre le rechargement
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", e => {
  // Supprimer tout ancien cache methods-* au cas où l'ancien SW était cache-first
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("methods-")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch : network-first ── */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Laisser passer Firebase sans interception
  if (e.request.url.includes("firestore.googleapis.com")) return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Mettre à jour le cache avec la réponse fraîche
        if (resp && resp.status === 200 && resp.type !== "opaque") {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request)) // fallback offline
  );
});
