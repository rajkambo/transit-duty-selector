import { DAY_LABELS, minutesToClock } from '../utils/timeUtils.js';

const SHIFT_TYPES = [
  { id: 'straight', label: 'Straight' },
  { id: 'split', label: 'Split' },
  { id: 'cww', label: 'Compressed (CWW)' },
  { id: 'other', label: 'Other' },
];

// Transit schedules use absolute hours (e.g. "25:32" for 1:32 AM the next
// day). Don't wrap modulo 24h or operators see e.g. "28:00" rendered as
// "04:00". For values past midnight we annotate with "(+1 day)" so the
// label is unambiguous to senior operators glancing at the slider.
function formatScheduleTime(min) {
  const safe = Math.max(0, min);
  const base = minutesToClock(safe);
  if (safe >= 24 * 60) {
    const wrapped = minutesToClock(safe - 24 * 60);
    return `${wrapped} (next day)`;
  }
  return base;
}

const EARLIEST_START_MIN = 0;
const EARLIEST_START_MAX = 14 * 60;
const LATEST_END_MIN = 12 * 60;
const LATEST_END_MAX = 30 * 60;

export default function FilterSidebar({ filters, setFilters, totals, allRoutes }) {
  const update = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const toggleArrayValue = (key, val) => {
    setFilters((f) => {
      const set = new Set(f[key]);
      if (set.has(val)) set.delete(val);
      else set.add(val);
      return { ...f, [key]: [...set] };
    });
  };

  return (
    <aside
      aria-label="Filters"
      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
    >
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-semibold text-slate-900">Filters</h2>
        <button
          type="button"
          className="text-base text-blue-700 underline"
          onClick={() =>
            setFilters({
              daysOff: [],
              shiftTypes: [],
              earliestStart: EARLIEST_START_MIN,
              latestEnd: LATEST_END_MAX,
              minPaidHours: 0,
              minPaidWeekHours: 0,
              minBonusMin: 0,
              sameDepotOnly: false,
              singleRouteOnly: false,
              maxDeadheadMin: 240,
              search: '',
            })
          }
        >
          Reset
        </button>
      </header>

      <p className="text-base text-slate-600 mb-4">
        Showing <strong>{totals.shown}</strong> of{' '}
        <strong>{totals.total}</strong> duties.
      </p>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          Days I want OFF
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {DAY_LABELS.map((d) => (
            <label
              key={d}
              className="flex items-center gap-2 text-base text-slate-800"
            >
              <input
                type="checkbox"
                className="w-5 h-5 accent-blue-600"
                checked={filters.daysOff.includes(d)}
                onChange={() => toggleArrayValue('daysOff', d)}
              />
              {d}
            </label>
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-2">
          {filters.daysOff.length === 0
            ? 'No constraint — all duties shown.'
            : `Will show duties compatible with working ${DAY_LABELS.filter(
                (d) => !filters.daysOff.includes(d),
              ).join(', ')}.`}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          A weekly schedule is built from up to three duties (a weekday duty
          plus optional Saturday and Sunday duties). This filter only
          enforces day rules on the days each duty actually covers.
        </p>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          Shift type
        </legend>
        <div className="space-y-2">
          {SHIFT_TYPES.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 text-base text-slate-800"
            >
              <input
                type="checkbox"
                className="w-5 h-5 accent-blue-600"
                checked={filters.shiftTypes.includes(t.id)}
                onChange={() => toggleArrayValue('shiftTypes', t.id)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          Start no earlier than
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={EARLIEST_START_MIN}
            max={EARLIEST_START_MAX}
            step="15"
            value={filters.earliestStart}
            onChange={(e) => update({ earliestStart: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
            aria-label="Earliest start time"
          />
          <output className="text-base font-mono w-32 text-right">
            {filters.earliestStart <= EARLIEST_START_MIN
              ? 'Any time'
              : formatScheduleTime(filters.earliestStart)}
          </output>
        </div>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          End no later than
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={LATEST_END_MIN}
            max={LATEST_END_MAX}
            step="15"
            value={filters.latestEnd}
            onChange={(e) => update({ latestEnd: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
            aria-label="Latest end time"
          />
          <output className="text-base font-mono w-32 text-right">
            {filters.latestEnd >= LATEST_END_MAX
              ? 'Any time'
              : formatScheduleTime(filters.latestEnd)}
          </output>
        </div>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          Minimum paid hours per shift
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={filters.minPaidHours}
            onChange={(e) => update({ minPaidHours: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
            aria-label="Minimum paid hours per shift"
          />
          <output className="text-base font-mono w-16 text-right">
            {filters.minPaidHours}h
          </output>
        </div>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          Minimum paid hours per week
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={filters.minPaidWeekHours}
            onChange={(e) =>
              update({ minPaidWeekHours: Number(e.target.value) })
            }
            className="flex-1 accent-blue-600"
            aria-label="Minimum paid hours per week"
          />
          <output className="text-base font-mono w-16 text-right">
            {filters.minPaidWeekHours}h
          </output>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Total weekly paid time across all working days.
        </p>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          Minimum bonus pay per shift
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="120"
            step="5"
            value={filters.minBonusMin}
            onChange={(e) => update({ minBonusMin: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
            aria-label="Minimum bonus pay minutes per shift"
          />
          <output className="text-base font-mono w-16 text-right">
            {filters.minBonusMin}m
          </output>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Per-shift paid time minus actual working time.
        </p>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="text-base font-semibold text-slate-800 mb-2">
          Maximum deadhead time
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="240"
            step="5"
            value={filters.maxDeadheadMin}
            onChange={(e) => update({ maxDeadheadMin: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
            aria-label="Maximum deadhead minutes"
          />
          <output className="text-base font-mono w-16 text-right">
            {filters.maxDeadheadMin}m
          </output>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-base text-slate-800 mb-3">
        <input
          type="checkbox"
          className="w-5 h-5 accent-blue-600"
          checked={filters.sameDepotOnly}
          onChange={(e) => update({ sameDepotOnly: e.target.checked })}
        />
        Starts and ends at the same depot
      </label>

      <label className="flex items-center gap-2 text-base text-slate-800 mb-5">
        <input
          type="checkbox"
          className="w-5 h-5 accent-blue-600"
          checked={filters.singleRouteOnly}
          onChange={(e) => update({ singleRouteOnly: e.target.checked })}
        />
        Drive a single route only
      </label>

      <label className="block text-base font-semibold text-slate-800 mb-1">
        Search (route, depot, roster #)
      </label>
      <input
        type="search"
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base"
        value={filters.search}
        onChange={(e) => update({ search: e.target.value })}
        placeholder="e.g. 320, 324 or SUST or 8363"
      />
      <p className="text-sm text-slate-500 mt-1">
        Separate multiple terms with commas or spaces — matches any of them.
      </p>

      {allRoutes.length > 0 && (
        <p className="text-sm text-slate-500 mt-3">
          Routes available: {allRoutes.join(', ')}
        </p>
      )}
    </aside>
  );
}
