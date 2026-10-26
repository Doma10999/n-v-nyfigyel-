(() => {
  'use strict';
  const root = document.documentElement;
  // This design deliberately opens in light mode, independently of the phone theme.
  root.dataset.theme = 'light';
  const theme = document.getElementById('themeToggle');
  try { root.dataset.motion = localStorage.getItem('garden-motion') || 'on'; localStorage.setItem('garden-theme', 'light'); } catch {}
  function motionLabel() {
    const enabled = root.dataset.motion !== 'off';
    theme.setAttribute('aria-pressed', String(enabled));
    theme.setAttribute('aria-label', enabled ? 'Animációk kikapcsolása' : 'Animációk bekapcsolása');
  }
  theme.onclick = () => {
    root.dataset.motion = root.dataset.motion === 'off' ? 'on' : 'off';
    try { localStorage.setItem('garden-motion', root.dataset.motion); } catch {}
    motionLabel();
  };
  motionLabel();
  let installPrompt;
  const install = document.getElementById('installApp');
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  install.hidden = standalone();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; install.hidden = false; });
  window.addEventListener('appinstalled', () => { installPrompt = null; install.hidden = true; });
  install.onclick = async () => {
    if (installPrompt) { const prompt = installPrompt; installPrompt = null; await prompt.prompt(); await prompt.userChoice; return; }
    const backdrop = document.createElement('div'); backdrop.className = 'install-dialog';
    backdrop.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="installTitle"><h2 id="installTitle">A kerted, egy érintésre.</h2><p>Android: a Chrome menüjében válaszd a „Telepítés” vagy „Hozzáadás a kezdőképernyőhöz” lehetőséget.</p><p>iPhone: nyisd meg Safariban, majd Megosztás → Hozzáadás a Főképernyőhöz → Hozzáadás.</p><p>Az alkalmazás külön ablakban indul. Internet nélkül a korábban mentett adatokat láthatod; az eszközök vezérléséhez internet kell.</p><button type="button">Értem</button></div>';
    document.body.append(backdrop); const button = backdrop.querySelector('button'); button.focus();
    const close = () => { backdrop.remove(); document.removeEventListener('keydown', key); install.focus(); };
    const key = event => { if(event.key === 'Escape') close(); if(event.key === 'Tab') { event.preventDefault(); button.focus(); } };
    document.addEventListener('keydown', key); button.onclick = close; backdrop.onclick = e => { if(e.target === backdrop) close(); };
  };
  let connected = false;
  const connection = document.getElementById('connectionState');
  function connectionState() { const offline = !navigator.onLine; connection.dataset.state = offline ? 'offline' : connected ? 'online' : 'connecting'; connection.textContent = offline ? 'Nincs internet' : connected ? 'Adatkapcsolat aktív' : document.body.classList.contains('is-authenticated') ? 'Kapcsolódás…' : 'Bejelentkezésre vár'; }
  ['online','offline'].forEach(name => window.addEventListener(name, connectionState)); connectionState();
  function bindConnection() { if(window.__db && window.__onValue) { window.__onValue(window.__ref(window.__db, '.info/connected'), snap => { connected = snap.val() === true; connectionState(); }); return true; } return false; }
  window.addEventListener('app-content-ready', bindConnection, {once:true});
  const search = document.getElementById('plantSearch');
  let activeFilter = 'all';
  const filters = [...document.querySelectorAll('[data-filter]')];
  filters.forEach(button => button.onclick = () => { activeFilter = button.dataset.filter; overview(); });
  function overview() {
    connectionState();
    const cards = [...document.querySelectorAll('#accountsContainer .device-card')];
    const authenticated = document.body.classList.contains('is-authenticated');
    if(!authenticated) activeFilter = 'all';
    document.getElementById('gardenOverview').hidden = !authenticated;
    document.getElementById('sessionLogout').hidden = !authenticated;
    document.querySelector('.plant-search').hidden = cards.length < 4;
    const attention = cards.filter(c => c.classList.contains('needs-attention')).length;
    document.getElementById('gardenOverview').dataset.attention = attention > 0 ? 'yes' : 'no';
    document.getElementById('plantCount').textContent = cards.length;
    document.getElementById('statTotal').textContent = cards.length;
    document.getElementById('statAttention').textContent = cards.filter(c => c.classList.contains('needs-attention')).length;
    document.getElementById('statStale').textContent = cards.filter(c => c.classList.contains('measurement-stale')).length;
    const term = cards.length < 4 ? '' : search.value.trim().toLocaleLowerCase('hu');
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === activeFilter)));
    cards.forEach(c => {
      const matchesStatus = activeFilter === 'all' || activeFilter === 'attention' && c.classList.contains('needs-attention') || activeFilter === 'stale' && c.classList.contains('measurement-stale');
      c.hidden = !matchesStatus || !c.querySelector('.plant-title')?.textContent.toLocaleLowerCase('hu').includes(term);
    });
    document.getElementById('emptyPlants').hidden = cards.length > 0;
    document.getElementById('noSearchResults').hidden = !cards.length || cards.some(c => !c.hidden);
  }
  let frame;
  const schedule = () => { if(!frame) frame = requestAnimationFrame(() => { frame = 0; overview(); }); };
  new MutationObserver(records => { if (records.some(record => !(record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest('.gauge-value'))) schedule(); }).observe(document.getElementById('accountsContainer'), {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','data-level']});
  new MutationObserver(schedule).observe(document.body, {attributes:true, attributeFilter:['class']});
  search.addEventListener('input', overview);
  document.getElementById('sessionLogout').onclick = () => document.getElementById('logout').click();
  setInterval(() => { if(document.hidden) return; document.querySelectorAll('[data-last-update]').forEach(el => { const ts = Number(el.dataset.timestamp); el.closest('.card')?.classList.toggle('measurement-stale', !ts || Date.now()-ts > 21600000); }); schedule(); }, 60000);
  // Keyboard support for the existing category picker and modal close controls.
  new MutationObserver(() => document.querySelectorAll('.plant-select:not([tabindex])').forEach(el => { el.tabIndex = 0; el.setAttribute('role','button'); el.setAttribute('aria-label','Növény vízigényének kiválasztása'); el.onkeydown = e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }; })).observe(document.getElementById('accountsContainer'), {childList:true});
  const icons = {addAccountBtn:'M12 5v14M5 12h14',notifBellBtn:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',chartsBtn:'M4 4v16h16M7 14l4-5 4 3 5-7',paymentBtn:'M3 5h18v14H3zM3 9h18M7 15h3',infoBtn:'M12 11v6M12 7v.1',menuBtn:'M4 6h16M4 12h16M4 18h16'};
  for(const [id,path] of Object.entries(icons)) document.getElementById(id).innerHTML = `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  // Observe cards without animating elements outside the viewport.
  const motionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.classList.toggle('motion-visible', entry.isIntersecting);
  }, {rootMargin: '40px'});
  const observeCards = () => document.querySelectorAll('.device-card:not([data-motion-observed])').forEach(card => {
    card.dataset.motionObserved = 'true'; motionObserver.observe(card);
    card.querySelector('.led-slider')?.addEventListener('input', event => {
      const value = event.target.value;
      event.target.style.setProperty('--slider-progress', value + '%');
      const output = card.querySelector('.led-output');
      if(output) output.textContent = value + '%';
    });
  });
  new MutationObserver(observeCards).observe(document.getElementById('accountsContainer'), {childList:true});
  observeCards();
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('page-hidden', document.hidden));
  const menuButton = document.getElementById('menuBtn');
  document.getElementById('homeTab').onclick = () => {
    if(document.body.classList.contains('menu-open')) menuButton.click();
    search.value = ''; activeFilter = 'all'; overview();
    window.scrollTo({top:0, behavior:root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  };
  document.getElementById('menuShade').onclick = () => { if(document.body.classList.contains('menu-open')) menuButton.click(); };
  document.getElementById('chartsBtn').tabIndex = 0;

  function syncMenuState() {
    const open = document.body.classList.contains('menu-open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Menü bezárása' : 'Menü megnyitása');
    menuButton.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="${open ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'}"/></svg>`;
    for(const id of ['addAccountBtn','notifBellBtn','paymentBtn','infoBtn']) {
      document.getElementById(id).tabIndex = open ? 0 : -1;
    }
  }
  new MutationObserver(syncMenuState).observe(document.body, {attributes:true, attributeFilter:['class']});
  window.addEventListener('DOMContentLoaded', syncMenuState, {once:true});
  document.addEventListener('keydown', event => { if(event.key === 'Escape' && document.body.classList.contains('menu-open')) menuButton.click(); });
  syncMenuState();
  // Existing dialogs now support keyboard focus, Escape and focus restoration.
  for (const [id, closeId] of [['infoModal','infoModalClose'],['chartsModal','chartsModalClose'],['notifModal','notifModalClose'],['modal','modalClose'],['confirmModal','confirmClose'],['plantTypeModal','plantTypeClose']]) {
    const overlay = document.getElementById(id), close = document.getElementById(closeId);
    const panel = overlay.querySelector('.modal-box') || overlay.firstElementChild;
    panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.tabIndex = -1;
    const heading = panel.querySelector('h3');
    if(heading) { heading.id ||= id + 'Title'; panel.setAttribute('aria-labelledby', heading.id); }
    if(close.tagName !== 'BUTTON') { close.tabIndex = 0; close.setAttribute('role','button'); close.setAttribute('aria-label','Bezárás'); close.onkeydown = e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close.click(); } }; }
    let wasOpen = false, returnFocus;
    const focusable = () => [...panel.querySelectorAll('button,input,select,[tabindex="0"],a[href]')].filter(el => !el.disabled && el.getClientRects().length);
    const sync = () => {
      const open = getComputedStyle(overlay).display !== 'none';
      if(open && !wasOpen) { returnFocus = document.activeElement; (focusable()[0] || panel).focus(); }
      if(!open && wasOpen) { (returnFocus?.getClientRects().length ? returnFocus : menuButton).focus(); }
      wasOpen = open;
    };
    new MutationObserver(sync).observe(overlay,{attributes:true,attributeFilter:['style','class']});
    overlay.addEventListener('keydown', e => {
      if(e.key === 'Escape') { e.stopPropagation(); close.click(); }
      if(e.key === 'Tab') { const items = focusable(), first = items[0], last = items.at(-1); if(!first) { e.preventDefault(); panel.focus(); } else if(e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); } else if(!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    sync();
  }
  overview();
})();
