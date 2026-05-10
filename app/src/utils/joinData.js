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

  // Pull-out (POT): the bus pulls out of the depot at pot_min and drives
  // to the first revenue trip's leave node. This is paid working time
  // before any passenger movement. We only emit it when the very first
  // trip of the entire block is in our window — otherwise the driver took
  // over mid-block and didn't perform the pull-out.
  if (
    trips.length > 0 &&
    trips[0] === block.trips[0] &&
    trips[0].pot_min != null &&
    trips[0].pot_node != null &&
    trips[0].pot_min < trips[0].leave_time_min
  ) {
    const t0 = trips[0];
    const dur = t0.leave_time_min - t0.pot_min;
    segments.push({
      kind: 'deadhead',
      start: t0.pot_min,
      end: t0.leave_time_min,
      label: `Route ${t0.line ?? '?'} ${t0.pot_node} → ${t0.leave_node}`,
      meta: {
        kind: 'pot',
        line: t0.line,
        leave_node: t0.pot_node,
        arrive_node: t0.leave_node,
      },
    });
    deadhead += dur;
  }

  // Sign-on filler: any time inside the piece that's still earlier than
  // the bus's first observed movement. Renders as inert grey on the
  // timeline; hidden from the trip list because it has no useful label.
  const firstSegStart =
    segments.length > 0 ? segments[0].start : trips[0]?.leave_time_min;
  if (firstSegStart != null && firstSegStart > startMin) {
    segments.unshift({
      kind: 'deadhead',
      start: startMin,
      end: firstSegStart,
      label: null,
      meta: { kind: 'depot_filler' },
    });
    deadhead += firstSegStart - startMin;
  }

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
        // Inter-trip positioning is paid working time without passengers.
        // Tag it so the trip list shows it as a slate-coloured deadhead row.
        segments.push({
          kind: 'deadhead',
          start: segEnd + loMin,
          end: next.leave_time_min,
          label: `Positioning ${t.arrive_node} → ${next.leave_node} (${remaining}m)`,
          meta: {
            kind: 'positioning',
            leave_node: t.arrive_node,
            arrive_node: next.leave_node,
          },
        });
        deadhead += remaining;
      }
    }
  }

  // Pull-in (PIT): symmetric to POT. The bus arrives at the last trip's
  // arrive_node, then deadheads back to the depot at pit_min.
  if (
    trips.length > 0 &&
    trips[trips.length - 1] === block.trips[block.trips.length - 1] &&
    trips[trips.length - 1].pit_min != null &&
    trips[trips.length - 1].pit_node != null &&
    trips[trips.length - 1].pit_min > trips[trips.length - 1].arrive_time_min
  ) {
    const tN = trips[trips.length - 1];
    const dur = tN.pit_min - tN.arrive_time_min;
    segments.push({
      kind: 'deadhead',
      start: tN.arrive_time_min,
      end: tN.pit_min,
      label: `Route ${tN.line ?? '?'} ${tN.arrive_node} → ${tN.pit_node}`,
      meta: {
        kind: 'pit',
        line: tN.line,
        leave_node: tN.arrive_node,
        arrive_node: tN.pit_node,
      },
    });
    deadhead += dur;
  }

  // Sign-off filler: time inside the piece after the last observed
  // movement. Mirrors the sign-on filler.
  const lastSegEnd =
    segments.length > 0 ? segments[segments.length - 1].end : null;
  if (lastSegEnd != null && lastSegEnd < adjEnd) {
    segments.push({
      kind: 'deadhead',
      start: lastSegEnd,
      end: adjEnd,
      label: null,
      meta: { kind: 'depot_filler' },
    });
    deadhead += adjEnd - lastSegEnd;
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
      // Enrich each profile independently. A profile represents one daily
      // shift assignment (e.g. for split-week roster 7018 there are two:
      // daily 65 worked Thu/Fri, daily 78 worked Mon).
      const profilesEnriched = (duty.profiles ?? []).map((profile) => {
        const piecesEnriched = profile.pieces.map((p) =>
          buildSegmentsForPiece(p, blocksIndex, sgOrder),
        );
        const sortedPieces = [...piecesEnriched]
          .filter(Boolean)
          .sort((a, b) => a.start_min - b.start_min);

        let splitBreakMin = 0;
        for (let i = 1; i < sortedPieces.length; i++) {
          const gap =
            sortedPieces[i].start_min - sortedPieces[i - 1].end_min;
          if (gap > 0) splitBreakMin += gap;
        }

        const drivingMin = sortedPieces.reduce(
          (a, p) => a + p.driving_min,
          0,
        );
        const deadheadMin = sortedPieces.reduce(
          (a, p) => a + p.deadhead_min,
          0,
        );
        const layoverMin = sortedPieces.reduce(
          (a, p) => a + p.layover_min,
          0,
        );
        const routes = new Set();
        for (const p of sortedPieces) for (const r of p.routes) routes.add(r);

        const earliestStart = sortedPieces[0]?.start_min ?? null;
        const latestEnd =
          sortedPieces[sortedPieces.length - 1]?.end_min ?? null;
        const totalSpanMin =
          earliestStart != null && latestEnd != null
            ? latestEnd - earliestStart
            : null;

        const startLocation = profile.pieces[0]?.start_location ?? null;
        const endLocation =
          profile.pieces[profile.pieces.length - 1]?.end_location ?? null;
        const sameDepot =
          startLocation && endLocation && startLocation === endLocation;

        return {
          daily_duty_number: profile.daily_duty_number,
          working_days: profile.working_days,
          pieces: profile.pieces,
          pieces_enriched: piecesEnriched,
          driving_min: drivingMin,
          deadhead_min: deadheadMin,
          layover_min: layoverMin,
          split_break_min: splitBreakMin,
          earliest_start_min: earliestStart,
          latest_end_min: latestEnd,
          total_span_min: totalSpanMin,
          start_location: startLocation,
          end_location: endLocation,
          same_depot: sameDepot,
          routes: [...routes].sort(),
        };
      });

      // Aggregate duty-level fields. Per-shift metrics are weighted
      // averages by working_days.length so split-week duties don't
      // appear to have impossibly long shifts (the bug we are fixing).
      const totalWorkingDays = profilesEnriched.reduce(
        (a, p) => a + p.working_days.length,
        0,
      );
      const denom = totalWorkingDays > 0 ? totalWorkingDays : 1;

      const weightedAvg = (key) =>
        profilesEnriched.reduce(
          (a, p) => a + p[key] * p.working_days.length,
          0,
        ) / denom;

      const drivingMin = Math.round(weightedAvg('driving_min'));
      const deadheadMin = Math.round(weightedAvg('deadhead_min'));
      const layoverMin = Math.round(weightedAvg('layover_min'));
      const splitBreakMin = Math.round(weightedAvg('split_break_min'));

      // Earliest/latest across all profiles (so the duty's overall span
      // covers the broadest window any working day might face).
      const earliestStart = profilesEnriched.reduce(
        (acc, p) =>
          p.earliest_start_min == null
            ? acc
            : acc == null
              ? p.earliest_start_min
              : Math.min(acc, p.earliest_start_min),
        null,
      );
      const latestEnd = profilesEnriched.reduce(
        (acc, p) =>
          p.latest_end_min == null
            ? acc
            : acc == null
              ? p.latest_end_min
              : Math.max(acc, p.latest_end_min),
        null,
      );
      const totalSpanMin =
        earliestStart != null && latestEnd != null
          ? latestEnd - earliestStart
          : null;

      // Routes union across profiles.
      const routes = new Set();
      for (const p of profilesEnriched) for (const r of p.routes) routes.add(r);

      // Stricter "same depot" — true only if every profile is same-depot.
      const sameDepot =
        profilesEnriched.length > 0 &&
        profilesEnriched.every((p) => p.same_depot);

      // Top-level location strings for the card header. Use the first
      // profile (which is sorted by earliest working day in the parser).
      const startLocation = profilesEnriched[0]?.start_location ?? null;
      const endLocation = profilesEnriched[0]?.end_location ?? null;

      // Weekly totals as printed on the signup PDF.
      const paidWeekMin = parseDurationHHhMM(duty.paid_time) ?? null;
      const workingWeekMin = parseDurationHHhMM(duty.working_time) ?? null;
      const bonusWeekMin =
        paidWeekMin != null && workingWeekMin != null
          ? paidWeekMin - workingWeekMin
          : null;

      // Defensive check: working_days_count derived from row's "OFF" pattern
      // should equal sum of profile working_days lengths.
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
      const expectedWorkingDays = Math.max(
        0,
        coveredDays.length - duty.days_off.length,
      );
      if (expectedWorkingDays !== totalWorkingDays) {
        // eslint-disable-next-line no-console
        console.warn(
          `[joinData] working-day mismatch for roster ${duty.roster_number}: covered-days minus off=${expectedWorkingDays}, but profiles sum to ${totalWorkingDays}`,
        );
      }
      const workingDaysCount = totalWorkingDays;

      const paidMin =
        paidWeekMin != null ? Math.round(paidWeekMin / denom) : null;
      const workingMin =
        workingWeekMin != null ? Math.round(workingWeekMin / denom) : null;
      const bonusMin =
        bonusWeekMin != null ? Math.round(bonusWeekMin / denom) : null;

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

      // ID is now per-roster (no daily_duty_number), so split-week rosters
      // get a single saved-duty entry that captures their whole package.
      const dutyId = `${sig.signup_kind}-${duty.roster_number}`;

      // Backwards-compat: a flat pieces_enriched list used by smoke.mjs and
      // any older script. New code should use duty.profiles instead.
      const flatPiecesEnriched = profilesEnriched.flatMap(
        (p) => p.pieces_enriched,
      );

      allDuties.push({
        ...duty,
        id: dutyId,
        signup_kind: sig.signup_kind,
        covered_days: coveredDays,
        profiles: profilesEnriched,
        // Read-only flat shim; do not write through. Kept for older
        // consumers that read pieces_enriched directly.
        pieces_enriched: flatPiecesEnriched,
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
