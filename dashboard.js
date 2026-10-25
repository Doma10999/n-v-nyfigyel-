(() => {
  'use strict';
  const root = document.documentElement;
  try { root.dataset.theme = localStorage.getItem('garden-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch {}
  const theme = document.getElementById('themeToggle');
  theme.onclick = () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('garden-theme', root.dataset.theme); } catch {} theme.setAttribute('aria-pressed', String(root.dataset.theme === 'dark')); };
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
  function connectionState() { const offline = !navigator.onLine; connection.dataset.state = offline ? 'offline' : connected ? 'online' : 'connecting'; connection.textContent = offline ? 'Nincs internet' : connected ? 'Adatkapcsolat aktív' : 'Kapcsolódás…'; }
  ['online','offline'].forEach(name => window.addEventListener(name, connectionState)); connectionState();
  function bindConnection() { if(window.__db && window.__onValue) { window.__onValue(window.__ref(window.__db, '.info/connected'), snap => { connected = snap.val() === true; connectionState(); }); return true; } return false; }
  window.addEventListener('app-content-ready', bindConnection, {once:true});
  const search = document.getElementById('plantSearch');
  function overview() {
    const cards = [...document.querySelectorAll('#accountsContainer .device-card')];
    const authenticated = document.body.classList.contains('is-authenticated');
    document.getElementById('gardenOverview').hidden = !authenticated;
    document.getElementById('sessionLogout').hidden = !authenticated;
    document.getElementById('plantCount').textContent = cards.length;
    document.getElementById('statTotal').textContent = cards.length;
    document.getElementById('statAttention').textContent = cards.filter(c => c.classList.contains('needs-attention')).length;
    document.getElementById('statStale').textContent = cards.filter(c => c.classList.contains('measurement-stale')).length;
    const term = search.value.trim().toLocaleLowerCase('hu');
    cards.forEach(c => { c.hidden = !c.querySelector('.plant-title')?.textContent.toLocaleLowerCase('hu').includes(term); });
    document.getElementById('emptyPlants').hidden = cards.length > 0;
    document.getElementById('noSearchResults').hidden = !cards.length || cards.some(c => !c.hidden);
  }
  let frame;
  const schedule = () => { if(!frame) frame = requestAnimationFrame(() => { frame = 0; overview(); }); };
  new MutationObserver(schedule).observe(document.getElementById('accountsContainer'), {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','data-level']});
  new MutationObserver(schedule).observe(document.body, {attributes:true, attributeFilter:['class']});
  search.addEventListener('input', overview);
  document.getElementById('sessionLogout').onclick = () => document.getElementById('logout').click();
  setInterval(() => { if(document.hidden) return; document.querySelectorAll('[data-last-update]').forEach(el => { const ts = Number(el.dataset.timestamp); el.closest('.card')?.classList.toggle('measurement-stale', !ts || Date.now()-ts > 21600000); }); schedule(); }, 60000);
  // Keyboard support for the existing category picker and modal close controls.
  new MutationObserver(() => document.querySelectorAll('.plant-select:not([tabindex])').forEach(el => { el.tabIndex = 0; el.setAttribute('role','button'); el.setAttribute('aria-label','Növény vízigényének kiválasztása'); el.onkeydown = e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }; })).observe(document.getElementById('accountsContainer'), {childList:true,subtree:true});
  const icons = {addAccountBtn:'M12 5v14M5 12h14',notifBellBtn:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',chartsBtn:'M4 4v16h16M7 14l4-5 4 3 5-7',paymentBtn:'M3 5h18v14H3zM3 9h18M7 15h3',infoBtn:'M12 11v6M12 7v.1'};
  for(const [id,path] of Object.entries(icons)) document.getElementById(id).innerHTML = `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  overview();
})();
