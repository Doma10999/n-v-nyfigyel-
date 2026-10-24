import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../firebase-app.js',import.meta.url),'utf8');
const coreUrl=new URL('../core.js',import.meta.url).href;
function environment({user=null,saved=[],devices={},subscription={}}={}) {
 const storage=new Map([['novenyfigyelo_accounts_v3',JSON.stringify(saved)]]),apps=[],auths=new Map(),observers=new Map(),listeners=[],writes=[],errors=[];
 const app={name:'[DEFAULT]'};apps.push(app);auths.set(app.name,{currentUser:user});
 const deps={
  initializeApp(config,name='[DEFAULT]'){const a={name};apps.push(a);auths.set(name,{currentUser:null});return a;},getApps:()=>apps,deleteApp:async()=>{},
  getAuth:a=>auths.get(a.name),onAuthStateChanged(auth,callback){observers.set(auth,callback);queueMicrotask(()=>callback(auth.currentUser));return()=>observers.delete(auth);},
  signInWithEmailAndPassword:async()=>{},signOut:async auth=>{auth.currentUser=null;observers.get(auth)?.(null);},
  getDatabase:app=>({app}),ref:(db,path)=>({db,path}),
  onValue(ref,callback,error){const l={ref,callback,error,active:true};listeners.push(l);queueMicrotask(()=>{if(!l.active)return;const value=ref.path==='.info/connected'?true:ref.path.endsWith('/subscription')?subscription:devices;callback({val:()=>value});});return()=>{l.active=false;};},
  update:async(ref,patch)=>{writes.push({ref,patch});},get:async()=>({val:()=>devices}),set:async()=>{},
  runTransaction:async(ref,fn)=>{const value=fn(null);if(value!==undefined)writes.push({ref,value});return{committed:value!==undefined};}
 };
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 globalThis.window={dispatchEvent(){}};globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.__storeTest=deps;
 return{storage,apps,auths,observers,listeners,writes,errors,deps};
}
async function storeClass() {
 const rewritten=source.replace(/^import .* from 'https:\/\/www\.gstatic\.com\/[^']+';\n/gm,'').replace("from './core.js'",`from '${coreUrl}'`);
 const keys=['initializeApp','getApps','deleteApp','getAuth','onAuthStateChanged','signInWithEmailAndPassword','signOut','getDatabase','ref','onValue','update','get','set','runTransaction'];
 const module=await import('data:text/javascript;base64,'+Buffer.from(`const {${keys.join(',')}}=globalThis.__storeTest;\n`+rewritten+`\n// ${Math.random()}`).toString('base64'));
 return module.PlantStore;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('startup waits for Firebase authentication before reading any user data',async()=>{
 const env=environment();let authCallback;
 env.deps.onAuthStateChanged=(auth,callback)=>{authCallback=callback;return()=>{};};
 const Store=await storeClass(),store=new Store(()=>{},e=>env.errors.push(e));
 const starting=store.start();await tick();assert.equal(env.listeners.length,0);assert.equal(store.ready,false);
 const user={uid:'owner',email:'owner@example.test'};env.auths.get('[DEFAULT]').currentUser=user;authCallback(user);await starting;await tick();
 assert.equal(store.ready,true);assert.ok(env.listeners.filter(l=>l.ref.path.startsWith('users/')).every(l=>l.ref.path.startsWith('users/owner/')));
 assert.equal(env.writes.length,0,'reading a Free account must not create defaults or delete its history');
});
test('all account database listeners are detached and its local snapshot removed on logout',async()=>{
 const env=environment({user:{uid:'owner',email:'owner@example.test'},devices:{esp32_004:{sensorValue:30,history:{1792864800000:20}}}});
 const Store=await storeClass(),store=new Store(()=>{},()=>{});await store.start();await tick();
 assert.equal(env.listeners.filter(l=>l.active).length,3);assert.ok(env.storage.has('novenyfigyelo_snapshot_v3_owner'));
 await store.logout();assert.equal(env.listeners.filter(l=>l.active).length,0);assert.equal(env.storage.has('novenyfigyelo_snapshot_v3_owner'),false);assert.equal(store.contexts.size,0);assert.equal(env.writes.length,0);
});
test('device edits are blocked without a live connection and cannot change another user',async()=>{
 const env=environment({user:{uid:'owner',email:'owner@example.test'},devices:{esp32_004:{sensorValue:30}}});
 const Store=await storeClass(),store=new Store(()=>{},()=>{});await store.start();await tick();
 await assert.rejects(store.saveDevice('other','esp32_004',{ledLevel:50}));
 navigator.onLine=false;await assert.rejects(store.saveDevice('owner','esp32_004',{ledLevel:50}));
 navigator.onLine=true;store.contexts.get('owner').connected=false;await assert.rejects(store.saveDevice('owner','esp32_004',{ledLevel:50}));
 assert.equal(env.writes.length,0);store.contexts.get('owner').connected=true;
 await store.saveDevice('owner','esp32_004',{ledLevel:50});assert.equal(env.writes.length,1);assert.equal(env.writes[0].ref.path,'users/owner/devices/esp32_004');
});
test('a restored additional account uses its own Firebase auth and database instance',async()=>{
 const env=environment({user:{uid:'owner',email:'owner@example.test'},saved:[{appName:'plant-account-second',uid:'second'}]});
 env.deps.initializeApp=(config,name)=>{const app={name};env.apps.push(app);env.auths.set(name,{currentUser:{uid:'second',email:'second@example.test'}});return app;};
 const Store=await storeClass(),store=new Store(()=>{},()=>{});await store.start();await tick();
 assert.equal(store.contexts.size,2);
 const second=env.listeners.filter(l=>l.ref.path.startsWith('users/second/'));assert.equal(second.length,2);assert.ok(second.every(l=>l.ref.db.app.name==='plant-account-second'));
 store.selectAccount('second');assert.equal(window.__auth.currentUser.uid,'second');
});
test('only one history point is written per real measurement; missing, stale and Free measurements do not write',async()=>{
 const now=Date.now();const env=environment({user:{uid:'owner',email:'owner@example.test'},subscription:{plan:'plus',status:'active'},devices:{fresh:{sensorValue:40,lastMeasurementAt:now},stale:{sensorValue:10,lastMeasurementAt:now-15*3600000},missing:{sensorValue:null,lastMeasurementAt:now},heartbeat:{sensorValue:40,lastSeen:now}}});
 const Store=await storeClass(),store=new Store(()=>{},()=>{});await store.start();await tick();
 assert.equal(env.writes.length,1);assert.equal(env.writes[0].ref.path,`users/owner/devices/fresh/history/${now}`);
 const listener=env.listeners.find(l=>l.ref.path.endsWith('/devices'));listener.callback({val:()=>({...store.contexts.get('owner').devices})});await tick();assert.equal(env.writes.length,1);
});
