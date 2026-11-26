/* DealCraft service worker — cache the app shell + already-loaded job records for offline viewing. */
var CACHE='dealcraft-v1';
var SHELL=['./','index.html','style.css','app.js','worker.html','passport.html','manifest.json','icon.svg'];
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
  // Job records: network first, fall back to the cached copy so an already-loaded job stays viewable offline.
  if(url.pathname.indexOf('/api/jobs/')===0){
    e.respondWith(fetch(e.request).then(function(res){
      if(res.ok){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy);});}
      return res;
    }).catch(function(){return caches.match(e.request);}));
    return;
  }
  // App shell + static: cache first, refresh in background.
  e.respondWith(caches.match(e.request).then(function(hit){
    var net=fetch(e.request).then(function(res){
      if(res.ok&&url.pathname.indexOf('/api/')!==0){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy);});}
      return res;
    }).catch(function(){return hit;});
    return hit||net;
  }));
});
