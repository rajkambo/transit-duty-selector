import { minutesToClock } from '../utils/timeUtils.js';

const COLORS = {
  driving: 'bg-blue-600',
  deadhead: 'bg-slate-400',
  layover: 'bg-amber-400',
  gap: 'bg-rose-200',
  unknown: 'bg-slate-200',
  split: 'bg-white border border-dashed border-slate-400',
};

/**
 * A Gantt-style timeline. Pieces are merged with split breaks shown as empty
 * (white) space. Width is mapped from minutes-since-shift-start.
 */
export default function VisualTimeline({ duty }) {
  const start = duty.earliest_start_min;
  const end = duty.latest_end_min;
  if (start == null || end == null || end <= start) {
    return (
      <p className="text-base text-slate-500 italic">
        No timeline data available.
      </p>
    );
  }
  const totalMin = end - start;

  // Build merged segment list across pieces, with explicit "split break" gaps.
  const merged = [];
  duty.pieces_enriched.forEach((p, idx) => {
    if (idx > 0) {
      const prev = duty.pieces_enriched[idx - 1];
      const gap = p.start_min - prev.end_min;
      if (gap > 0) {
        merged.push({
          kind: 'split',
          start: prev.end_min,
          end: p.start_min,
          label: `${gap}m unpaid split break`,
        });
      }
    }
    for (const seg of p.segments) merged.push(seg);
  });

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`Visual timeline from ${minutesToClock(start)} to ${minutesToClock(end)}`}
        className="relative w-full h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex"
      >
        {merged.map((seg, i) => {
          const widthPct = ((seg.end - seg.start) / totalMin) * 100;
          if (widthPct <= 0) return null;
          return (
            <div
              key={i}
              title={`${minutesToClock(seg.start)}–${minutesToClock(seg.end)} · ${seg.label}`}
              style={{ width: `${widthPct}%` }}
              className={`${COLORS[seg.kind] ?? COLORS.unknown} h-full`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-sm font-mono text-slate-600">
        <span>{minutesToClock(start)}</span>
        <span>{minutesToClock(end)}</span>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    { kind: 'driving', label: 'Driving' },
    { kind: 'deadhead', label: 'Deadhead' },
    { kind: 'layover', label: 'Layover' },
    { kind: 'split', label: 'Unpaid split break' },
  ];
  return (
    <ul className="flex flex-wrap gap-3 text-sm text-slate-700">
      {items.map((it) => (
        <li key={it.kind} className="flex items-center gap-1.5">
          <span
            className={`inline-block w-4 h-4 rounded ${COLORS[it.kind]}`}
            aria-hidden="true"
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
