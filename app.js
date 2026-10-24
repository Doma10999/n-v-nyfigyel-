import { CATEGORIES, DEFAULT_CATEGORY, COOLDOWN_MS, activePlus, deviceModel, filterDevices, historyForDevice, normalHistory, timestamp, formatTime, relativeTime, escapeHtml as esc, clamp } from './core.js';
import { icon, plantIllustration } from './assets/visuals.js';

const $ = id => document.getElementById(id);
const isDemo = new URLSearchParams(location.search).get('demo') === '1';
const state = { ready:false, accounts:[], devices:[], filter:'all', search:'', selected:null, range:'all', dialogKind:null, notificationUid:null };
const cards = new Map();
let store, renderFrame, toastTimer, previousFocus, backendPromise;
function fillIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML=icon(el.dataset.icon); el.removeAttribute('data-icon'); }); }
fillIcons();
$('welcomeGarden').innerHTML = `<div class="garden-orbit orbit-one"></div><div class="garden-orbit orbit-two"></div><span class="garden-spark spark-one">✦</span><span class="garden-spark spark-two">✦</span><div class="welcome-plant plant-small">${plantIllustration('cactus','welcome1')}</div><div class="welcome-plant plant-main">${plantIllustration('monstera','welcome2')}</div><div class="welcome-plant plant-mid">${plantIllustration('ficus','welcome3')}</div><span class="garden-label">${icon('check')} Pont annyi figyelem, amennyi kell.</span>`;
$('heroGarden').innerHTML = `<div class="hero-sun"></div><div class="hero-plant plant-left">${plantIllustration('cactus','hero1')}</div><div class="hero-plant plant-center">${plantIllustration('monstera','hero2')}</div><div class="hero-plant plant-right">${plantIllustration('ficus','hero3')}</div>`;
$('todayLabel').textContent = new Intl.DateTimeFormat('hu-HU',{ weekday:'long',month:'long',day:'numeric' }).format(Date.now()).toLocaleUpperCase('hu');

