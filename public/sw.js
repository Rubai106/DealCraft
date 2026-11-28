/* DealCraft service worker — cache the app shell for offline viewing. API responses are never cached. */
var CACHE='dealcraft-v3';
/* Fonts are NOT in SHELL: public/fonts/ is not shipped with the app
   (the self-hosted woff2 files are deployed separately), and
   cache.addAll fails ATOMICALLY — one missing file left the whole shell
   uncached and offline broken. Fonts runtime-cache through the fetch
   handler below the first time the page loads them. */
var SHELL=['./','index.html','style.css','ux-overhaul.css','fonts.css','app.js','worker.html','passport.html','verify.html','trip.html','manifest.json','icon.svg'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL);}).then(function(){return self.skipWaiting();}).catch(function(){}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  // API responses are never cached (network-only): a cached record would
  // show stale job state — and another visitor's data after logout.
  // Not intercepting the request is the network-only behaviour.
  if(url.pathname.indexOf('/api/')===0)return;
  // App shell + static: cache first, refresh in background.
  e.respondWith(caches.match(e.request).then(function(hit){
    var net=fetch(e.request).then(function(res){
      if(res.ok){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy);});}
      return res;
    }).catch(function(){return hit;});
    return hit||net;
  }));
});
