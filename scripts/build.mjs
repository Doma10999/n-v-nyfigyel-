import { mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'dist');
await mkdir(out,{recursive:true});
for(const file of await readdir(out)) await rm(join(out,file),{recursive:true,force:true});
// Explicit public-file allowlist. Source notes, Apps Script code, tests and old backups are not deployed.
const files=['index.html','app.js','core.js','firebase-app.js','styles.css','push-client.js','service-worker.js','service-worker-register.js','manifest.json','offline.html','payment.html','payment-success.html','pwa-icon-192.png','pwa-icon-512.png','pwa-maskable-512.png'];
for(const file of files)await copyFile(join(root,file),join(out,file));
await mkdir(join(out,'assets'),{recursive:true});
for(const file of ['app-icon.svg','visuals.js'])await copyFile(join(root,'assets',file),join(out,'assets',file));
await copyFile(join(root,'_headers'),join(out,'_headers'));
await copyFile(join(root,'_redirects'),join(out,'_redirects'));
console.log(`Built ${files.length+4} public files in dist/`);