function toast(message, title='Elmentve', error=false) {
  clearTimeout(toastTimer); $('toastTitle').textContent=title; $('toastMessage').textContent=message;
  $('toastIcon').innerHTML=icon(error?'info':'check'); $('toast').classList.toggle('is-error',error); $('toast').hidden=false;
  toastTimer=setTimeout(()=>{$('toast').hidden=true;},error?8500:4200);
}
window.showAppToast=toast;
$('toastClose').addEventListener('click',()=>{$('toast').hidden=true;});
function errorText(error) {
  const code=String(error?.code || '');
  if (['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'].includes(code)) return 'Hibás email-cím vagy jelszó. Ellenőrizd az adatokat.';
  if(code==='auth/too-many-requests') return 'Túl sok sikertelen próbálkozás. Várj egy kicsit, majd próbáld újra.';
  if(code==='auth/network-request-failed') return 'A bejelentkezéshez most nem érhető el az internet. Próbáld újra.';
  if(code.toLowerCase().includes('permission')) return 'Az adatbázis nem engedélyezte ezt a műveletet. A módosítás nem lett elmentve.';
  return code ? 'A művelet nem sikerült. Próbáld újra.' : (error?.message || 'A művelet nem sikerült.');
}
function scheduleRender() { if(!renderFrame) renderFrame=requestAnimationFrame(()=>{renderFrame=null; render();}); }
function setData(next) { Object.assign(state,next); window.__deviceCardsMap = new Map(state.devices.map(m=>[m.key,{...m,deviceId:m.id,card:cards.get(m.key),lastMeasurementAt:m.time}])); scheduleRender(); }
function modelFor(key) { return state.devices.find(m=>m.key===key); }
function activeAccount() { return state.accounts.find(a=>a.uid===state.notificationUid) || state.accounts[0]; }
function selectAccount(uid) { state.notificationUid=uid; store?.selectAccount?.(uid); }
function attentionCount() { return filterDevices(state.devices,'attention').length; }
function renderConnection() {
  const offline=!navigator.onLine, cached=state.accounts.some(a=>a.cached), errors=state.accounts.filter(a=>a.error);
  const connected=state.accounts.length>0 && state.accounts.every(a=>a.connected);
  $('connectionStatus').classList.toggle('is-offline',offline || !!errors.length);
  $('connectionStatus').lastElementChild.textContent=isDemo?'Bemutató':offline?'Offline':!state.ready?'Kapcsolódás':!state.accounts.length?'Biztonságos belépés':connected?'Kapcsolódva':'Újracsatlakozás';
  const msg=errors.length ? errors.map(a=>a.error).join(' ') : offline ? 'Offline vagy. Az utoljára betöltött adatok láthatók; a vezérlés és a mentés internetkapcsolatot igényel.' : cached ? 'A korábban mentett adatokat látod. Várjuk a kapcsolat és a friss adatok betöltését.' : state.accounts.length && !connected ? 'Kapcsolódás az adatbázishoz. A látható értékek a legutóbb betöltött mérések.' : '';
  $('connectionBanner').hidden=!msg || isDemo;
  $('connectionBanner').textContent=msg;
}
function render() {
  // Re-evaluate age and expiry even when no new sensor packet arrives.
  state.devices=state.devices.map(m=>deviceModel(m.uid,m.email,m.id,m.data,state.accounts.find(a=>a.uid===m.uid)?.subscription||{}));
  const loggedIn=state.accounts.length>0;
  $('loginView').hidden=loggedIn; $('dashboardView').hidden=!loggedIn;
  document.body.classList.toggle('logged-in',loggedIn);
  $('demoBanner').hidden=!isDemo;
  const first=state.accounts[0], initial=(first?.email?.[0] || 'N').toUpperCase();
  $('profileInitial').textContent=initial; document.querySelector('.top-avatar').textContent=initial;
  $('profileName').textContent=first?.email || 'A növényeid otthona';
  $('profilePlan').textContent=first?(activePlus(first.subscription)?'Plus csomag':'Free csomag'):'Növényfigyelő';
  renderConnection();
  if(!loggedIn) return;
  const total=state.devices.length, good=filterDevices(state.devices,'good').length, attention=attentionCount();
  $('navCount').textContent=total; $('plantCount').textContent=total; $('filterAllCount').textContent=total;
  $('totalCount').innerHTML=`${total} <span>növény</span>`; $('goodCount').innerHTML=`${good} <span>növény</span>`; $('attentionCount').innerHTML=`${attention} <span>növény</span>`;
  $('notifDot').hidden=!attention;
  $('heroTitle').innerHTML=attention?`${attention} növényed<br><em>figyelmet kér.</em>`:total?'A növényeidnek<br><em>jó itt veled.</em>':'Itt kezdődik<br><em>a saját kerted.</em>';
  $('heroDescription').textContent=attention?'Egy kis odafigyelés sokat számít. Nézd meg az állapotjelzéseket és a mérési időpontokat.':'A nedvesség, a fény és a legutóbbi mérések. Minden, ami a gondoskodáshoz kell, egy helyen.';
  const visible=new Set(filterDevices(state.devices,state.filter,state.search).map(m=>m.key));
  for(const [key,el] of cards) if(!state.devices.some(m=>m.key===key)) { el.remove(); cards.delete(key); }
  state.devices.forEach((m,index)=> {
    let el=cards.get(m.key);
    if(!el) { el=createCard(m,index); cards.set(m.key,el); $('plantsGrid').append(el); }
    el.hidden=!visible.has(m.key); updateCard(el,m);
  });
  const loading=state.accounts.some(a=>!a.loaded);
  $('plantsGrid').setAttribute('aria-busy',String(loading));
  $('emptyState').hidden=visible.size>0;
  if(!visible.size) {
    $('emptyState').querySelector('h3').textContent=loading?'Betöltjük a kertedet…':total?'Ilyen növényt most nem találtunk.':'Itt lesz a saját kis kerted.';
    $('emptyState').querySelector('p').textContent=loading?'Az eszközök és a legutóbbi mérések hamarosan megjelennek.':total?'Válts másik szűrőre, vagy módosítsd a keresést.':'A fiókodhoz tartozó eszközök automatikusan megjelennek az első mérés után.';
  }
  document.querySelectorAll('.filter').forEach(el=>{const active=el.dataset.filter===state.filter; el.classList.toggle('active',active); el.setAttribute('aria-pressed',String(active));});
  if($('detailDialog').open && state.selected) updateDetail();
}
function artKind(m,index=0) { return m.category.key===CATEGORIES[0].key?'cactus':index%3===2?'ficus':'monstera'; }
function createCard(m,index) {
  const el=document.createElement('article'); el.className='plant-card'; el.dataset.key=m.key; el.style.setProperty('--index',Math.min(index,5));
  el.innerHTML=`<div class="plant-card-top"><span class="plant-category"></span><span class="device-power"></span></div><button class="plant-visual" data-device-action="detail" aria-label="${esc(m.name)} részletei"><span class="plant-visual-circle"></span>${plantIllustration(artKind(m,index),'card'+index)}<span class="plant-art-caption">NÖVÉNYFIGYELŐ</span></button><div class="plant-name-row"><h3></h3><button class="icon-button card-options" data-device-action="detail" aria-label="${esc(m.name)} beállításai">${icon('settings')}</button></div><div class="plant-health"><span></span><strong></strong></div><div class="moisture-row"><div><span class="metric-caption">Növényhez igazított</span><div class="moisture-value"><strong>—</strong><span>%</span></div><span class="raw-moisture"></span></div><div class="mini-gauge"><svg viewBox="0 0 88 88" aria-hidden="true"><circle class="gauge-track" cx="44" cy="44" r="35"/><circle class="gauge-progress" cx="44" cy="44" r="35"/></svg><span>${icon('drop')}</span></div></div><div class="card-led" hidden><label><span>${icon('sun')}Fényerő</span><output>0%</output><input class="led-slider" type="range" min="0" max="100" step="10" aria-label="${esc(m.name)} fényereje"></label></div><div class="card-air" hidden><span>${icon('wind')}Levegő</span><strong></strong></div><div class="plant-card-footer"><span class="measurement-time">${icon('clock')}<time></time></span><button class="details-link" data-device-action="detail" aria-label="${esc(m.name)} adatainak megnyitása">Részletek ${icon('arrow')}</button></div>`;
  return el;
}
function updateCard(el,m) {
  el.dataset.tone=m.tone;
  el.querySelector('.plant-category').textContent=m.category.name;
  const power=el.querySelector('.device-power');
  const powerMarkup=m.battery!==null?`${icon('battery')}<span>${m.battery}%</span>`:`${icon(m.led!==null?'sun':'wifi')}<span>${m.led!==null?'LED-es':'Eszköz'}</span>`;
  if(power.innerHTML!==powerMarkup) power.innerHTML=powerMarkup;
  power.classList.toggle('low',m.battery!==null && m.battery<=25);
  el.querySelector('h3').textContent=m.name;
  el.querySelector('.plant-health strong').textContent=m.label;
  el.querySelector('.moisture-value strong').textContent=m.percent??'—';
  el.querySelector('.raw-moisture').textContent=m.sensor===null?'Mért nedvesség: nincs adat':`Mért nedvesség: ${Math.round(m.sensor)}%`;
  const ring=el.querySelector('.gauge-progress');
  const offset=219.912-(m.percent??0)/100*219.912;
  ring.style.strokeDashoffset=offset;
  const time=el.querySelector('time'); time.textContent=relativeTime(m.time); time.title=`Mérés: ${formatTime(m.time)}`;
  if(m.time) time.dateTime=new Date(m.time).toISOString();
  const led=el.querySelector('.card-led'), slider=el.querySelector('.led-slider'); led.hidden=m.led===null;
  if(document.activeElement!==slider && !slider.disabled) { slider.value=m.led??0; slider.style.setProperty('--value',`${m.led??0}%`); el.querySelector('output').textContent=`${Math.round(m.led??0)}%`; }
  const air=el.querySelector('.card-air'); air.hidden=!m.air;
  if(m.air) { air.querySelector('strong').textContent=m.air.label; air.classList.toggle('bad',m.air.bad); }
  el.querySelector('.plant-visual').setAttribute('aria-label',`${m.name} részletei`);
}
function setFilter(filter) {state.filter=filter; scheduleRender();}
$('plantSearch').addEventListener('input',e=>{state.search=e.target.value; scheduleRender();});

