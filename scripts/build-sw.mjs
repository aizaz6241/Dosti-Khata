// Build ke baad: service worker mein saari files ki list aur naya version daal do
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dist = path.resolve('dist');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push('/' + path.relative(dist, p).split(path.sep).join('/'));
  }
})(dist);
const list = ['/', ...files.filter((f) => f !== '/sw.js' && f !== '/index.html' && !f.startsWith('/screenshots/'))];
const hash = crypto.createHash('sha1').update(list.join('|') + fs.readFileSync(path.join(dist, 'index.html'))).digest('hex').slice(0, 10);
const swPath = path.join(dist, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('__VERSION__', hash).replace('__PRECACHE__', JSON.stringify(list)));
console.log(`sw.js: ${list.length} files, version ${hash}`);
