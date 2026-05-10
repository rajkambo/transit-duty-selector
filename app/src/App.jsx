import { useEffect, useMemo, useState } from 'react';
import FileUploader from './components/FileUploader.jsx';
import FilterSidebar from './components/FilterSidebar.jsx';
import DutyList from './components/DutyList.jsx';
import SavedDuties from './components/SavedDuties.jsx';
import { joinData } from './utils/joinData.js';
import { DAY_LABELS } from './utils/timeUtils.js';

const SAVED_KEY = 'tds.savedDuties.v1';
const FILTERS_KEY = 'tds.filters.v1';

const DEFAULT_FILTERS = {
  daysOff: [],
  shiftTypes: [],
  earliestStart: 0,
  latestEnd: 30 * 60,
  minPaidHours: 0,
  minPaidWeekHours: 0,
  minBonusMin: 0,
  sameDepotOnly: false,
  singleRouteOnly: false,
  maxDeadheadMin: 240,
  search: '',
};

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [signups, setSignups] = useState([]);
  const [blockReports, setBlockReports] = useState([]);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(loadFilters);
  const [savedIds, setSavedIds] = useState(loadSaved);
  const [sortBy, setSortBy] = useState('start');
  const [view, setView] = useState('browse'); // 'browse' | 'saved'

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);
  useEffect(() => {
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedIds));
  }, [savedIds]);

  const duties = useMemo(
    () => joinData(signups, blockReports),
    [signups, blockReports],
  );

  const allRoutes = useMemo(() => {
    const set = new Set();
    for (const d of duties) for (const r of d.routes) set.add(r);
    return [...set].sort();
  }, [duties]);

  const filtered = useMemo(() => {
    return duties.filter((d) => filterMatch(d, filters));
  }, [duties, filters]);

  const savedDuties = useMemo(
    () => duties.filter((d) => savedIds.includes(d.id)),
    [duties, savedIds],
  );

  const onParsed = ({ signups: s, blockReports: br }) => {
    setSignups((prev) => mergeByFile(prev, s));
    setBlockReports((prev) => mergeByFile(prev, br));
  };

  const toggleSave = (id) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const haveData = duties.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        view={view}
        setView={setView}
        savedCount={savedDuties.length}
        signupCount={signups.length}
        blockCount={blockReports.length}
        onClearAll={() => {
          setSignups([]);
          setBlockReports([]);
        }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {view === 'saved' ? (
          <SavedDuties
            duties={savedDuties}
            onUnsave={toggleSave}
            onClose={() => setView('browse')}
          />
        ) : (
          <>
            <div className="no-print">
              <FileUploader
                onParsed={onParsed}
                busy={busy}
                setBusy={setBusy}
              />
              {(signups.length > 0 || blockReports.length > 0) && (
                <FileSummary
                  signups={signups}
                  blockReports={blockReports}
                />
              )}
            </div>

            {haveData ? (
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
                <div className="no-print">
                  <FilterSidebar
                    filters={filters}
                    setFilters={setFilters}
                    totals={{ shown: filtered.length, total: duties.length }}
                    allRoutes={allRoutes}
                  />
                </div>
                <DutyList
                  duties={filtered}
                  savedIds={savedIds}
                  onToggleSave={toggleSave}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                />
              </div>
            ) : (
              <EmptyState busy={busy} />
            )}
          </>
        )}
      </main>

      <footer className="text-center text-sm text-slate-500 py-6 no-print">
        Built for senior transit operators. All processing happens in your
        browser — your PDFs are never uploaded anywhere.
      </footer>
    </div>
  );
}