function openDialog(title,body,kind='',kicker='NÖVÉNYFIGYELŐ') {
  if($('detailDialog').open) $('detailDialog').close();
  const dialog=$('appDialog'); previousFocus=document.activeElement; state.dialogKind=kind;
  $('dialogTitle').textContent=title; $('dialogKicker').textContent=kicker; $('dialogContent').innerHTML=body; fillIcons($('dialogContent'));
  if(!dialog.open) dialog.showModal();
}
function closeDialog(id) { const d=$(id); if(d?.open) d.close(); }
for(const id of ['appDialog','detailDialog']) {
  $(id).addEventListener('click',e=>{if(e.target===$(id)) {const rect=$(id).getBoundingClientRect(); if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom) $(id).close();}});
  $(id).addEventListener('close',()=>{if(id==='appDialog') state.dialogKind=null; else state.selected=null; previousFocus?.focus?.();});
}
function openDetail(key) {
  const m=modelFor(key); if(!m) return;
  state.selected=key; state.range='all'; previousFocus=document.activeElement;
  if($('appDialog').open) $('appDialog').close();
  $('detailContent').innerHTML=`<div class="detail-heading"><span class="eyebrow">Egy levéllel közelebb</span><button class="icon-button" data-close="detailDialog" aria-label="Részletek bezárása">${icon('close')}</button></div><div class="detail-hero">${plantIllustration(artKind(m),'detail')}<div><span class="detail-category">${esc(m.category.name)}</span><h2 id="detailTitle">${esc(m.name)}</h2><span class="detail-health"></span></div></div><div class="detail-metrics"><div><small>Növényhez igazított</small><strong id="detailPercent"></strong></div><div><small>Mért nedvesség</small><strong id="detailRaw"></strong></div></div><p class="detail-hint" id="detailHint"></p><div class="detail-meta"><span>${icon('clock')}<span id="detailTime"></span></span><span id="detailBattery"></span></div><section class="history-section"><div class="section-heading"><h3>Nedvesség alakulása</h3><span class="plus-tag">${m.plus?'PLUS':'AKTUÁLIS MÉRÉS'}</span></div><div class="chart-ranges" role="group" aria-label="Grafikon időtartománya"><button data-range="24h">24 óra</button><button data-range="7d">7 nap</button><button data-range="all" class="active">Összes</button></div><div id="detailChart" class="chart-container"></div><p class="chart-note">${m.plus?'A rendelkezésre álló, növényhez igazított mérési pontok. A görbe nem pótolja a hiányzó adatokat.':'A jelenlegi mérés látható. A mérési előzmények Plus csomagban érhetők el.'}</p></section><div id="detailAir"></div><form id="deviceSettings" class="settings-form"><h3>Növény beállításai</h3><label for="plantName">Növény neve</label><input id="plantName" value="${esc(m.name)}" maxlength="50" required><label for="plantCategory">Vízigény</label><select id="plantCategory">${CATEGORIES.map(c=>`<option value="${esc(c.key)}" ${c.key===m.category.key?'selected':''} ${!m.plus&&c.key!==DEFAULT_CATEGORY.key?'disabled':''}>${c.icon} ${esc(c.name)} · ${c.min}–${c.max}%${!m.plus&&c.key!==DEFAULT_CATEGORY.key?' · Plus':''}</option>`).join('')}</select><p class="input-help">A kategória azt határozza meg, hogyan értékeljük a mért nedvességet.${m.plus?'':' Az összes kategória Plus csomaggal választható.'}</p><p class="form-status" id="settingsStatus" role="status"></p><button class="button primary full-width" type="submit">Beállítások mentése ${icon('check')}</button></form><div class="device-id">${icon('wifi')}<span>Eszköz: <code>${esc(m.id)}</code><br>${esc(m.email)}</span></div>`;
  updateDetail(); $('detailDialog').showModal();
}
function chartMarkup(points) {
  if(!points.length) return `<div class="chart-empty">${icon('chart')}<strong>Még nincs mérés ebben az időszakban.</strong><span>Az első érvényes mérés után itt jelenik meg a grafikon.</span></div>`;
  const w=620,h=230,pad={l:36,r:16,t:18,b:38}, plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const min=points[0].t,max=points.at(-1).t;
  const x=t=>min===max?pad.l+plotW/2:pad.l+(t-min)/(max-min)*plotW;
  const y=v=>pad.t+plotH*(1-v/100);
  const line=points.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const area=`${line} L${x(points.at(-1).t)},${y(0)} L${x(points[0].t)},${y(0)} Z`;
  return `<svg class="history-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Növényhez igazított nedvesség: ${points.length} mérés, utolsó érték ${points.at(-1).v}%"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#547b54" stop-opacity=".20"/><stop offset="100%" stop-color="#547b54" stop-opacity="0"/></linearGradient></defs>${[0,50,100].map(v=>`<line x1="${pad.l}" x2="${w-pad.r}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${pad.l-9}" y="${y(v)+4}" text-anchor="end" class="chart-label">${v}</text>`).join('')}<line x1="${pad.l}" x2="${w-pad.r}" y1="${y(35)}" y2="${y(35)}" class="chart-threshold"/><text x="${w-pad.r}" y="${y(35)-7}" text-anchor="end" class="chart-threshold-label">35% · figyelmeztetési határ</text>${points.length>1?`<path d="${area}" fill="url(#chartFill)"/><path d="${line}" class="chart-line"/>`:''}${points.map(p=>`<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${points.length>30?2:4}" class="chart-point"><title>${esc(formatTime(p.t))} · ${p.v}%</title></circle>`).join('')}<text x="${pad.l}" y="${h-10}" class="chart-label">${esc(formatTime(min))}</text>${min===max?'':`<text x="${w-pad.r}" y="${h-10}" text-anchor="end" class="chart-label">${esc(formatTime(max))}</text>`}</svg><div class="chart-latest"><span>${points.length} ${isDemo?'minta ':''}mérési pont</span><strong>Utolsó: ${points.at(-1).v}%</strong></div>`;
}
let chartSignature='';
function updateDetail() {
  const m=modelFor(state.selected); if(!m) { closeDialog('detailDialog'); return; }
  if(!$('detailPercent')) return;
  $('detailTitle').textContent=m.name; $('detailPercent').textContent=m.percent===null?'—':m.percent+'%'; $('detailRaw').textContent=m.sensor===null?'—':Math.round(m.sensor)+'%';
  document.querySelector('.detail-health').textContent=m.label; document.querySelector('.detail-health').dataset.tone=m.tone;
  $('detailHint').textContent=m.hint; $('detailTime').textContent=`Mérés: ${formatTime(m.time)}`;
  $('detailBattery').innerHTML=m.battery===null?`${icon('battery')} Nincs akkumulátoradat`:`${icon('battery')} ${m.battery}% akkumulátor`;
  const period=state.range==='24h'?86400000:state.range==='7d'?7*86400000:Infinity;
  const points=historyForDevice(m).filter(p=>p.t>=Date.now()-period);
  const signature=state.selected+state.range+JSON.stringify(points);
  if(signature!==chartSignature || !$('detailChart').children.length) { $('detailChart').innerHTML=chartMarkup(points); chartSignature=signature; }
  $('detailAir').innerHTML=m.air?`<section class="air-detail"><div class="section-heading"><h3>${icon('wind')} Levegőminőség</h3><span class="air-pill ${m.air.bad?'bad':''}">${esc(m.air.label)}</span></div><div class="air-metrics"><div><small>AQI</small><strong>${m.air.aqi??'—'}<em> / 5</em></strong></div><div><small>TVOC</small><strong>${m.air.tvoc??'—'}<em> ppb</em></strong></div><div><small>eCO₂</small><strong>${m.air.eco2??'—'}<em> ppm</em></strong></div></div><p class="input-help">Szenzorbecslés, nem hitelesített egészségügyi mérés.${m.air.time?' Frissítve: '+esc(formatTime(m.air.time))+'.':''}</p></section>`:'';
  document.querySelectorAll('[data-range]').forEach(b=>{b.classList.toggle('active',b.dataset.range===state.range);b.setAttribute('aria-pressed',String(b.dataset.range===state.range));});
}
async function saveLed(slider) {
  const el=slider.closest('.plant-card'), m=modelFor(el?.dataset.key); if(!m) return;
  const value=clamp(Math.round(Number(slider.value)/10)*10), before=m.led;
  slider.disabled=true;
  try { await store.saveDevice(m.uid,m.id,{ledLevel:value}); toast(`${m.name} fényereje: ${value}%.`); }
  catch(error) { slider.value=before; slider.style.setProperty('--value',before+'%'); el.querySelector('output').textContent=before+'%'; toast(errorText(error),'Nem sikerült menteni',true); }
  finally { slider.disabled=false; scheduleRender(); }
}

