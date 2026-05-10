import { useState } from 'react';
import VisualTimeline from './VisualTimeline.jsx';
import { DAY_LABELS, minutesToDurationHHhMM, minutesToClock } from '../utils/timeUtils.js';

function fmtMin(m) {
  if (m == null) return '—';
  return minutesToDurationHHhMM(m);
}

function bonusBadge(duty) {
  const b = duty.bonus_min;
  if (b == null) return null;
  if (b <= 0) return null;
  const high = (duty.bonus_ratio ?? 0) >= 0.07; // ≥ ~5 min/hr is meaningful
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-base font-semibold ${
        high ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-50 text-emerald-700'
      }`}
      title="Per-shift paid time minus actual working time"
    >
      Bonus +{minutesToDurationHHhMM(b)} / shift
    </span>
  );
}

function shiftCategoryLabel(cat) {
  switch (cat) {
    case 'cww':
      return 'Compressed (CWW)';
    case 'split':
      return 'Split';
    case 'straight':
      return 'Straight';
    default:
      return 'Other';
  }
}

export default function DutyCard({ duty, saved, onToggleSave }) {
  const [open, setOpen] = useState(false);

  const covered = duty.covered_days ?? DAY_LABELS;
  const workingDays = covered.filter((d) => !duty.days_off.includes(d));
  const offDays = covered.filter((d) => duty.days_off.includes(d));
  const scopeLabel =
    duty.signup_kind === 'weekday'
      ? 'Mon–Fri only'
      : duty.signup_kind === 'saturday'
        ? 'Saturday only'
        : duty.signup_kind === 'sunday'
          ? 'Sunday only'
          : null;

  return (
    <article className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">
            Duty <span className="font-mono">#{duty.daily_duty_number ?? duty.roster_number}</span>
          </h3>
          <p className="text-base text-slate-600 mt-0.5">
            Roster {duty.roster_number} · {shiftCategoryLabel(duty.shift_category)} (
            {duty.duty_type})
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {bonusBadge(duty)}
          <button
            type="button"
            onClick={() => onToggleSave(duty.id)}
            className={`px-3 py-1.5 rounded-lg text-base font-medium border transition ${
              saved
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            aria-pressed={saved}
          >
            {saved ? '★ Saved' : '☆ Save for later'}
          </button>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-4">
        <Stat label="Start" value={minutesToClock(duty.earliest_start_min)} mono />
        <Stat label="End" value={minutesToClock(duty.latest_end_min)} mono />
        <Stat
          label="Paid (per shift)"
          value={fmtMin(duty.paid_min)}
          sub={
            duty.working_days_count > 1
              ? `${fmtMin(duty.paid_week_min)} / wk · ${duty.working_days_count} days`
              : null
          }
          mono
        />
        <Stat
          label="Working (per shift)"
          value={fmtMin(duty.working_min)}
          sub={
            duty.working_days_count > 1
              ? `${fmtMin(duty.working_week_min)} / wk`
              : null
          }
          mono
        />
      </dl>

      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 text-base text-slate-700">
        <div>
          <dt className="text-slate-500 text-sm">From → To</dt>
          <dd className="font-mono">
            {duty.start_location} → {duty.end_location}{' '}
            {duty.same_depot && (
              <span className="ml-1 text-emerald-700 text-sm">(same)</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 text-sm">Routes</dt>
          <dd className="font-mono">{duty.routes.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 text-sm">Days off</dt>
          <dd>{offDays.length ? offDays.join(', ') : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 text-sm">Working days</dt>
          <dd>
            {workingDays.join(', ') || '—'}
            {scopeLabel && (
              <span className="block text-xs text-slate-500">
                ({scopeLabel})
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <VisualTimeline duty={duty} />
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 text-sm text-slate-600">
        <span>Driving: <strong>{fmtMin(duty.driving_min)}</strong></span>
        <span>Deadhead: <strong>{fmtMin(duty.deadhead_min)}</strong></span>
        <span>Layover: <strong>{fmtMin(duty.layover_min)}</strong></span>
        <span>
          Split break:{' '}
          <strong>{duty.split_break_min > 0 ? fmtMin(duty.split_break_min) : '—'}</strong>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-4 text-base text-blue-700 underline"
      >
        {open ? 'Hide' : 'Show'} layovers and trip details
      </button>

      {open && <DutyDetails duty={duty} />}
    </article>
  );
}

function Stat({ label, value, sub, mono }) {
  return (
    <div>
      <dt className="text-slate-500 text-sm">{label}</dt>
      <dd className={`text-2xl text-slate-900 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function DutyDetails({ duty }) {
  return (
    <div className="mt-4 border-t border-slate-200 pt-4 space-y-4">
      {duty.pieces_enriched.map((p, idx) => (
        <div key={idx}>
          <h4 className="text-base font-semibold text-slate-900">
            Piece {idx + 1}: Block {p.piece.line_group}-{p.piece.block_number} (
            {p.piece.start_time} {p.piece.start_location} → {p.piece.end_time}{' '}
            {p.piece.end_location})
          </h4>
          {!p.block_found && (
            <p className="text-base text-rose-700 mt-1">
              No matching block found. Make sure you uploaded the matching
              Block Report.
            </p>
          )}
          {p.segments.filter((s) => s.kind === 'layover').length > 0 && (
            <p className="text-base text-slate-700 mt-1">
              Layovers:{' '}
              {p.segments
                .filter((s) => s.kind === 'layover')
                .map((s) => s.label)
                .join(', ')}
            </p>
          )}
          <ol className="mt-2 text-sm text-slate-700 font-mono">
            {p.segments
              .filter((s) => s.kind === 'driving' || s.kind === 'deadhead')
              .map((s, i) => (
                <li key={i}>
                  {minutesToClock(s.start)}–{minutesToClock(s.end)}{' '}
                  <span
                    className={
                      s.kind === 'deadhead' ? 'text-slate-500' : 'text-blue-800'
                    }
                  >
                    {s.label}
                  </span>
                </li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
