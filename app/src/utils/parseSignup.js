// Parses a Signup Reference PDF (already extracted to plain-text lines by
// pdfText.js) into the duties[] portion of the target schema.
//
// Two layouts are supported:
//
//  WEEKDAY layout (Mon-Fri columns):
//    "26JUN STC 8363 CWW 37h52 36h12 OFF 363 363 363 363 320 [320-10](...)"
//    Columns: Date Div Roster Type Paid Working Mon Tue Wed Thu Fri Routes Details
//
//  WEEKEND layout (Saturday or Sunday signups):
//    "26JUN STC 1 ESTR STC 5:01 12:10 SCST 6h49 7h44 [312-50](...)"
//    Columns: Date Div Duty Type From Start End To Working Paid Details
//    (Note the swap: working time is BEFORE paid time on this layout.)

const DUTY_DETAIL_RE =
  /\[(\d+)-(\d+)\]\(\s*(\d+)(?:\s*<[^>]*>)?\s*:\s*([A-Z0-9][A-Z0-9 \-]*?)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+([A-Z0-9][A-Z0-9 \-]*?)\s*\)/g;

const WEEKDAY_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function extractPieces(line) {
  const pieces = [];
  for (const m of line.matchAll(DUTY_DETAIL_RE)) {
    pieces.push({
      line_group: m[1],
      block_number: m[2],
      daily_duty_number: m[3],
      start_location: m[4].trim(),
      start_time: m[5].length === 4 ? `0${m[5]}` : m[5],
      end_time: m[6].length === 4 ? `0${m[6]}` : m[6],
      end_location: m[7].trim(),
    });
  }
  return pieces;
}

function parseWeekdayLine(line) {
  // Strip any leading wrapped duty-details so the column regex works.
  const stripped = line.replace(/^(\s*\[[^\]]+\]\([^)]+\)(?:\s*,\s*\[[^\]]+\]\([^)]+\))*)\s*/, '');

  // Date Div Roster Type Paid Working Mon Tue Wed Thu Fri ...
  const head = stripped.match(
    /^\s*\S+\s+\S+\s+(\d{3,5})\s+([A-Z]{2,5})\s+(\d+h\d{1,2})\s+(\d+h\d{1,2})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\b/,
  );
  if (!head) return null;

  const [, roster, dutyType, paidTime, workingTime, mon, tue, wed, thu, fri] = head;
  const dayCols = [mon, tue, wed, thu, fri];
  // days_off is scoped to the days this signup actually covers (Mon-Fri
  // for weekday). Sat/Sun are not represented here because the weekday
  // signup PDF doesn't document them — drivers pick a separate Saturday
  // and Sunday duty for the weekend if they want to work those days.
  const days_off = [];
  WEEKDAY_DAY_LABELS.forEach((label, i) => {
    if (/^OFF$/i.test(dayCols[i])) days_off.push(label);
  });

  const pieces = extractPieces(line);
  if (!pieces.length) return null;

  return {
    roster_number: roster,
    daily_duty_number: pieces[0]?.daily_duty_number ?? null,
    duty_type: dutyType,
    paid_time: paidTime,
    working_time: workingTime,
    days_off,
    pieces,
    signup_kind: 'weekday',
  };
}

function parseWeekendLine(line, signupKind) {
  // Date Div Duty Type From Start End To Working Paid Details
  const head = line.match(
    /^\s*\S+\s+\S+\s+(\d{1,4})\s+([A-Z]{2,5})\s+([A-Z0-9][A-Z0-9 \-]*?)\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([A-Z0-9][A-Z0-9 \-]*?)\s+(\d+h\d{1,2})\s+(\d+h\d{1,2})\b/,
  );
  if (!head) return null;
  const [, duty, dutyType, , , , , workingTime, paidTime] = head;

  const pieces = extractPieces(line);
  if (!pieces.length) return null;

  // Weekend signups always work their single covered day, so there are
  // never any "off" days within their scope. (The weekday days are not
  // covered by this signup.)
  const days_off = [];

  return {
    roster_number: duty, // No multi-digit roster on weekends; reuse the duty number.
    daily_duty_number: pieces[0]?.daily_duty_number ?? duty,
    duty_type: dutyType,
    paid_time: paidTime,
    working_time: workingTime,
    days_off,
    pieces,
    signup_kind: signupKind,
  };
}

/**
 * Detect which signup layout this PDF uses.
 *  - WEEKDAY signups header includes "Mon Tue Wed Thu Fri".
 *  - SAT/SUN signups header includes "Platform" and "Details".
 *  - We default to weekday if ambiguous.
 */
function detectSignupKind(lines, fileName = '') {
  const fname = fileName.toLowerCase();
  if (/saturday|\bsat\b/.test(fname)) return 'saturday';
  if (/sunday|\bsun\b/.test(fname)) return 'sunday';
  if (/weekday|mon-?fri|\bmf\b/.test(fname)) return 'weekday';

  for (const line of lines.slice(0, 30)) {
    if (/Mon\s+Tue\s+Wed\s+Thu\s+Fri/i.test(line)) return 'weekday';
    if (/Platform\s+Paid\s+Details/i.test(line)) return 'saturday';
  }
  return 'weekday';
}

export function parseSignupRef(lines, fileName = '') {
  const kind = detectSignupKind(lines, fileName);
  const duties = [];
  for (const line of lines) {
    if (!/\[\d+-\d+\]\(/.test(line)) continue;
    const duty =
      kind === 'weekday'
        ? parseWeekdayLine(line)
        : parseWeekendLine(line, kind);
    if (duty) duties.push(duty);
  }
  return { duties, signup_kind: kind };
}
