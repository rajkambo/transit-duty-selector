import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';

const file = process.argv[2];
const limit = Number(process.argv[3] || 1);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
const N = Math.min(doc.numPages, limit);
for (let p = 1; p <= N; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items
    .map((i) => ({ str: i.str, x: i.transform[4], y: Math.round(i.transform[5]) }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  let last = null;
  let line = [];
  console.log(`--- PAGE ${p} ---`);
  for (const it of items) {
    if (last === null) last = it.y;
    if (Math.abs(it.y - last) > 2) {
      console.log(line.join(' '));
      line = [];
      last = it.y;
    }
    line.push(it.str);
  }
  if (line.length) console.log(line.join(' '));
}
