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

// The trailing colon after the daily-duty number is present in the
// canonical form `(363: STC 04:12-11:05 SUST)`, but PDFs annotate
// "school days only" / "school days on" entries as `(367 <SD> STC ...)`
// or `(404 <SDon> STC ...)` with NO colon. Make the colon optional so
// both shapes match.
const DUTY_DETAIL_RE =
  /\[(\d+)-(\d+)\]\(\s*(\d+)(?:\s*<[^>]*>)?\s*:?\s*([A-Z0-9][A-Z0-9 \-]*?)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+([A-Z0-9][A-Z0-9 \-]*?)\s*\)/g;

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

function buildProfiles(pieces, dayAssignments) {
  // Group pieces by their daily_duty_number. Each group becomes a "profile"
  // that represents one daily shift assignment. For most rosters there is
  // exactly one daily_duty_number so there's a single profile, but
  // split-week rosters (e.g. 7018 in the weekday signup) carry two or
  // three daily duty numbers in the same row.
  //
  // dayAssignments: [{day, value}] where value is "OFF" or a daily-duty-
  // number string. working_days for a profile is the days whose value
  // matches the profile's daily_duty_number.
  const groups = new Map();
  for (const piece of pieces) {
    const key = piece.daily_duty_number;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(piece);
  }

  const profiles = [];
  for (const [dailyDutyNumber, groupPieces] of groups) {
    const workingDays = dayAssignments
      .filter((da) => da.value === dailyDutyNumber)
      .map((da) => da.day);
    profiles.push({
      daily_duty_number: dailyDutyNumber,
      working_days: workingDays,
      pieces: groupPieces,
    });
  }
  // Stable order: by first working day (so Mon-only daily appears before
  // Thu+Fri daily in the duty card).
  const dayOrder = new Map(WEEKDAY_DAY_LABELS.map((d, i) => [d, i]));
  profiles.sort((a, b) => {
    const ai = a.working_days.length
      ? Math.min(...a.working_days.map((d) => dayOrder.get(d) ?? 99))
      : 99;
    const bi = b.working_days.length
      ? Math.min(...b.working_days.map((d) => dayOrder.get(d) ?? 99))
      : 99;
    return ai - bi;
  });
  return profiles;
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
  const dayAssignments = WEEKDAY_DAY_LABELS.map((label, i) => {
    const value = dayCols[i];
    if (/^OFF$/i.test(value)) {
      days_off.push(label);
      return { day: label, value: 'OFF' };
    }
    return { day: label, value };
  });

  const pieces = extractPieces(line);
  if (!pieces.length) return null;

  const profiles = buildProfiles(pieces, dayAssignments);

  return {
    roster_number: roster,
    daily_duty_number: profiles[0]?.daily_duty_number ?? null,
    duty_type: dutyType,
    paid_time: paidTime,
    working_time: workingTime,
    days_off,
    profiles,
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

  // Weekend signups always have a single daily_duty_number per row, so
  // there is always exactly one profile.
  const dayLabel = signupKind === 'saturday' ? 'Sat' : 'Sun';
  const profiles = [
    {
      daily_duty_number: pieces[0]?.daily_duty_number ?? duty,
      working_days: [dayLabel],
      pieces,
    },
  ];

  return {
    roster_number: duty, // No multi-digit roster on weekends; reuse the duty number.
    daily_duty_number: profiles[0].daily_duty_number,
    duty_type: dutyType,
    paid_time: paidTime,
    working_time: workingTime,
    days_off,
    profiles,
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

const ROW_PREFIX_RE = /\b\d{1,2}[A-Z]{3}\s+[A-Z]{2,4}\s+\d{3,5}\s+[A-Z]{2,5}\s+\d+h\d{1,2}\s+\d+h\d{1,2}/;

/**
 * Some signup rows have so many duty-detail pieces that the column wraps
 * onto a separate visual line ABOVE the row prefix, e.g.
 *
 *   "[801-29](284 ...), [320-14](284 ...), [801-28](285 ...),"
 *   "26JUN STC 7063 REG 26h42 25h09 284 284 OFF OFF 285 ... [321-15](285 ...)"
 *
 * Each line is independent in the PDF text stream. We merge a
 * "continuation line" (has duty-detail brackets but no row prefix) into
 * the FOLLOWING row line so all pieces are visible to the row parser.
 */
function mergeWrappedDutyLines(lines) {
  const out = [];
  let buffer = '';
  for (const line of lines) {
    const hasDetails = /\[\d+-\d+\]\(/.test(line);
    const hasRowPrefix = ROW_PREFIX_RE.test(line);
    if (hasDetails && !hasRowPrefix) {
      // Pure duty-detail continuation; hold for the next row line.
      buffer = buffer ? `${buffer} ${line}` : line;
      continue;
    }
    if (hasRowPrefix && buffer) {
      out.push(`${buffer} ${line}`);
      buffer = '';
      continue;
    }
    if (buffer) {
      // Lost the buffer (e.g. a header line interrupted the wrap). Drop
      // it rather than mis-attribute it.
      buffer = '';
    }
    out.push(line);
  }
  if (buffer) out.push(buffer);
  return out;
}

export function parseSignupRef(lines, fileName = '') {
  const kind = detectSignupKind(lines, fileName);
  const merged = kind === 'weekday' ? mergeWrappedDutyLines(lines) : lines;
  const duties = [];
  for (const line of merged) {
    if (!/\[\d+-\d+\]\(/.test(line)) continue;
    const duty =
      kind === 'weekday'
        ? parseWeekdayLine(line)
        : parseWeekendLine(line, kind);
    if (duty) duties.push(duty);
  }
  return { duties, signup_kind: kind };
}
