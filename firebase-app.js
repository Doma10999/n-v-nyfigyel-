import { initializeApp, getApps, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, onValue, update, get, set, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { activePlus, deviceModel, validPathKey } from './core.js';

// Public Firebase web configuration. Authorization remains Firebase Authentication + RTDB Rules.
const config = {
  apiKey: 'AIzaSyCfo3UqEb77ihYOqSJZvIFVr2VRGf6dJ4w',
  authDomain: 'plant-monitor-3976f.firebaseapp.com',
  databaseURL: 'https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'plant-monitor-3976f', storageBucket: 'plant-monitor-3976f.appspot.com',
  messagingSenderId: '705425147510', appId: '1:705425147510:web:71f15bde879f3672df8157'
};
const SESSION_KEY = 'novenyfigyelo_accounts_v3';
const CACHE_PREFIX = 'novenyfigyelo_snapshot_v3_';
const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
function safeWrite(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional (private browsing / quota). */ } }
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }

export class PlantStore {
  constructor(onChange, onError) {
    this.contexts = new Map(); this.authObservers = new Map(); this.onChange = onChange; this.onError = onError;
    this.primaryApp = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(config);
    this.primaryAuth = getAuth(this.primaryApp); this.activeUid = null; this.ready = false; this.stopped = false;
    this.notify = () => {
      if (this.stopped) return;
      const accounts = [...this.contexts.values()];
      this.onChange({ ready: this.ready, accounts: accounts.map(a => ({ uid:a.uid, email:a.email, appName:a.app.name, subscription:a.subscription, connected:a.connected, loaded:a.loaded, error:a.error, cached:a.cached })), devices: accounts.flatMap(a => Object.entries(a.devices).filter(([id,data]) => validPathKey(id) && data && typeof data === 'object').map(([id,data]) => deviceModel(a.uid,a.email,id,data,a.subscription))) });
    };
    window.__db = getDatabase(this.primaryApp); window.__auth = this.primaryAuth;
    window.__ref = (db, path) => {
      const uid = String(path || '').split('/')[1];
      const ctx = this.contexts.get(uid);
      if (String(path).startsWith('users/') && !ctx) throw new Error('A fiók nincs hitelesítve.');
      return ref(ctx ? ctx.db : db, path);
    };
    window.__get = get; window.__set = set; window.__update = update; window.__onValue = onValue;
    window.__isPlusForUid = uid => activePlus(this.contexts.get(uid)?.subscription);
    window.__isHistoryEnabledForUid = window.__isPlusForUid;
    window.__userPlanCache = new Map();
  }
  persist() {
    safeWrite(SESSION_KEY, [...this.contexts.values()].map(a => ({ appName:a.app.name, uid:a.uid, email:a.email })));
  }
  async observe(app) {
    const auth = getAuth(app);
    if (this.authObservers.has(app.name)) return;
    await new Promise(resolve => {
      let first = true;
      const unsub = onAuthStateChanged(auth, user => {
        const existing = [...this.contexts.values()].find(a => a.app.name === app.name);
        if (existing && existing.uid !== user?.uid) this.detach(existing.uid);
        if (user && !this.contexts.has(user.uid)) this.attach(app, user);
        if (first) { first=false; resolve(); }
        this.notify();
      }, error => { this.onError(error); resolve(); });
      this.authObservers.set(app.name, unsub);
    });
  }
  async start() {
    const saved = safeRead(SESSION_KEY, []);
    await this.observe(this.primaryApp);
    if (Array.isArray(saved)) for (const acc of saved.slice(0,10)) {
      if (typeof acc?.appName !== 'string' || !acc.appName.startsWith('plant-account-')) continue;
      const app = getApps().find(a => a.name === acc.appName) || initializeApp(config, acc.appName);
      await this.observe(app);
    }
    this.ready = true; this.persist(); this.notify();
  }
  attach(app, user) {
    if (this.stopped || this.contexts.has(user.uid)) return;
    const db = getDatabase(app), ctx = { app, db, auth:getAuth(app), uid:user.uid, email:user.email || '', devices:{}, subscription:{}, connected:false, loaded:false, cached:false, error:'', errors:{}, unsub:[], recorded:new Set() };
    this.contexts.set(user.uid, ctx);
    const cache = safeRead(CACHE_PREFIX+user.uid, null);
    if (cache?.devices && typeof cache.devices === 'object') { ctx.devices=cache.devices; ctx.subscription=cache.subscription || {}; ctx.cached=true; }
    const fail = source => error => { ctx.errors[source] = error.code === 'PERMISSION_DENIED' || String(error.code).includes('permission') ? 'A fiók adatainak olvasását az adatbázis jogosultsága tiltja.' : 'Az adatok betöltése megszakadt. Ellenőrizd az internetkapcsolatot.'; ctx.error=Object.values(ctx.errors).filter(Boolean).join(' '); ctx.loaded=true; this.onError(error); this.notify(); };
    ctx.unsub.push(onValue(ref(db,'.info/connected'), snap => { ctx.connected = snap.val() === true; this.notify(); }));
    ctx.unsub.push(onValue(ref(db,`users/${user.uid}/subscription`), snap => {
      ctx.subscription=snap.val() || {}; ctx.errors.subscription=''; ctx.error=Object.values(ctx.errors).filter(Boolean).join(' '); ctx.subscriptionReady=true; window.__userPlanCache.set(user.uid,ctx.subscription);
      window.dispatchEvent(new CustomEvent('subscription-plan-updated'));
      this.cache(ctx); this.recordMeasurements(ctx); this.notify();
    }, fail('subscription')));
    ctx.unsub.push(onValue(ref(db,`users/${user.uid}/devices`), snap => {
      ctx.devices=snap.val() || {}; ctx.loaded=true; ctx.cached=false; ctx.errors.devices=''; ctx.error=Object.values(ctx.errors).filter(Boolean).join(' '); this.cache(ctx); this.recordMeasurements(ctx); this.notify();
    }, fail('devices')));
    this.persist();
    if (!this.activeUid) this.selectAccount(user.uid);
  }
  cache(ctx) {
    // Only this authenticated user's snapshot; never put API responses or tokens into a service worker cache.
    safeWrite(CACHE_PREFIX+ctx.uid, { devices:ctx.devices, subscription:ctx.subscription, savedAt:Date.now() });
  }
  recordMeasurements(ctx) {
    if (!ctx.loaded || !ctx.subscriptionReady || !ctx.connected || !activePlus(ctx.subscription)) return;
    for (const [id,data] of Object.entries(ctx.devices)) {
      if (!validPathKey(id) || !data || typeof data !== 'object') continue;
      const model = deviceModel(ctx.uid,ctx.email,id,data,ctx.subscription);
      if (model.percent === null || !model.time || model.future || model.stale) continue;
      const recordKey = id+'|'+model.time;
      if (ctx.recorded.has(recordKey)) continue;
      ctx.recorded.add(recordKey);
      // One immutable point per real measurement. Config changes cannot create a new point.
      // Never delete history on a plan downgrade, or overwrite an existing recorded value.
      runTransaction(ref(ctx.db,`users/${ctx.uid}/devices/${id}/history/${model.time}`), current => current === null ? model.percent : undefined, { applyLocally:false }).catch(error => {
        ctx.recorded.delete(recordKey); console.warn('Mérési előzmény mentése sikertelen:', error.code || 'database-error');
      });
    }
  }
  selectAccount(uid) {
    const ctx=this.contexts.get(uid); if (!ctx) return;
    this.activeUid=uid; window.__auth=ctx.auth; window.jelenlegiUID=uid;
    window.dispatchEvent(new CustomEvent('auth-state-updated'));
  }
  async login(email,password,additional=false) {
    if (!navigator.onLine) throw new Error('A bejelentkezéshez internetkapcsolat szükséges.');
    const app = additional ? initializeApp(config,'plant-account-'+crypto.randomUUID()) : this.primaryApp;
    const auth = getAuth(app);
    try {
      await signInWithEmailAndPassword(auth,email.trim(),password);
      if (this.contexts.has(auth.currentUser.uid) && this.contexts.get(auth.currentUser.uid).app.name !== app.name) {
        await signOut(auth); if (additional) await deleteApp(app); throw new Error('Ez a fiók már hozzá van adva.');
      }
      await this.observe(app); this.selectAccount(auth.currentUser.uid); this.persist(); this.notify();
    } catch(error) { if (additional && !auth.currentUser) { this.authObservers.get(app.name)?.(); this.authObservers.delete(app.name); if(getApps().some(a=>a.name===app.name)) await deleteApp(app); } throw error; }
  }
  detach(uid) {
    const ctx=this.contexts.get(uid); if (!ctx) return;
    ctx.unsub.forEach(unsub=>unsub()); this.contexts.delete(uid); window.__userPlanCache.delete(uid); safeRemove(CACHE_PREFIX+uid);
    // Remove legacy snapshots for the logged-out user too.
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('plant_'+uid+'_')) localStorage.removeItem(k); } catch {}
    if (this.activeUid===uid) { this.activeUid=null; const next=this.contexts.keys().next().value; if(next) this.selectAccount(next); else { window.__auth=this.primaryAuth; window.jelenlegiUID=null; window.dispatchEvent(new CustomEvent('auth-state-updated')); } }
    this.persist(); this.notify();
  }
  async removeAccount(uid) {
    const ctx=this.contexts.get(uid); if (!ctx) return;
    await signOut(ctx.auth); this.detach(uid);
    // Keep the default app so that signing in remains possible.
    if(ctx.app.name!=='[DEFAULT]') { this.authObservers.get(ctx.app.name)?.(); this.authObservers.delete(ctx.app.name); await deleteApp(ctx.app); }
  }
  async logout() {
    for (const uid of [...this.contexts.keys()]) await this.removeAccount(uid);
    safeRemove('storedAccounts_v2'); this.notify();
  }
  async saveDevice(uid,id,patch) {
    const ctx=this.contexts.get(uid);
    if (!ctx || ctx.auth.currentUser?.uid!==uid || !validPathKey(id) || !Object.hasOwn(ctx.devices,id)) throw new Error('Ehhez az eszközhöz újra be kell jelentkezned.');
    if (!navigator.onLine || !ctx.connected) throw new Error('Most nincs kapcsolat. A mentéshez várd meg az újracsatlakozást.');
    const allowed = ['displayName','plantType','ledLevel','emailNotifEnabled','emailNotifEmail','emailNotifCooldownMs'];
    if (Object.keys(patch).some(key=>!allowed.includes(key))) throw new Error('Nem támogatott beállítás.');
    return update(ref(ctx.db,`users/${uid}/devices/${id}`),patch);
  }
  async refresh() {
    const results=await Promise.allSettled([...this.contexts.values()].map(async ctx=> {
      const snap=await get(ref(ctx.db,`users/${ctx.uid}/devices`));
      if(!this.contexts.has(ctx.uid)) return;
      ctx.devices=snap.val() || {}; ctx.loaded=true; ctx.error=''; ctx.cached=false; this.cache(ctx);
    })); this.notify();
    if(results.some(r=>r.status==='rejected')) throw new Error('Nem sikerült minden fiókot frissíteni.');
  }
}
