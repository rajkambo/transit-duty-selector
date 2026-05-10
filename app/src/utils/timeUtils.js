// Time helpers for the Transit Duty Selector.
// Times in the schedule data can exceed 24:00 (e.g. "25:32" means 01:32 the
// next day). We normalize everything to "minutes since midnight of the
// shift's start day" so arithmetic and timeline rendering stay simple.

export function parseClockToMinutes(str) {
  if (str == null) return null;
  const s = String(str).trim();
  // Accept "HH:MM", "H:MM", or 3-4 digit raw numbers like "504" or "1822".
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  }
  if (/^\d{3,4}$/.test(s)) {
    const n = Number(s);
    const h = Math.floor(n / 100);
    const m = n % 100;
    return h * 60 + m;
  }
  return null;
}

export function minutesToClock(min) {
  if (min == null || Number.isNaN(min)) return '';
  const sign = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Convert HHhMM duration strings (e.g. "37h52") into minutes.
export function parseDurationHHhMM(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+)h(\d{1,2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToDurationHHhMM(min) {
  if (min == null || Number.isNaN(min)) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Each signup PDF only covers a slice of the week. Drivers compose a full
// weekly schedule by picking one weekday duty + (optionally) Saturday /
// Sunday duties. So a duty's days_off field is scoped to the days its
// signup actually documents.
export const COVERED_DAYS_BY_SIGNUP_KIND = {
  weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  saturday: ['Sat'],
  sunday: ['Sun'],
};
