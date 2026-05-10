// One-off inspector for duty 1281 (the case in the bug report).
// Prints all segments for each piece so we can confirm POT, PIT, and
// the corrected mid-time-blank trips all appear with sensible values.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSignupRef } from '../src/utils/parseSignup.js';
import { parseBlockReport } from '../src/utils/parseBlocks.js';
import { joinData } from '../src/utils/joinData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

async function extract(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({
    data,
    disableWorker: true,
  }).promise;
  const lines = [];
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
    for (const it of items) {
      if (cy === null) cy = it.y;
      if (Math.abs(it.y - cy) > 2) {
        lines.push(
          buf
            .map((x) => x.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        );
        buf = [];
        cy = it.y;
      }
      buf.push(it);
    }
    if (buf.length)
      lines.push(
        buf
          .map((x) => x.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
  }
  return lines;
}

function fmt(min) {
  if (min == null) return '--:--';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const sigLines = await extract(
  path.join(ROOT, '26JUN STC Signup Reference - Weekday (1).pdf'),
);
const mfLines = await extract(
  path.join(ROOT, '26JUN STC MF BLOCK REPORTS.pdf'),
);
const sigParsed = parseSignupRef(sigLines, 'weekday');
const mfParsed = parseBlockReport(mfLines, 'MF');

const duties = joinData([sigParsed], [mfParsed]);
const d = duties.find((x) => x.roster_number === '1281');
if (!d) {
  console.log('not found');
  process.exit(1);
}
console.log(
  `Duty #${d.daily_duty_number} (Roster ${d.roster_number}, ${d.duty_type})`,
);
console.log(`  ${d.start_location} -> ${d.end_location}`);
console.log(
  `  span=${fmt(d.earliest_start_min)}-${fmt(d.latest_end_min)}  paid=${d.paid_min}m  working=${d.working_min}m`,
);
console.log(
  `  driving=${d.driving_min}m  deadhead=${d.deadhead_min}m  layover=${d.layover_min}m  split=${d.split_break_min}m  sum_d_dh_lo=${d.driving_min + d.deadhead_min + d.layover_min}m`,
);
for (const p of d.pieces_enriched) {
  console.log(
    `  Piece block=${p.piece.line_group}-${p.piece.block_number}  ${p.piece.start_time}->${p.piece.end_time}  found=${p.block_found}`,
  );
  for (const s of p.segments) {
    const meta = s.meta?.kind ? `<${s.meta.kind}>` : '';
    console.log(
      `    [${s.kind}]${meta} ${fmt(s.start)}-${fmt(s.end)} :: ${s.label ?? '(filler)'}`,
    );
  }
}