function openAccounts() {
  if(!state.accounts.length) { $('email').focus(); return; }
  openDialog('A kertedhez kapcsolt fiókok',`<p class="dialog-intro">Több fiók növényeit is láthatod egy helyen. Mindegyik fiók saját, biztonságos bejelentkezést használ.</p><div class="accounts-list">${state.accounts.map(a=>`<div class="account-row"><span class="avatar">${esc(a.email[0]?.toUpperCase()||'N')}</span><div><strong>${esc(a.email)}</strong><small>${activePlus(a.subscription)?'Plus':'Free'} csomag · ${state.devices.filter(m=>m.uid===a.uid).length} növény</small></div><button class="icon-button" data-remove-account="${esc(a.uid)}" aria-label="${esc(a.email)} kijelentkeztetése">${icon('logout')}</button></div>`).join('')}</div><button class="button secondary full-width" data-action="add-account">${icon('plus')}Másik fiók hozzáadása</button><button class="button primary full-width mt" data-action="plans">${icon('spark')}Csomagom és előfizetésem</button><button class="button plain full-width mt" data-action="logout">Kijelentkezés minden fiókból</button>`, 'accounts');
}
function openAddAccount() {
  if(!state.accounts.length) { closeDialog('appDialog'); $('email').focus(); return; }
  openDialog('Még egy kis zöld.',`<p class="dialog-intro">Add hozzá egy meglévő Növényfigyelő-fiók belépési adatait. A hozzá tartozó eszközök automatikusan megjelennek.</p><form id="addAccountForm" class="settings-form"><label for="extraEmail">Email-cím</label><input id="extraEmail" type="email" autocomplete="username" required maxlength="254"><label for="extraPassword">Jelszó</label><div class="password-field"><input id="extraPassword" type="password" autocomplete="current-password" required><button type="button" class="icon-button password-eye" data-password="extraPassword" aria-label="Jelszó megjelenítése">${icon('eye')}</button></div><p class="form-status" id="addAccountStatus" role="status"></p><button class="button primary full-width" type="submit">Fiók hozzáadása ${icon('plus')}</button></form>`,'add-account');
}
function openCharts() {
  if(!state.accounts.length) { toast('A saját méréseidhez előbb jelentkezz be.','Mérési előzmények'); return; }
  openDialog('Minden levélnek története van.',`<p class="dialog-intro">Válassz növényt a részletes grafikonhoz. Csak a ténylegesen eltárolt mérési pontok jelennek meg.</p><div class="history-list">${state.devices.map(m=>`<button class="history-row" data-open-device="${esc(m.key)}"><span class="summary-icon ${m.tone==='dry'?'peach':'sage'}">${icon('leaf')}</span><span><strong>${esc(m.name)}</strong><small>${esc(relativeTime(m.time))} · ${m.plus?m.history.length+' előzmény':'aktuális mérés'}</small></span><b>${m.percent??'—'}%</b>${icon('arrow')}</button>`).join('')||'<p>Még nincs megjeleníthető mérés.</p>'}</div>`,'charts');
}
async function openNotifications() {
  if(!state.accounts.length) { toast('Az értesítésekhez előbb jelentkezz be.','Értesítések'); return; }
  const acc=activeAccount(); selectAccount(acc.uid);
  openDialog('Gondoskodás, emlékeztetővel.',`<p class="dialog-intro">Öntözési és levegőminőségi email-értesítések Plus csomagban. Az öntözési határ a növényhez igazított <strong>35%</strong>, az ismétlési idő legalább <strong>6 óra</strong>.</p>${state.accounts.length>1?`<label class="field-label" for="notifAccount">Fiók</label><select id="notifAccount">${state.accounts.map(a=>`<option value="${esc(a.uid)}" ${a.uid===acc.uid?'selected':''}>${esc(a.email)}</option>`).join('')}</select>`:''}<div id="notificationFormHost"></div><div id="notifModalContent"></div>`,'notifications');
  renderNotificationForm();
  if(!isDemo) {
    try { await loadPushClient(); window.__refreshPushState?.(); }
    catch { const host=$('notifModalContent'); if(host) host.innerHTML='<p class="notice">A telefonos push-beállítás most nem tölthető be. Próbáld meg később.</p>'; }
  } else $('notifModalContent').innerHTML=`<div class="notice">${icon('bell')}Bemutató módban az értesítési beállítások kipróbálhatók. Valódi email vagy push nem kerül kiküldésre.</div>`;
}
function renderNotificationForm() {
  const acc=activeAccount(); if(!acc||!$('notificationFormHost')) return;
  const plus=activePlus(acc.subscription), models=state.devices.filter(m=>m.uid===acc.uid);
  $('notificationFormHost').innerHTML=`${!plus?'<div class="notice">Az email- és push-értesítésekhez aktív Plus csomag szükséges.</div>':''}<form id="notificationForm"><div class="notification-list">${models.map((m,i)=>`<label class="notification-row"><input type="checkbox" name="notify" value="${esc(m.key)}" ${m.data.emailNotifEnabled?'checked':''} ${plus?'':'disabled'}><span><strong>${esc(m.name)}</strong><small>${esc(m.data.emailNotifEmail||'Még nincs értesítési email-cím')}</small></span><span class="switch-track"></span></label>`).join('')}</div><label class="field-label" for="notifEmailInput">Email-cím a kijelölt növényekhez</label><input type="email" id="notifEmailInput" placeholder="${esc(acc.email)}" value="" maxlength="254" ${plus?'':'disabled'}><p class="input-help">Üresen hagyva a meglévő címek maradnak meg. Az újonnan bekapcsolt növényhez add meg a címet.</p><p class="form-status" id="notificationStatus" role="status"></p><button class="button primary full-width" type="submit" ${plus?'':'disabled'}>Értesítések mentése ${icon('check')}</button></form>`;
}
let pushPromise;
function loadPushClient() {
  if(!pushPromise) pushPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/push-client.js?v=20261024.1';script.onload=resolve;script.onerror=()=>{pushPromise=null;reject(new Error('push-load-failed'));};document.body.append(script);});
  return pushPromise;
}
function openPlans() {
  const acc=activeAccount(); if(!acc) { toast('Az előfizetésedhez előbb jelentkezz be.');return; }
  selectAccount(acc.uid); const plus=activePlus(acc.subscription);
  const expires=timestamp(acc.subscription?.expiresAt);
  const planNote=plus?(acc.subscription?.cancelAtPeriodEnd?'Lemondott előfizetés. A hozzáférés a kifizetett időszak végéig megmarad.':'Az előfizetésed aktív.')+(expires?' Fordulónap / hozzáférés vége: '+formatTime(expires)+'.':''):'';
  const makeLink=base=>{const url=new URL(base);url.searchParams.set('client_reference_id',acc.uid);url.searchParams.set('prefilled_email',acc.email);return esc(url.href);};
  openDialog('Több figyelem. Több nyugalom.',`<p class="dialog-intro">${esc(acc.email)} · Jelenlegi csomagod: <strong>${plus?'Plus':'Free'}</strong></p>${state.accounts.length>1?`<label class="field-label" for="planAccount">Fiók</label><select id="planAccount">${state.accounts.map(a=>`<option value="${esc(a.uid)}" ${a.uid===acc.uid?'selected':''}>${esc(a.email)}</option>`).join('')}</select>`:''}${planNote?`<p class="notice">${esc(planNote)}</p>`:''}<div class="plans-grid"><div class="plan-box"><span class="eyebrow">FREE</span><h3>Az alapok, egyszerűen.</h3><div class="price">0 Ft <small>/ hó</small></div><ul><li>Nedvesség és eszközállapot</li><li>Fényerő-szabályozás LED-es eszközön</li><li>Kiegyensúlyozott vízigényű kategória</li><li>Telefonra telepíthető alkalmazás</li></ul></div><div class="plan-box featured"><span class="eyebrow">PLUS</span><h3>Egy lépéssel előrébb.</h3><div class="price">490 Ft <small>/ hó</small></div><ul><li>Az összes vízigény-kategória</li><li>Korábbi mérések grafikonon</li><li>Email-értesítések</li><li>Telefonos push támogatott eszközön</li></ul>${isDemo?'<p class="notice">A bemutatóban nincs valódi fizetés.</p>':plus?'<span class="plan-active">'+icon('check')+'Aktív Plus hozzáférés</span>':`<a class="button primary full-width" href="${makeLink('https://buy.stripe.com/eVq14f2PP3R1bQq7Be0gw01')}" target="_blank" rel="noopener">Havi Plus ${icon('arrow')}</a><a class="button secondary full-width mt" href="${makeLink('https://buy.stripe.com/cNibITfCBafp7AacVy0gw00')}" target="_blank" rel="noopener">Éves Plus · 3999 Ft</a>`}</div></div>${isDemo?'':`<a class="text-button mt" href="https://billing.stripe.com/p/login/cNibITfCBafp7AacVy0gw00" target="_blank" rel="noopener">Előfizetés kezelése, lemondás és számlák ${icon('arrow')}</a>`}<p class="input-help">A havi és az éves előfizetés automatikusan megújul; a Stripe ügyfélportálján lemondható. A fizetést és az előfizetés kezelését a Stripe végzi. Sikeres fizetés után a meglévő előfizetés-szinkron frissíti a hozzáférést.</p>`,'plans');
}
function openHelp() {
  openDialog('Ismerd meg a kis kertedet.',`<div class="help-list"><details open><summary>Mit jelent a két nedvességérték?</summary><p>A <strong>mért nedvesség</strong> az eszköz által küldött 0–100%-os érték. A <strong>növényhez igazított</strong> érték a választott vízigény-tartományhoz viszonyít. Például 40% mért nedvesség a 30–60%-os kategóriában 33%-nak felel meg. Ezt hasonlítja az értesítés a 35%-os határhoz.</p></details><details><summary>Mikor öntözzem meg?</summary><p>Az alacsony érték figyelmeztetés: nézd meg a földet is. A 100%-os igazított érték fölé a kijelzés nem megy; a „Most ne öntözd” jelzés mutatja, ha a mérés a kategória felső határán túl van.</p></details><details><summary>Miért nem frissül percenként?</summary><p>Az eszközök a saját programjuk szerinti időközönként mérnek. A korábbi energiatakarékos eszközök jellemzően 3 óránként küldenek adatot. Az alkalmazás automatikusan megjeleníti az érkező mérést; az oldal újratöltése nem indít új mérést.</p><p>A nyitott alkalmazás az új méréseket előzményként is rögzíti Plus csomagban. Zárt alkalmazásnál csak a háttérrendszer által eltárolt előzmények maradnak meg. 12 óránál régebbi mérés külön jelzést kap. Az eszköz hálózati életjele különbözhet a tényleges mérés idejétől.</p></details><details><summary>Mit tegyek, ha régi a mérés?</summary><p>Ellenőrizd a tápellátást vagy az akkumulátort, az otthoni WiFi-t és a jel erősségét. Szükség esetén indítsd újra az eszközt. A WiFi újrabeállítása az adott firmware beállító módjában történik; a hálózat neve jellemzően <strong>NovenyFigyelo</strong>.</p></details><details><summary>Email és telefonos értesítés</summary><p>Plus csomagban válaszd ki a növényeket és az email-címet. A meglévő szerveres háttérfolyamat küldi az értesítéseket; a nyitott böngésző önmagában nem biztosít háttérküldést. A pushhoz külön engedély és támogatott böngésző kell. iPhone-on előbb telepítsd a kezdőképernyőre.</p></details><details><summary>Offline használat és kijelentkezés</summary><p>A már betöltött alkalmazás és a legutóbbi saját méréseid internet nélkül is megnyithatók. Ilyenkor külön jelzést látsz, vezérelni vagy menteni nem lehet. A kijelentkezés eltávolítja a fiók helyi mérési másolatát.</p></details><details><summary>Új eszköz és több fiók</summary><p>A Firebase-fiókodhoz rendelt eszközök automatikusan megjelennek. Másik meglévő fiókot a Fiók hozzáadása gombbal kapcsolhatsz be. Eszközazonosító beírása önmagában nem ad hozzáférést más fiók adataihoz.</p></details></div><button class="button secondary full-width mt" data-action="install">${icon('phone')}Alkalmazás telepítése</button>`,'help');
}
let installEvent=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); installEvent=e; document.body.classList.add('can-install');});
window.addEventListener('appinstalled',()=>{installEvent=null; toast('A Növényfigyelő már a kezdőképernyődön van.','Telepítve');closeDialog('appDialog');});
function openInstall() {
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  openDialog(standalone?'A kerted már veled van.':'Egy érintésre a kertedtől.',`<div class="install-preview"><div class="app-icon-preview">${icon('leaf')}</div><div><strong>Növényfigyelő</strong><span>Saját ikon. Saját ablak. Egy kis nyugalom.</span></div></div><p class="dialog-intro">${standalone?'Már a telepített alkalmazást használod. A frissítések automatikusan megérkeznek.':'Tedd a telefonod kezdőképernyőjére. Gyorsan megnyithatod, a legutóbbi betöltött adatok offline is elérhetők.'}</p>${standalone?'':installEvent?`<button class="button primary full-width" id="nativeInstall">${icon('download')}Alkalmazás telepítése</button>`:ios?'<ol class="install-steps"><li>Nyisd meg az oldalt a telefonod böngészőjében.</li><li>Koppints a <strong>Megosztás</strong> gombra.</li><li>Válaszd a <strong>Főképernyőhöz adás</strong> lehetőséget, majd a Hozzáadás gombot.</li></ol>':'<ol class="install-steps"><li>Nyisd meg az oldalt Chrome-ban vagy Edge-ben.</li><li>A böngésző menüjében válaszd az <strong>Alkalmazás telepítése</strong> vagy a <strong>Kezdőképernyőhöz adás</strong> lehetőséget.</li><li>Erősítsd meg a telepítést.</li></ol>'}<div class="notice">${icon('info')}A telepítési lehetőséget a böngésző biztosítja. Az értesítésekhez külön engedély szükséges.</div>`,'install','A NÖVÉNYEID MINDIG VELED');
}

