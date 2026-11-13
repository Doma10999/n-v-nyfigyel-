const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(fetchImpl){const handlers={};const cacheData=new Map();const cache={match:async key=>cacheData.get(typeof key==='string'?key:key.url),put:async(key,value)=>cacheData.set(key.url,value)};const self={location:{origin:'https://garden.example'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){}};const context={self,URL,Response,AbortController,setTimeout,clearTimeout,console,caches:{open:async()=>cache,match:cache.match},fetch:fetchImpl};vm.runInNewContext(fs.readFileSync('service-worker.js','utf8'),context);return{handlers,cacheData,context};}
test('Firebase and cross-origin auth never enter service worker cache',()=>{const {handlers}=setup(()=>{throw Error('should not fetch')});let intercepted=false;handlers.fetch({request:{url:'https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app/users.json',method:'GET'},respondWith(){intercepted=true}});assert.equal(intercepted,false);});
test('offline CSS does not get an HTML fallback',async()=>{const {handlers,cacheData}=setup(async()=>{throw Error('offline')});cacheData.set('/offline.html',new Response('<html>offline</html>'));let result;handlers.fetch({request:{url:'https://garden.example/missing.css',method:'GET',mode:'cors'},respondWith(p){result=p}});assert.equal((await result).type,'error');});
test('offline navigation gets saved fallback',async()=>{const {handlers,cacheData}=setup(async()=>{throw Error('offline')});cacheData.set('/offline.html',new Response('offline garden'));let result;handlers.fetch({request:{url:'https://garden.example/',method:'GET',mode:'navigate'},respondWith(p){result=p}});assert.equal(await(await result).text(),'offline garden');});
test('the Wi-Fi guide uses the saved page immediately', async () => {
  const { handlers, cacheData } = setup(() => assert.fail('The saved guide should not use the network'));
  cacheData.set('/offline.html', new Response('Wi-Fi guide'));
  for (const path of ['/offline', '/offline/', '/offline.html']) {
    let response;
    handlers.fetch({
      request: { url: 'https://garden.example' + path, method: 'GET', mode: 'navigate' },
      respondWith(value) { response = value; }
    });
    assert.equal(await (await response).clone().text(), 'Wi-Fi guide');
  }
});
test('the device portal is a direct navigation outside the app cache', () => {
  const { handlers } = setup(() => assert.fail('The service worker should not fetch the local portal'));
  handlers.fetch({
    request: { url: 'http://192.168.4.1/wifi', method: 'GET', mode: 'navigate' },
    respondWith() { assert.fail('The local portal should open in the browser'); }
  });
});
test('push notification destinations stay on the application origin',()=>{const {context}=setup(()=>{});assert.equal(context.getSafeAppUrl('https://attacker.example/'),'https://garden.example/');assert.equal(context.getSafeAppUrl('/?plant=one'),'https://garden.example/?plant=one');});
test('build output excludes backend code, backup files and test code',()=>{const files=fs.readdirSync('dist');assert.ok(files.includes('dashboard.js'));assert.ok(!files.some(p=>/apps_script|\.bak|serviceAccount|tests/.test(p)));});