function Header({ view, setView, savedCount, signupCount, blockCount, onClearAll }) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Transit Duty Selector
          </h1>
          <p className="text-base text-slate-600">
            Find your perfect shift — drag in PDFs, filter, and save.
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('browse')}
            className={`px-3 py-1.5 rounded-lg text-base font-medium border ${
              view === 'browse'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            Browse duties
          </button>
          <button
            type="button"
            onClick={() => setView('saved')}
            className={`px-3 py-1.5 rounded-lg text-base font-medium border ${
              view === 'saved'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
            aria-label={`My choices, ${savedCount} saved`}
          >
            My choices ({savedCount})
          </button>
          {(signupCount > 0 || blockCount > 0) && (
            <button
              type="button"
              onClick={onClearAll}
              className="px-3 py-1.5 rounded-lg text-base text-rose-700 border border-rose-200 bg-white"
            >
              Clear PDFs
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

function FileSummary({ signups, blockReports }) {
  const dutyCount = signups.reduce((a, s) => a + s.duties.length, 0);
  const blockCount = blockReports.reduce((a, b) => a + b.blocks.length, 0);
  return (
    <p className="mt-3 text-base text-slate-700" aria-live="polite">
      Loaded <strong>{dutyCount}</strong> duties from{' '}
      <strong>{signups.length}</strong> signup PDF
      {signups.length === 1 ? '' : 's'} and <strong>{blockCount}</strong>{' '}
      blocks from <strong>{blockReports.length}</strong> block report
      {blockReports.length === 1 ? '' : 's'}.
    </p>
  );
}

function EmptyState({ busy }) {
  if (busy) return null;
  return (
    <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <h2 className="text-xl font-semibold text-slate-900">Ready when you are</h2>
      <p className="text-base text-slate-600 mt-2 max-w-2xl mx-auto">
        Upload at least one <strong>Signup Reference</strong> (the driver
        roster) and one matching <strong>Block Report</strong> (the bus
        schedule) to start exploring duties.
      </p>
    </div>
  );
}

function mergeByFile(prev, incoming) {
  const map = new Map(prev.map((p) => [p.file_name, p]));
  for (const it of incoming) {
    map.set(it.file_name, it);
  }
  return [...map.values()];
}

function filterMatch(d, f) {
  if (f.daysOff.length) {
    // Each duty only covers a slice of the week (Mon-Fri / Sat / Sun) so
    // the filter only enforces per-day rules on the days this duty's
    // signup actually documents. For days the duty doesn't cover, the
    // user is presumed to pick a separate compatible duty.
    //
    //   wantOff[day]  duty covers day  rule
    //   ──────────────────────────────────────────────────────────────
    //   true          true             duty must have day in days_off
    //   false         true             duty must NOT have day in days_off
    //   *             false            no constraint (different duty's job)
    const covered = d.covered_days ?? DAY_LABELS;
    for (const day of covered) {
      const wantOff = f.daysOff.includes(day);
      const isOff = d.days_off.includes(day);
      if (wantOff !== isOff) return false;
    }
  }
  if (f.shiftTypes.length && !f.shiftTypes.includes(d.shift_category)) return false;
  if (d.earliest_start_min != null && d.earliest_start_min < f.earliestStart) return false;
  if (d.latest_end_min != null && d.latest_end_min > f.latestEnd) return false;
  if ((d.paid_min ?? 0) < f.minPaidHours * 60) return false;
  if ((d.paid_week_min ?? 0) < f.minPaidWeekHours * 60) return false;
  if ((d.bonus_min ?? 0) < f.minBonusMin) return false;
  if (f.sameDepotOnly && !d.same_depot) return false;
  if (f.singleRouteOnly && d.routes.length > 1) return false;
  if ((d.deadhead_min ?? 0) > f.maxDeadheadMin) return false;
  if (f.search.trim()) {
    const tokens = f.search
      .toLowerCase()
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length) {
      const haystack = [
        d.roster_number,
        d.daily_duty_number,
        d.duty_type,
        d.start_location,
        d.end_location,
        ...(d.routes ?? []),
      ]
        .join(' ')
        .toLowerCase();
      // Multi-token search is OR-matching: a duty matches if ANY of the
      // entered terms is found. This makes "320, 324" return duties driving
      // either route, which is the natural reading for comma-separated lists.
      if (!tokens.some((t) => haystack.includes(t))) return false;
    }
  }
  return true;
}
