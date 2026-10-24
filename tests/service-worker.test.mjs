import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
function worker() {
 const handlers=new Map(),deleted=[],cached=[],notifications=[];
 const context={self:{location:{origin:'https://plants.example'},registration:{active:true,showNotification:async(title,options)=>notifications.push({title,options})},clients:{claim:async()=>{},matchAll:async()=>[]},addEventListener:(event,handler)=>handlers.set(event,handler),skipWaiting(){}},URL,setTimeout,clearTimeout,AbortController,console,caches:{keys:async()=>['novenyfigyelo-cache-old','other-app-cache'],delete:async name=>deleted.push(name),open:async()=>({addAll:async()=>{},add:async()=>{},match:async(request)=>({type:typeof request==='string'&&request.endsWith('.html')?'text/html':'text/javascript'}),put:async(request)=>cached.push(request.url)})},fetch:async()=>{throw new Error('offline');}};
 vm.runInNewContext(source,context);return{handlers,deleted,cached,notifications,context};
}
test('service worker leaves database, authentication, external APIs and writes alone',()=>{
 const w=worker();for(const url of ['https://database.example/data.json','https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword','https://plants.example/api/private','https://plants.example/unknown.js']){let intercepted=false;w.handlers.get('fetch')({request:{method:'GET',url,mode:'cors'},respondWith(){intercepted=true;}});assert.equal(intercepted,false,url);}
 let intercepted=false;w.handlers.get('fetch')({request:{method:'POST',url:'https://plants.example/app.js'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);
});
test('offline javascript requests never receive an HTML fallback',async()=>{
 const w=worker();let response;
 w.handlers.get('fetch')({request:{method:'GET',url:'https://plants.example/app.js',mode:'cors'},respondWith(p){response=p;}});
 assert.equal((await response).type,'text/javascript');
 // Unknown scripts are not handled; the navigation fallback applies to documents only.
});
test('activation deletes this app old shells while preserving unrelated caches',async()=>{
 const w=worker();let done;w.handlers.get('activate')({waitUntil(p){done=p;}});await done;assert.deepEqual(w.deleted,['novenyfigyelo-cache-old']);
});
test('notification payloads cannot open an external origin',async()=>{
 const w=worker();let done;w.handlers.get('push')({data:{json:()=>({url:'https://evil.example',title:'Plant',body:'Water'})},waitUntil(p){done=p;}});await done;
 assert.equal(w.notifications[0].options.data.url,'https://plants.example/');assert.equal(w.notifications[0].options.icon,'/pwa-icon-192.png');
});