async function handleAction(action) {
  if(action==='overview') { closeDialog('appDialog');closeDialog('detailDialog');state.filter='all';scheduleRender();window.scrollTo({top:0,behavior:'smooth'}); }
  else if(action==='charts') openCharts();
  else if(action==='notifications') await openNotifications();
  else if(action==='accounts') openAccounts();
  else if(action==='add-account') openAddAccount();
  else if(action==='plans') openPlans();
  else if(action==='help') openHelp();
  else if(action==='install') openInstall();
  else if(action==='attention') {setFilter('attention');$('plantsTitle').scrollIntoView({behavior:'smooth',block:'start'});}
  else if(action==='exit-demo') location.href='/';
  else if(action==='logout') { if(isDemo) {location.href='/';return;} await store.logout();closeDialog('appDialog');toast('A helyi mérési másolatokat is eltávolítottuk.','Kijelentkezve'); }
}
document.addEventListener('click',async e=> {
  const close=e.target.closest('[data-close]'); if(close) {closeDialog(close.dataset.close);return;}
  const action=e.target.closest('[data-action]'); if(action) {try{await handleAction(action.dataset.action);}catch(error){toast(errorText(error),'A művelet nem sikerült',true);}return;}
  const filter=e.target.closest('[data-filter]');if(filter){setFilter(filter.dataset.filter);return;}
  const detail=e.target.closest('[data-device-action]');if(detail){openDetail(detail.closest('.plant-card').dataset.key);return;}
  const history=e.target.closest('[data-open-device]');if(history){openDetail(history.dataset.openDevice);return;}
  const range=e.target.closest('[data-range]');if(range){state.range=range.dataset.range;updateDetail();return;}
  const eye=e.target.closest('[data-password]');if(eye){const input=$(eye.dataset.password);const show=input.type==='password';input.type=show?'text':'password';eye.setAttribute('aria-label',show?'Jelszó elrejtése':'Jelszó megjelenítése');eye.setAttribute('aria-pressed',String(show));return;}
  const remove=e.target.closest('[data-remove-account]');if(remove){remove.disabled=true;try{if(isDemo){toast('A bemutató fiókhoz nem tartozik valódi bejelentkezés.','Bemutató');return;}await store.removeAccount(remove.dataset.removeAccount);state.accounts.length?openAccounts():closeDialog('appDialog');}catch(error){toast(errorText(error),'Nem sikerült kijelentkezni',true);}finally{remove.disabled=false;}return;}
  if(e.target.closest('#nativeInstall')&&installEvent){const event=installEvent;installEvent=null;await event.prompt();closeDialog('appDialog');}
});
document.addEventListener('input',e=>{if(e.target.matches('.led-slider')){e.target.style.setProperty('--value',e.target.value+'%');e.target.closest('label').querySelector('output').textContent=e.target.value+'%';}});
document.addEventListener('change',e=>{if(e.target.matches('.led-slider'))saveLed(e.target);if(e.target.id==='notifAccount'){selectAccount(e.target.value);renderNotificationForm();window.__refreshPushState?.();}if(e.target.id==='planAccount'){selectAccount(e.target.value);openPlans();}});

