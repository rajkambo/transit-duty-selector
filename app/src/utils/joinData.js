// Joins the parsed signup duties with their corresponding block trips,
// computes timeline segments (driving / deadhead / layover / split break),
// and attaches summary metrics used by the UI and filters.

import {
  parseClockToMinutes,
  parseDurationHHhMM,
  minutesToDurationHHhMM,
  COVERED_DAYS_BY_SIGNUP_KIND,
} from './timeUtils.js';

const SPLIT_TYPES = new Set(['ESPL', 'LSPL', 'SPL']);
const STRAIGHT_TYPES = new Set(['ESTR', 'LSTR', 'STR', 'REG']);

function isDeadheadTrip(trip) {
  // A trip is treated as a deadhead if it has no public-facing line OR
  // its line equals its deadhead line. We also count "layover_time = 0
  // and very short" sometimes-positioning legs as deadhead, but only
  // when deadhead_line is explicitly populated.
  if (!trip.line) return true;
  if (trip.deadhead_line && trip.deadhead_line === trip.line) return true;
  return false;
}

function buildSegmentsForPiece(piece, blocksIndex, signupKindToServiceGroups) {
  const startMin = parseClockToMinutes(piece.start_time);
  const endMin = parseClockToMinutes(piece.end_time);
  if (startMin == null || endMin == null) return null;

  // Find the right block. Prefer the service group implied by the duty's
  // signup kind, then fall back to anything matching line group + block.
  const candidateServiceGroups = signupKindToServiceGroups;
  let block = null;
  for (const sg of candidateServiceGroups) {
    const key = `${sg}|${piece.line_group}|${piece.block_number}`;
    if (blocksIndex.has(key)) {
      block = blocksIndex.get(key);
      break;
    }
  }
  if (!block) {
    // Last-ditch: any service group.
    for (const [k, v] of blocksIndex.entries()) {
      const [, lg, bn] = k.split('|');
      if (lg === piece.line_group && bn === piece.block_number) {
        block = v;
        break;
      }
    }
  }
  if (!block) {
    return {
      piece,
      block_found: false,
      start_min: startMin,
      end_min: endMin < startMin ? endMin + 24 * 60 : endMin,
      segments: [
        {
          kind: 'unknown',
          start: startMin,
          end: endMin < startMin ? endMin + 24 * 60 : endMin,
          label: `Block ${piece.line_group}-${piece.block_number} (no block data)`,
        },
      ],
      driving_min: 0,
      deadhead_min: 0,
      layover_min: 0,
      routes: new Set(),
    };
  }

  // Filter trips within the driver's window. We treat "within" as: the
  // trip's leave time is between [startMin, endMin) OR overlaps the window.
  const adjEnd = endMin < startMin ? endMin + 24 * 60 : endMin;
  const trips = block.trips
    .filter((t) => {
      const lv = t.leave_time_min;
      return lv >= startMin && lv < adjEnd;
    })
    .sort((a, b) => a.leave_time_min - b.leave_time_min);

  const segments = [];
  const routes = new Set();
  let driving = 0;
  let deadhead = 0;
  let layover = 0;

  for (let idx = 0; idx < trips.length; idx++) {
    const t = trips[idx];
    const segStart = t.leave_time_min;
    const segEnd = t.arrive_time_min;
    const isDh = isDeadheadTrip(t);
    if (!isDh && t.line) routes.add(t.line);
    const dur = Math.max(0, segEnd - segStart);
    segments.push({
      kind: isDh ? 'deadhead' : 'driving',
      start: segStart,
      end: segEnd,
      label: `${isDh ? 'Deadhead' : 'Route ' + (t.line ?? '?')} ${t.leave_node} → ${t.arrive_node}`,
      meta: { line: t.line, leave_node: t.leave_node, arrive_node: t.arrive_node },
    });
    if (isDh) deadhead += dur;
    else driving += dur;

    // Layover after this trip: prefer the explicit Lo column, but cap to the
    // gap to the next trip so we don't overshoot.
    const next = trips[idx + 1];
    if (next) {
      const gap = Math.max(0, next.leave_time_min - segEnd);
      const declared = t.layover_time != null ? Number(t.layover_time) : 0;
      const loMin = Math.min(gap, Number.isFinite(declared) ? declared : gap);
      if (loMin > 0) {
        segments.push({
          kind: 'layover',
          start: segEnd,
          end: segEnd + loMin,
          label: `${loMin}m at ${t.arrive_node}`,
          meta: { node: t.arrive_node, minutes: loMin },
        });
        layover += loMin;
      }
      const remaining = gap - loMin;
      if (remaining > 0) {
        segments.push({
          kind: 'gap',
          start: segEnd + loMin,
          end: next.leave_time_min,
          label: `${remaining}m positioning`,
        });
      }
    }
  }

  return {
    piece,
    block_found: true,
    start_min: startMin,
    end_min: adjEnd,
    segments,
    driving_min: driving,
    deadhead_min: deadhead,
    layover_min: layover,
    routes,
  };
}

function signupKindServiceGroupOrder(kind) {
  if (kind === 'saturday') return ['SAT', 'MF', 'SUN'];
  if (kind === 'sunday') return ['SUN', 'MF', 'SAT'];
  return ['MF', 'SAT', 'SUN'];
}

