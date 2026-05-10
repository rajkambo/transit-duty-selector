import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';

const file = process.argv[2];
const lineGroup = process.argv[3];
const blockNum = process.argv[4];

const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
let curLineGroup = null;
let foundCount = 0;
const samples = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((i) => i.str?.length)
    .map((i) => ({
      str: i.str,
      x: i.transform[4],
      y: Math.round(i.transform[5]),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  let cy = null;
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const line = buf
      .map((x) => x.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) {
      const m = line.match(/SERVICE\s+GROUP:?\s+\S+\s+LINE\s+GROUP:?\s+(\d+)/i);
      if (m) curLineGroup = m[1];
      else if (curLineGroup === lineGroup) {
        const bm = line.match(/^(\d+)\s/);
        if (bm && bm[1] === blockNum) {
          foundCount++;
          if (samples.length < 3) samples.push(line);
        }
      }
    }
    buf = [];
  };
  for (const it of items) {
    if (cy === null) cy = it.y;
    if (Math.abs(it.y - cy) > 2) {
      flush();
      cy = it.y;
    }
    buf.push(it);
  }
  flush();
}
console.log(`line_group=${lineGroup} block=${blockNum} found_rows=${foundCount}`);
for (const s of samples) console.log('  ', s);