async function runForm(form,statusId,fn) {
  const submit=form.querySelector('[type="submit"]'),status=$(statusId);submit.disabled=true;submit.setAttribute('aria-busy','true');status.classList.remove('error');status.textContent=form.id==='loginForm'||form.id==='addAccountForm'?'Bejelentkezés…':'Mentés folyamatban…';
  try {await fn();if(status.isConnected)status.textContent='';}catch(error){status.textContent=errorText(error);status.classList.add('error');}finally{submit.disabled=false;submit.removeAttribute('aria-busy');}
}
document.addEventListener('submit',async e=>{
  const form=e.target;
  if(form.id==='loginForm') {e.preventDefault();await runForm(form,'loginStatus',async()=>{await loadBackend();await store.login($('email').value,$('password').value);$('password').value='';});}
  else if(form.id==='addAccountForm') {e.preventDefault();await runForm(form,'addAccountStatus',async()=>{if(isDemo){toast('Valódi fiókot a bemutatóból kilépve adhatsz hozzá.','Bemutató');return;}await store.login($('extraEmail').value,$('extraPassword').value,true);closeDialog('appDialog');toast('A fiók növényei automatikusan betöltődnek.','Fiók hozzáadva');});}
  else if(form.id==='deviceSettings') {e.preventDefault();await runForm(form,'settingsStatus',async()=>{const m=modelFor(state.selected);if(!m)throw new Error('Az eszköz már nem érhető el.');const name=$('plantName').value.trim(),category=$('plantCategory').value;if(!name)throw new Error('Adj nevet a növényednek.');const patch={};if(name!==m.name)patch.displayName=name;if(category!==m.category.key){if(!m.plus&&category!==DEFAULT_CATEGORY.key)throw new Error('Ehhez a kategóriához Plus csomag szükséges.');patch.plantType=category;}if(Object.keys(patch).length)await store.saveDevice(m.uid,m.id,patch);toast('A növény beállításait elmentettük.');closeDialog('detailDialog');});}
  else if(form.id==='notificationForm') {e.preventDefault();await runForm(form,'notificationStatus',async()=>{const acc=activeAccount();if(!activePlus(acc?.subscription))throw new Error('Aktív Plus csomag szükséges.');const email=$('notifEmailInput').value.trim(), selected=new Set([...form.querySelectorAll('[name="notify"]:checked')].map(c=>c.value)),models=state.devices.filter(m=>m.uid===acc.uid);
    for(const m of models) if(selected.has(m.key)&&!(email||String(m.data.emailNotifEmail||'').trim()))throw new Error('A bekapcsolt növényekhez adj meg email-címet.');
    const results=await Promise.allSettled(models.map(m=>{const enabled=selected.has(m.key),patch={emailNotifEnabled:enabled,emailNotifCooldownMs:COOLDOWN_MS};if(enabled&&email)patch.emailNotifEmail=email;return store.saveDevice(m.uid,m.id,patch);}));
    if(results.some(r=>r.status==='rejected'))throw new Error('Nem sikerült minden növényt menteni. A sikeres módosítások megmaradtak; ellenőrizd újranyitva az értesítéseket.');closeDialog('appDialog');toast('Az email-értesítési beállításokat elmentettük.');
  });}
});
window.addEventListener('online',()=>{renderConnection();store?.refresh?.().catch(()=>{});});
window.addEventListener('offline',renderConnection);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){scheduleRender();}});
setInterval(()=>{if(!document.hidden)scheduleRender();},60000);

