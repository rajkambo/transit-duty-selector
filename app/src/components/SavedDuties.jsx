import { minutesToClock, minutesToDurationHHhMM } from '../utils/timeUtils.js';

function fmt(m) {
  return m == null ? '—' : minutesToDurationHHhMM(m);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildPlainText(duties) {
  const lines = ['MY SHORTLISTED DUTIES', ''];
  for (const d of duties) {
    const profiles = d.profiles ?? [];
    const isSplitWeek = profiles.length > 1;
    const titleNum = isSplitWeek
      ? d.roster_number
      : (d.daily_duty_number ?? d.roster_number);
    const titlePrefix = isSplitWeek ? 'Roster' : 'Duty';
    lines.push(
      `${titlePrefix} #${titleNum} (Roster ${d.roster_number}) — ${d.duty_type}`,
    );
    lines.push(
      `  ${minutesToClock(d.earliest_start_min)} → ${minutesToClock(d.latest_end_min)} | Paid ${fmt(d.paid_min)}/shift (${fmt(d.paid_week_min)}/wk) · Working ${fmt(d.working_min)}/shift · Bonus +${fmt(d.bonus_min ?? 0)}/shift`,
    );
    lines.push(
      `  Routes: ${d.routes.join(', ') || '—'} | Days off: ${d.days_off.join(', ') || '—'}`,
    );
    for (const profile of profiles) {
      if (isSplitWeek) {
        lines.push(
          `  On ${profile.working_days.join(', ') || '—'} (daily ${profile.daily_duty_number}): ${profile.start_location} → ${profile.end_location}${profile.same_depot ? ' (same depot)' : ''}`,
        );
      } else {
        lines.push(
          `  ${profile.start_location} → ${profile.end_location}${profile.same_depot ? ' (same depot)' : ''}`,
        );
      }
      for (const p of profile.pieces_enriched) {
        lines.push(
          `    Block ${p.piece.line_group}-${p.piece.block_number}: ${p.piece.start_time} ${p.piece.start_location} → ${p.piece.end_time} ${p.piece.end_location}`,
        );
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export default function SavedDuties({ duties, onUnsave, onClose }) {
  if (!duties.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-600">
        <p className="text-lg">You haven't saved any duties yet.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-base font-medium"
        >
          Back to browsing
        </button>
      </div>
    );
  }

  const text = buildPlainText(duties);

  return (
    <section aria-label="Saved duties" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h2 className="text-2xl font-semibold text-slate-900">
          My choices ({duties.length})
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copyToClipboard(text)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-base"
          >
            Copy as text
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-base"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-base"
          >
            Close
          </button>
        </div>
      </header>

      <ul className="space-y-3">
        {duties.map((d) => {
          const profiles = d.profiles ?? [];
          const isSplitWeek = profiles.length > 1;
          const titleNum = isSplitWeek
            ? d.roster_number
            : (d.daily_duty_number ?? d.roster_number);
          const titlePrefix = isSplitWeek ? 'Roster' : 'Duty';
          return (
            <li
              key={d.id}
              className="bg-white border border-slate-200 rounded-2xl p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xl font-semibold text-slate-900">
                  {titlePrefix} #{titleNum}{' '}
                  <span className="text-base font-normal text-slate-600">
                    (Roster {d.roster_number} · {d.duty_type}
                    {isSplitWeek && ` · ${profiles.length} daily duties`})
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => onUnsave(d.id)}
                  className="text-base text-rose-700 underline no-print"
                >
                  Remove
                </button>
              </div>
              <p className="text-base text-slate-800 font-mono mt-1">
                {minutesToClock(d.earliest_start_min)} →{' '}
                {minutesToClock(d.latest_end_min)} · Paid {fmt(d.paid_min)}
                /shift · Working {fmt(d.working_min)}/shift · Bonus +
                {fmt(d.bonus_min ?? 0)}/shift
              </p>
              <p className="text-base text-slate-700 mt-1">
                Routes:{' '}
                <span className="font-mono">{d.routes.join(', ') || '—'}</span>{' '}
                · Days off: {d.days_off.join(', ') || '—'}
              </p>
              {profiles.map((profile) => (
                <div key={profile.daily_duty_number} className="mt-2">
                  {isSplitWeek && (
                    <p className="text-base text-slate-700">
                      On {profile.working_days.join(', ') || '—'} (daily{' '}
                      {profile.daily_duty_number}):{' '}
                      <span className="font-mono">
                        {profile.start_location} → {profile.end_location}
                      </span>
                      {profile.same_depot && (
                        <span className="text-emerald-700"> (same)</span>
                      )}
                    </p>
                  )}
                  {!isSplitWeek && (
                    <p className="text-base text-slate-700 font-mono">
                      {profile.start_location} → {profile.end_location}
                      {profile.same_depot && (
                        <span className="text-emerald-700"> (same)</span>
                      )}
                    </p>
                  )}
                  <ul className="mt-1 text-sm text-slate-600 font-mono">
                    {profile.pieces_enriched.map((p, i) => (
                      <li key={i}>
                        Block {p.piece.line_group}-{p.piece.block_number}:{' '}
                        {p.piece.start_time} {p.piece.start_location} →{' '}
                        {p.piece.end_time} {p.piece.end_location}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
