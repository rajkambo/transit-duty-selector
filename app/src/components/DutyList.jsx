import DutyCard from './DutyCard.jsx';

const SORT_OPTIONS = [
  { id: 'start', label: 'Start time (earliest first)' },
  { id: 'end', label: 'End time (earliest first)' },
  { id: 'paid', label: 'Paid time (most first)' },
  { id: 'bonus', label: 'Bonus pay (best first)' },
  { id: 'roster', label: 'Roster number' },
];

function sortDuties(duties, sortBy) {
  const arr = [...duties];
  switch (sortBy) {
    case 'start':
      arr.sort((a, b) => (a.earliest_start_min ?? 0) - (b.earliest_start_min ?? 0));
      break;
    case 'end':
      arr.sort((a, b) => (a.latest_end_min ?? 0) - (b.latest_end_min ?? 0));
      break;
    case 'paid':
      arr.sort((a, b) => (b.paid_min ?? 0) - (a.paid_min ?? 0));
      break;
    case 'bonus':
      arr.sort((a, b) => (b.bonus_min ?? 0) - (a.bonus_min ?? 0));
      break;
    case 'roster':
      arr.sort((a, b) =>
        String(a.roster_number).localeCompare(String(b.roster_number)),
      );
      break;
    default:
      break;
  }
  return arr;
}

export default function DutyList({
  duties,
  savedIds,
  onToggleSave,
  sortBy,
  setSortBy,
}) {
  const sorted = sortDuties(duties, sortBy);

  return (
    <section aria-label="Filtered duties">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-semibold text-slate-900">
          {duties.length} matching {duties.length === 1 ? 'duty' : 'duties'}
        </h2>
        <label className="text-base text-slate-700 flex items-center gap-2">
          Sort by:
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1 text-base bg-white"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      {duties.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600 text-lg">
          No duties match these filters. Try widening your criteria.
        </div>
      ) : (
        <ul className="space-y-4">
          {sorted.map((d) => (
            <li key={d.id}>
              <DutyCard
                duty={d}
                saved={savedIds.includes(d.id)}
                onToggleSave={onToggleSave}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
