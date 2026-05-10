// Smoke test the parsers against the real sample PDFs in the repo root.
// Usage: node scripts/smoke.mjs
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSignupRef } from '../src/utils/parseSignup.js';
import { parseBlockReport } from '../src/utils/parseBlocks.js';
import { joinData } from '../src/utils/joinData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

async function extractTextLines(filePath) {
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
      .filter((it) => typeof it.str === 'string' && it.str.length)
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: Math.round(it.transform[5]),
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let curY = null;
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const line = buf
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) lines.push(line);
      buf = [];
    };
    for (const it of items) {
      if (curY === null) curY = it.y;
      if (Math.abs(it.y - curY) > 2) {
        flush();
        curY = it.y;
      }
      buf.push(it);
    }
    flush();
  }
  return lines;
}

async function run() {
  const signupFiles = [
    '26JUN STC Signup Reference - Weekday (1).pdf',
    '26JUN STC Signup Reference - Saturday.pdf',
    '26JUN STC Signup Reference - Sunday.pdf',
  ];
  const blockFiles = [
    '26JUN STC MF BLOCK REPORTS.pdf',
    '26JUN STC SAT BLOCK REPORTS.pdf',
    '26JUN STC SUN BLOCK REPORTS.pdf',
  ];

  const signups = [];
  for (const f of signupFiles) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    console.log(`\n[signup] ${f}`);
    const lines = await extractTextLines(p);
    const parsed = parseSignupRef(lines, f);
    parsed.file_name = f;
    signups.push(parsed);
    console.log(`  kind=${parsed.signup_kind} duties=${parsed.duties.length}`);
    if (parsed.duties.length) {
      console.log('  sample:', JSON.stringify(parsed.duties[0], null, 2).slice(0, 500));
    }
  }

  const blockReports = [];
  for (const f of blockFiles) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    console.log(`\n[block] ${f}`);
    const lines = await extractTextLines(p);
    const parsed = parseBlockReport(lines, f);
    parsed.file_name = f;
    blockReports.push(parsed);
    const totalTrips = parsed.blocks.reduce((a, b) => a + b.trips.length, 0);
    console.log(
      `  service=${parsed.service_group} blocks=${parsed.blocks.length} trips=${totalTrips}`,
    );
    if (parsed.blocks.length) {
      const sample = parsed.blocks[0];
      console.log(
        `  sample block: ${sample.line_group}-${sample.block_number} (${sample.trips.length} trips)`,
      );
      console.log(`  first trip:`, sample.trips[0]);
    }
  }

  const duties = joinData(signups, blockReports);
  console.log(`\n[joined] total duties=${duties.length}`);
  const sample = duties.slice(0, 3);
  for (const d of sample) {
    console.log(
      `  Duty #${d.daily_duty_number} (roster ${d.roster_number}, ${d.duty_type}) ${d.start_location} → ${d.end_location} | paid=${d.paid_min}m working=${d.working_min}m bonus=${d.bonus_min}m driving=${d.driving_min}m deadhead=${d.deadhead_min}m layover=${d.layover_min}m segs=${d.pieces_enriched.reduce((a, p) => a + p.segments.length, 0)} routes=[${d.routes.join(',')}]`,
    );
  }

  // Sanity counts.
  const missingBlocks = duties.filter((d) =>
    d.pieces_enriched.some((p) => !p.block_found),
  );
  console.log(
    `\nDuties missing at least one block: ${missingBlocks.length} / ${duties.length}`,
  );
  if (missingBlocks.length) {
    for (const d of missingBlocks.slice(0, 5)) {
      const missing = d.pieces_enriched
        .filter((p) => !p.block_found)
        .map((p) => `${p.piece.line_group}-${p.piece.block_number}`)
        .join(', ');
      console.log(`  - Duty ${d.id}: missing ${missing}`);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
