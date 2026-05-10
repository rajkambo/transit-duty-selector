// Parses a Block Report PDF (already extracted to plain-text lines) into the
// blocks[] portion of the target schema. The format per page is:
//
//   DATABASE: 26JUN  SERVICE GROUP: MF  LINE GROUP: 320
//   ... (legend, dashes) ...
//   Exc Block | Lv Node | Time | Mid Node | Time | Arr Node | Time |
//                                              Lo | Dhd | Line | POT | PIT | POG | PIG
//
// Each trip row starts with the block number and contains 1, 2, or 3
// (node, time) pairs followed by tail tokens (Lo, Dhd, Line, POT, PIT, POG,
// PIG). The Mid Node is optional; Lo/Dhd/POT/PIT/POG/PIG are also variable.
// We tokenize, merge the unusual two-word "N EX" code, and walk the structure.

const HEADER_RE =
  /SERVICE\s+GROUP:?\s+([A-Z]+)\s+LINE\s+GROUP:?\s+(\d+)/i;

const TIME_TOKEN_RE = /^\d{3,4}$/;
const BLOCK_TOKEN_RE = /^\d{1,4}$/;
const NODE_TOKEN_RE = /^[A-Z0-9][A-Z0-9\-]*$/;
// A pure-digit token < 3 digits is way too small to be a node code (real node
// codes like 8812, 5876, 6452 are always 4 digits). Such short numbers are
// almost always layover minutes or line numbers in the column tail.
const SHORT_NUMERIC_RE = /^\d{1,2}$/;

function isTime(tok) {
  return TIME_TOKEN_RE.test(tok);
}

function looksLikeNode(tok) {
  if (tok === 'N EX') return true;
  if (!NODE_TOKEN_RE.test(tok)) return false;
  if (SHORT_NUMERIC_RE.test(tok)) return false;
  return true;
}

function timeFromRaw(tok) {
  // "504" -> "05:04", "1822" -> "18:22", "2549" -> "25:49"
  if (!isTime(tok)) return null;
  const n = Number(tok);
  const h = Math.floor(n / 100);
  const m = n % 100;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Merge consecutive bare-letter tokens that together form a node code,
// specifically "N EX" -> "N EX". Anything else (single tokens like "DP32",
// "NX-T", "SUST", "STC") is preserved as-is.
function tokenizeRow(line) {
  const raw = line.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (cur === 'N' && next === 'EX') {
      out.push('N EX');
      i += 1;
    } else {
      out.push(cur);
    }
  }
  return out;
}

