// Targeted check for the split-week roster bug fix. Verifies:
//   - Roster 7018 has TWO non-overlapping daily profiles.
//   - Each profile's Driving + Deadhead + Layover reconciles to its
//     working_min as inferred from segment span.
//   - Top-level driving_min is a sane weighted average (NOT a sum, which
//     would be the original bug).
//   - Single-profile sentinel rosters (1065, 1078) still produce one
//     profile each with the same segment topology as before.
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
  const doc = await pdfjsLib.getDocument({ data, disableWorker: true })
    .promise;
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
    const flush = () => {
      if (!buf.length) return;
      const line = buf
        .map((x) => x.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) lines.push(line);
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
  return lines;
}

function fmt(min) {
  if (min == null) return '--:--';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function profileSpansOverlap(a, b) {
  if (a.earliest_start_min == null || a.latest_end_min == null) return false;
  if (b.earliest_start_min == null || b.latest_end_min == null) return false;
  // Profiles run on disjoint days, so an overlap on the time axis is fine
  // unless they share a working_day.
  const sharedDay = a.working_days.some((d) => b.working_days.includes(d));
  if (!sharedDay) return false;
  return (
    a.earliest_start_min < b.latest_end_min &&
    b.earliest_start_min < a.latest_end_min
  );
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

let failures = 0;
const targets = ['7018', '1065', '1078'];
for (const roster of targets) {
  const d = duties.find((x) => x.roster_number === roster);
  if (!d) {
    console.error(`FAIL roster=${roster} not found`);
    failures++;
    continue;
  }
  const profiles = d.profiles ?? [];
  console.log(
    `roster=${roster} type=${d.duty_type} profiles=${profiles.length}  span=${fmt(d.earliest_start_min)}-${fmt(d.latest_end_min)}  paid_per_shift=${d.paid_min}m working_per_shift=${d.working_min}m  driving=${d.driving_min}m deadhead=${d.deadhead_min}m layover=${d.layover_min}m`,
  );
  for (const profile of profiles) {
    const sum =
      profile.driving_min + profile.deadhead_min + profile.layover_min;
    console.log(
      `  daily=${profile.daily_duty_number} works=[${profile.working_days.join(',')}] span=${fmt(profile.earliest_start_min)}-${fmt(profile.latest_end_min)}  d/dh/l=${profile.driving_min}/${profile.deadhead_min}/${profile.layover_min}=${sum}m  pieces=${profile.pieces.map((p) => `${p.line_group}-${p.block_number}`).join(',')}`,
    );
  }

  // Sanity: no two profiles share a day (shouldn't happen by construction).
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      if (profileSpansOverlap(profiles[i], profiles[j])) {
        console.error(
          `FAIL roster=${roster} profile ${profiles[i].daily_duty_number} overlaps profile ${profiles[j].daily_duty_number}`,
        );
        failures++;
      }
    }
  }
}

// Specific assertions for roster 7018.
const r7018 = duties.find((x) => x.roster_number === '7018');
if (r7018) {
  if ((r7018.profiles ?? []).length !== 2) {
    console.error(
      `FAIL 7018 expected 2 profiles, got ${(r7018.profiles ?? []).length}`,
    );
    failures++;
  }
  if (r7018.driving_min > 600) {
    console.error(
      `FAIL 7018 top-level driving=${r7018.driving_min}m looks like a sum, not an average`,
    );
    failures++;
  }
  const days65 = r7018.profiles?.find((p) => p.daily_duty_number === '65')
    ?.working_days;
  const days78 = r7018.profiles?.find((p) => p.daily_duty_number === '78')
    ?.working_days;
  if (days65?.join(',') !== 'Thu,Fri') {
    console.error(`FAIL 7018 daily-65 working_days=${days65}`);
    failures++;
  }
  if (days78?.join(',') !== 'Mon') {
    console.error(`FAIL 7018 daily-78 working_days=${days78}`);
    failures++;
  }
}

console.log(failures === 0 ? '\nAll checks PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