async function loadBackend() {
  if(isDemo)return;
  if(!backendPromise)backendPromise=import('./firebase-app.js').then(async({PlantStore})=>{store=new PlantStore(setData,error=>{console.warn('Növényfigyelő kapcsolat:',error?.code||'connection-error');});await store.start();return store;}).catch(error=>{backendPromise=null;throw error;});
  return backendPromise;
}
function demoData() {
  const now=Date.now(),uid='demo-account',email='kertem@bemutato.hu',subscription={plan:'plus',status:'active'};
  const histories=[ [47,49,45,57,63,70,68,74,79,84], [45,42,38,35,29,26,23,20,17,13], [62,65,61,56,59,63,68,66,62,58] ];
  const rawDevices={
    'monstera_01':{displayName:'Monstera',plantType:CATEGORIES[2].key,sensorValue:55,lastMeasurementAt:now-22*60000,ledLevel:60,emailNotifEnabled:true,emailNotifEmail:email},
    'kaktusz_02':{displayName:'Kis tüskés',plantType:CATEGORIES[0].key,sensorValue:14,lastMeasurementAt:now-68*60000,batteryPercent:76,emailNotifEnabled:true,emailNotifEmail:email},
    'fikusz_03':{displayName:'Fikusz',plantType:CATEGORIES[2].key,sensorValue:47,lastMeasurementAt:now-41*60000,batteryPercent:92,airQuality:{aqi:2,tvoc:124,eco2:486,updatedAt:now-41*60000},emailNotifEnabled:false}
  };
  Object.values(rawDevices).forEach((data,index)=>{data.history=Object.fromEntries(histories[index].map((v,i)=>[now-(10-i)*3*3600000,v]));});
  function emit(){setData({ready:true,accounts:[{uid,email,subscription,connected:true,loaded:true,cached:false}],devices:Object.entries(rawDevices).map(([id,d])=>deviceModel(uid,email,id,d,subscription))});}
  store={async saveDevice(account,id,patch){Object.assign(rawDevices[id],patch);emit();}, selectAccount(){}, async refresh(){emit();}};
  emit();state.notificationUid=uid;
}
if(isDemo)demoData();
else {
  const timer=setTimeout(()=>{if(!state.ready){$('loginStatus').textContent='A kapcsolat lassabban épül fel. A bemutató közben is megnyitható; belépéskor újra próbálkozunk.';$('loginSubmit').disabled=false;}},12000);
  loadBackend().then(()=>{clearTimeout(timer);$('loginStatus').textContent='';$('loginSubmit').disabled=false;if(location.hash==='#plans'&&state.accounts.length)openPlans();}).catch(()=>{clearTimeout(timer);$('loginStatus').textContent='A belépési szolgáltatás most nem tölthető be. Ellenőrizd az internetet, majd frissítsd az oldalt.';$('loginStatus').classList.add('error');$('loginSubmit').disabled=false;renderConnection();});
}
render();
