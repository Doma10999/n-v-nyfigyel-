const paths = {
  leaf: '<path d="M19 4c-8-1-15 2-15 8a7 7 0 0 0 7 7c7 0 9-7 8-15Z"/><path d="m5 20 9-10M9 15V9m0 6h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  chart: '<path d="M4 3v17h17M7 14l4-5 4 3 6-7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  drop: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  battery: '<rect x="2" y="6" width="18" height="12" rx="3"/><path d="M23 10v4M6 10v4m4-4v4m4-4v4"/>',
  plug: '<path d="M8 3v4m8-4v4M6 7h12v4a6 6 0 0 1-12 0V7Zm6 10v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r=".5"/>',
  offline: '<path d="m3 3 18 18M2 8a16 16 0 0 1 5-3m4-1a16 16 0 0 1 11 4M5 12a11 11 0 0 1 7-2m4 1a11 11 0 0 1 3 1m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r=".5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h14"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v.1"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>'
};
export function icon(name, cls = '') { return `<svg class="icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`; }
export function plantIllustration(kind = 'monstera', suffix = '') {
  // Original, lightweight vector artwork: no stock image requests or animation library.
  const uid = String(suffix).replace(/[^a-zA-Z0-9]/g, '');
  const pot = `<ellipse cx="120" cy="218" rx="64" ry="8" fill="#213f2d" opacity=".08"/><path d="m76 154 10 58c2 10 66 10 68 0l10-58Z" fill="${kind==='cactus'?'#dbb699':kind==='ficus'?'#c2cabc':'#e4cbb5'}"/><path d="m84 160 9 51c1 6 27 6 27 6v-57" fill="#fff" opacity=".18"/><rect x="72" y="148" width="96" height="17" rx="6" fill="${kind==='cactus'?'#e7c6aa':kind==='ficus'?'#cfd6ca':'#eedaca'}"/>`;
  let leaves;
  if (kind === 'cactus') leaves = `<path d="M104 151V58a16 16 0 0 1 32 0v93" fill="#638e6a"/><path d="M104 118H86a20 20 0 0 1-20-20V79a10 10 0 0 1 20 0v18h18m32-1h15V69a10 10 0 0 1 20 0v28a19 19 0 0 1-19 19h-16" fill="#7fa481"/><path d="M116 55v92m11-85v85M76 83v20m84-28v29" stroke="#d4dfbe" stroke-width="2" fill="none"/><g stroke="#e4e9cc" stroke-width="2"><path d="m106 72-5-3m33 14 5-3m-33 26-5-3m33 30 5-3M71 91l-6-2m98 1 6-2"/></g><path d="M118 45c-15-7-8-18 1-8 7-13 17-6 4 7" fill="#d79c86"/>`;
  else if (kind === 'ficus') leaves = `<path d="M120 155V40m0 72-28-24m28-4 24-27m-24 83 33-23" stroke="#677b4b" stroke-width="4" fill="none"/><g><path d="M119 64C93 60 93 23 112 14c21 18 25 40 7 50" fill="#567957"/><path d="M115 103C85 110 60 77 67 55c32 0 58 19 48 48" fill="#77966d"/><path d="M123 87c-3-32 22-59 47-52 1 32-20 54-47 52" fill="#3d6850"/><path d="M119 141c-35 3-58-18-57-45 38-2 62 18 57 45" fill="#3d6850"/><path d="M126 133c0-33 28-54 57-41-6 35-30 45-57 41" fill="#86a37a"/></g><g stroke="#d8e2c8" opacity=".5" fill="none"><path d="m116 58-5-34m0 70L75 64m57 15 30-35m-52 86-39-26m67 19 36-24"/></g>`;
  else leaves = `<path d="M120 155c2-54-18-76-7-116m7 104c26-44 43-51 44-69m-47 51C83 88 77 74 74 63" stroke="#718653" stroke-width="3.5" fill="none"/><g fill="#456b4d"><path d="M111 83c-36-1-49-31-31-55 23-21 53 1 50 26l-14-9 3 14 12 8c-2 8-8 14-15 16l-8-16-5-2Z"/><path d="M119 125c3-32 27-58 53-46 25 10 22 43-6 54l2-17-10 5-2 16c-9 1-17-1-23-6l12-14-11 3Z"/></g><path d="M89 117c-36 7-58-22-41-48 16-17 37-10 48 11L81 82l12 8 9-4c3 9 2 18-5 25l-15-7 4 12Z" fill="#84a174"/><path d="M134 75c-3-26 12-48 34-43 24 7 25 32 3 48l-3-13-7 7 1 9c-6 1-14-1-20-5l8-10-8 2Z" fill="#a1b58b"/><path d="m113 78-11-39m37 82 29-31M88 106 58 78m84-7 21-28" stroke="#c9d7b8" stroke-width="1.3" fill="none" opacity=".75"/>`;
  return `<svg class="plant-art" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g class="plant-foliage">${leaves}</g>${pot}</svg>`;
}
