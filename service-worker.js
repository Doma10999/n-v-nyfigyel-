const CACHE_NAME = 'novenyfigyelo-cache-v20261024-pro-1';
const SDK_CACHE = 'novenyfigyelo-sdk-10.12.2';
const SHELL = ['/', '/index.html', '/offline.html', '/app.js?v=20261024.1', '/core.js', '/firebase-app.js', '/assets/visuals.js', '/assets/app-icon.svg', '/styles.css?v=20261024.1', '/service-worker-register.js?v=20261024.1', '/manifest.json', '/pwa-icon-192.png', '/pwa-icon-512.png', '/pwa-maskable-512.png', '/push-client.js?v=20261024.1'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(async()=>{
    // Cache the three pinned SDK modules on the first online visit, even before this worker controls the page.
    const sdk=await caches.open(SDK_CACHE);
    await Promise.allSettled(['firebase-app.js','firebase-auth.js','firebase-database.js'].map(file=>sdk.add('https://www.gstatic.com/firebasejs/10.12.2/'+file)));
    if(!self.registration.active) return self.skipWaiting();
  }));
});
self.addEventListener('message',event=>{ if(event.data?.type==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('novenyfigyelo-cache-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
async function navigation(request) {
  const url=new URL(request.url);
  if(url.pathname==='/' || url.pathname==='/index.html') {
    const cache=await caches.open(CACHE_NAME), shell=await cache.match('/index.html');
    // Keep HTML and scripts from the same release until the user accepts a complete update.
    if(shell)return shell;
  }
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),4500);
  try { const response=await fetch(request,{signal:controller.signal}); if(response.ok) return response; const cache=await caches.open(CACHE_NAME); return await cache.match('/index.html') || response; }
  catch { const cache=await caches.open(CACHE_NAME); return await cache.match('/index.html') || await cache.match('/offline.html'); }
  finally{ clearTimeout(timer); }
}
async function immutableSdk(request) {
  const cache=await caches.open(SDK_CACHE), cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok && /javascript/.test(response.headers.get('content-type')||'')) await cache.put(request,response.clone());
  return response;
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET')return;
  // Never intercept Firebase data, auth, Stripe, notification APIs, or arbitrary external requests.
  if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/10.12.2/')){event.respondWith(immutableSdk(request));return;}
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){event.respondWith(navigation(request));return;}
  const known=SHELL.some(path=>new URL(path,self.location.origin).pathname===url.pathname);
  if(!known)return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache=>{
    const cached=await cache.match(request,{ignoreSearch:true});
    // This cache contains one atomic application shell; don't mix versions while editing/updating.
    if(cached)return cached;
    return fetch(request);
  }));
});
function safeAppUrl(raw) {
  try {const url=new URL(raw||'/',self.location.origin);if(url.origin===self.location.origin)return url.href;}catch{}
  return new URL('/',self.location.origin).href;
}
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{data={body:event.data?.text()||'Új értesítés érkezett.'};}
  event.waitUntil(self.registration.showNotification(data.title||'Növényfigyelő',{
    body:data.body||'Nézz rá a növényeidre.',icon:'/pwa-icon-192.png',badge:'/pwa-icon-192.png',
    tag:data.tag||'novenyfigyelo',renotify:true,vibrate:[100,60,100],timestamp:Number(data.timestamp)||Date.now(),
    requireInteraction:data.type==='battery_critical',data:{url:safeAppUrl(data.url),type:data.type||'general'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const url=safeAppUrl(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const existing=clients.find(c=>new URL(c.url).origin===self.location.origin);
    if(existing){if(existing.url!==url&&existing.navigate)await existing.navigate(url);return existing.focus();}
    return self.clients.openWindow(url);
  }));
});
