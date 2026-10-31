import {mkdir,rm,copyFile,cp} from 'node:fs/promises';
// Only browser assets are published. Server scripts and backups stay out of dist.
const files=['index.html','styles.css','dashboard.css','dashboard.js','firebase-app.js','history-chart.js','notifications.js','plant-type-modal.js','push-client.js','offline-status.js','service-worker-register.js','service-worker.js','manifest.json','offline.html','payment.html','payment.js','payment-success.html','icon.png','icon2.png','wifino.png','pwa-icon-192.png','pwa-icon-512.png','_headers'];
await rm('dist',{recursive:true,force:true}); await mkdir('dist');
for(const file of files) await copyFile(file,`dist/${file}`);
await cp('batteryPercent','dist/batteryPercent',{recursive:true});
console.log(`Built ${files.length} public assets plus battery icons.`);