export function joinData(parsedSignups, parsedBlockReports) {
  // Build a fast lookup: serviceGroup|lineGroup|blockNumber -> block.
  const blocksIndex = new Map();
  for (const report of parsedBlockReports) {
    for (const b of report.blocks) {
      blocksIndex.set(
        `${b.service_group}|${b.line_group}|${b.block_number}`,
        b,
      );
    }
  }

  const allDuties = [];
  for (const sig of parsedSignups) {
    const sgOrder = signupKindServiceGroupOrder(sig.signup_kind);
    for (const duty of sig.duties) {
      const piecesEnriched = duty.pieces.map((p) =>
        buildSegmentsForPiece(p, blocksIndex, sgOrder),
      );

      // Compute split break(s) between consecutive pieces.
      const sortedPieces = [...piecesEnriched]
        .filter(Boolean)
        .sort((a, b) => a.start_min - b.start_min);

      let splitBreakMin = 0;
      for (let i = 1; i < sortedPieces.length; i++) {
        const gap = sortedPieces[i].start_min - sortedPieces[i - 1].end_min;
        if (gap > 0) splitBreakMin += gap;
      }

      const drivingMin = sortedPieces.reduce((a, p) => a + p.driving_min, 0);
      const deadheadMin = sortedPieces.reduce((a, p) => a + p.deadhead_min, 0);
      const layoverMin = sortedPieces.reduce((a, p) => a + p.layover_min, 0);
      const routes = new Set();
      for (const p of sortedPieces) for (const r of p.routes) routes.add(r);

      // Weekly totals as printed on the signup PDF (for weekday signups,
      // these cover several days; for Saturday/Sunday signups they're
      // already per-shift since each duty works only that one day).
      const paidWeekMin = parseDurationHHhMM(duty.paid_time) ?? null;
      const workingWeekMin = parseDurationHHhMM(duty.working_time) ?? null;
      const bonusWeekMin =
        paidWeekMin != null && workingWeekMin != null
          ? paidWeekMin - workingWeekMin
          : null;

      // Each duty repeats the SAME set of pieces on every working day, so
      // per-shift values are simply the totals divided by the number of
      // working days within this signup's scope.
      const coveredDays =
        COVERED_DAYS_BY_SIGNUP_KIND[sig.signup_kind] ?? [
          'Mon',
          'Tue',
          'Wed',
          'Thu',
          'Fri',
          'Sat',
          'Sun',
        ];
      const workingDaysCount = Math.max(
        0,
        coveredDays.length - duty.days_off.length,
      );
      const denom = workingDaysCount > 0 ? workingDaysCount : 1;
      const paidMin =
        paidWeekMin != null ? Math.round(paidWeekMin / denom) : null;
      const workingMin =
        workingWeekMin != null ? Math.round(workingWeekMin / denom) : null;
      const bonusMin =
        bonusWeekMin != null ? Math.round(bonusWeekMin / denom) : null;

      const earliestStart = sortedPieces[0]?.start_min ?? null;
      const latestEnd =
        sortedPieces[sortedPieces.length - 1]?.end_min ?? null;
      const totalSpanMin =
        earliestStart != null && latestEnd != null
          ? latestEnd - earliestStart
          : null;

      const startLocation = duty.pieces[0]?.start_location ?? null;
      const endLocation =
        duty.pieces[duty.pieces.length - 1]?.end_location ?? null;
      const sameDepot =
        startLocation && endLocation && startLocation === endLocation;

      const isSplit =
        SPLIT_TYPES.has(duty.duty_type) || splitBreakMin >= 60;
      const isCww = duty.duty_type === 'CWW';
      const isStraight = STRAIGHT_TYPES.has(duty.duty_type) && !isSplit;
      const shiftCategory = isCww
        ? 'cww'
        : isSplit
          ? 'split'
          : isStraight
            ? 'straight'
            : 'other';

      const dutyId = `${sig.signup_kind}-${duty.roster_number}-${duty.daily_duty_number ?? '0'}`;

      allDuties.push({
        ...duty,
        id: dutyId,
        signup_kind: sig.signup_kind,
        covered_days: coveredDays,
        pieces_enriched: piecesEnriched,
        driving_min: drivingMin,
        deadhead_min: deadheadMin,
        layover_min: layoverMin,
        split_break_min: splitBreakMin,
        working_days_count: workingDaysCount,
        // Per-shift values (used by filters and the prominent UI).
        paid_min: paidMin,
        working_min: workingMin,
        bonus_min: bonusMin,
        // Weekly totals as printed on the signup PDF.
        paid_week_min: paidWeekMin,
        working_week_min: workingWeekMin,
        bonus_week_min: bonusWeekMin,
        bonus_ratio:
          workingMin && workingMin > 0 && bonusMin != null
            ? bonusMin / workingMin
            : null,
        bonus_label: bonusMin != null ? minutesToDurationHHhMM(bonusMin) : '',
        earliest_start_min: earliestStart,
        latest_end_min: latestEnd,
        total_span_min: totalSpanMin,
        start_location: startLocation,
        end_location: endLocation,
        same_depot: sameDepot,
        routes: [...routes].sort(),
        shift_category: shiftCategory,
      });
    }
  }
  return allDuties;
}
