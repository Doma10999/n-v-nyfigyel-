import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const scripts=['app.js','core.js','firebase-app.js','push-client.js','service-worker.js','service-worker-register.js','assets/visuals.js'];
for(const script of scripts){const result=spawnSync(process.execPath,['--check',script],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
const html=await readFile('index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw new Error('Duplicate static HTML ids');
for(const file of ['styles.css','manifest.json','pwa-icon-192.png','pwa-icon-512.png','pwa-maskable-512.png'])await access(file);
const manifest=JSON.parse(await readFile('manifest.json','utf8'));if(!manifest.icons.some(i=>i.purpose==='maskable'))throw new Error('Missing maskable icon');
console.log('JavaScript syntax, static HTML ids and PWA assets: OK');