function parseTripRow(tokens, ctx) {
  // First token must be the block number.
  if (!tokens.length) return null;
  if (!BLOCK_TOKEN_RE.test(tokens[0])) return null;
  // Reject pure numeric "summary" lines like a lone "312" at the foot of a page.
  if (tokens.length < 3) return null;

  const blockNumber = tokens[0];
  let i = 1;

  // Read alternating (node, time) pairs. There must be at least 2 (Lv, Arr).
  const pairs = [];
  while (i < tokens.length) {
    const node = tokens[i];
    const time = tokens[i + 1];
    if (!looksLikeNode(node)) break;
    if (!time || !isTime(time)) break;
    pairs.push({ node, time });
    i += 2;
    if (pairs.length === 3) break; // At most Lv, Mid, Arr.
  }
  if (pairs.length < 2) return null;

  const tail = tokens.slice(i);

  let leave = pairs[0];
  let arrive = pairs[pairs.length - 1];
  let mid = pairs.length === 3 ? pairs[1] : null;

  // Tail layout, from the column header:
  //   [Lo] [Dhd] Line [POT POG]   (first row of a block)
  //   [Lo] [Dhd] Line [PIT PIG]   (last row of a block)
  //   [Lo] [Dhd] Line              (mid-block rows)
  //
  // POG/PIG are alpha node codes; POT/PIT are 3-4 digit clock times. Line
  // is always a numeric route number that comes immediately before POT/PIT
  // (or is the trailing numeric on mid-rows).
  let layover = null;
  let dhdLine = null;
  let lineNumber = null;
  let depot = null;

  // Split into structural buckets without dropping anything.
  let trailingAlpha = null;
  let work = [...tail];
  if (work.length && looksLikeNode(work[work.length - 1]) && !/^\d+$/.test(work[work.length - 1])) {
    trailingAlpha = work.pop();
    depot = trailingAlpha;
  }

  // Discard any further alpha-only oddities (defensive; shouldn't usually fire).
  work = work.filter((t) => /^\d+$/.test(t) || looksLikeNode(t));
  const numerics = work.filter((t) => /^\d+$/.test(t));

  let remaining;
  if (trailingAlpha) {
    // Last numeric is POT/PIT, second-to-last is Line.
    if (numerics.length >= 2) {
      lineNumber = numerics[numerics.length - 2];
      remaining = numerics.slice(0, numerics.length - 2);
    } else if (numerics.length === 1) {
      // Unusual — treat the lone numeric as Line.
      lineNumber = numerics[0];
      remaining = [];
    } else {
      remaining = [];
    }
  } else {
    if (numerics.length >= 1) {
      lineNumber = numerics[numerics.length - 1];
      remaining = numerics.slice(0, numerics.length - 1);
    } else {
      remaining = [];
    }
  }

  if (remaining.length === 1) {
    layover = remaining[0];
  } else if (remaining.length >= 2) {
    layover = remaining[0];
    dhdLine = remaining[1];
  }

  return {
    block_number: blockNumber,
    leave_node: leave.node,
    leave_time: timeFromRaw(leave.time),
    leave_time_min: clockMin(leave.time),
    mid_node: mid?.node ?? null,
    mid_time: mid ? timeFromRaw(mid.time) : null,
    arrive_node: arrive.node,
    arrive_time: timeFromRaw(arrive.time),
    arrive_time_min: clockMin(arrive.time),
    layover_time: layover, // minutes (string), or null
    deadhead_line: dhdLine,
    line: lineNumber,
    depot,
    service_group: ctx.serviceGroup,
    line_group: ctx.lineGroup,
  };
}

function clockMin(rawTime) {
  if (!isTime(rawTime)) return null;
  const n = Number(rawTime);
  return Math.floor(n / 100) * 60 + (n % 100);
}

export function parseBlockReport(lines, fileName = '') {
  const tripsByKey = new Map();
  let serviceGroup = null;
  let lineGroup = null;

  // Try to seed serviceGroup from the file name if possible.
  const fname = fileName.toUpperCase();
  if (/\bSAT\b|SATURDAY/.test(fname)) serviceGroup = 'SAT';
  else if (/\bSUN\b|SUNDAY/.test(fname)) serviceGroup = 'SUN';
  else if (/\bMF\b|WEEKDAY|MON.?FRI/.test(fname)) serviceGroup = 'MF';

  for (const rawLine of lines) {
    const m = rawLine.match(HEADER_RE);
    if (m) {
      serviceGroup = m[1];
      lineGroup = m[2];
      continue;
    }
    if (!lineGroup) continue;
    if (/^Exc\s+Block/i.test(rawLine)) continue;
    if (/^[-\s]+$/.test(rawLine)) continue;
    if (/PRINT\s+DATE|DATABASE|BLOCK\s+REPORT|PAGE/i.test(rawLine)) continue;

    const tokens = tokenizeRow(rawLine);
    const trip = parseTripRow(tokens, { serviceGroup, lineGroup });
    if (!trip) continue;
    if (!trip.leave_time_min || !trip.arrive_time_min) continue;

    const key = `${serviceGroup}|${lineGroup}|${trip.block_number}`;
    if (!tripsByKey.has(key)) {
      tripsByKey.set(key, {
        service_group: serviceGroup,
        line_group: lineGroup,
        block_number: trip.block_number,
        trips: [],
      });
    }
    tripsByKey.get(key).trips.push(trip);
  }

  const blocks = [...tripsByKey.values()];
  // Sort each block's trips by leave time so downstream logic can rely on order.
  for (const b of blocks) {
    b.trips.sort((a, c) => a.leave_time_min - c.leave_time_min);
  }
  return { blocks, service_group: serviceGroup };
}
