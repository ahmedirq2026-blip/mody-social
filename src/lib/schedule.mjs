// Converts a wall-clock time in America/New_York into a true UTC instant,
// correctly handling EST/EDT transitions. No dependencies.

const TZ = 'America/New_York';

function tzOffsetMs(date, tz = TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return date.getTime() - asUTC;
}

/** 10:00 AM Eastern on the given calendar date -> UTC Date */
export function easternWallTimeToUtc(year, month, day, hour = 10, minute = 0) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let offset = tzOffsetMs(new Date(naive));
  let ts = naive + offset;
  const settled = tzOffsetMs(new Date(ts));
  if (settled !== offset) ts = naive + settled;
  return new Date(ts);
}

/** Buffer wants ISO 8601 UTC with milliseconds: 2026-03-10T15:00:00.000Z */
export function toBufferDueAt(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/** Day-of-week in Eastern time for a calendar date (0 = Sunday) */
export function easternWeekday(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The month to generate: next month by default, or MONTH=YYYY-MM */
export function targetMonth(override = process.env.MONTH) {
  if (override && /^\d{4}-\d{2}$/.test(override)) {
    const [y, m] = override.split('-').map(Number);
    return { year: y, month: m, key: override };
  }
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 2; // next month
  const year = m > 12 ? y + 1 : y;
  const month = m > 12 ? m - 12 : m;
  return { year, month, key: `${year}-${String(month).padStart(2, '0')}` };
}

/** Every posting slot for a month: 10:00 AM ET each day */
export function monthSlots(year, month, hour = 10) {
  const out = [];
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const at = easternWallTimeToUtc(year, month, d, hour);
    out.push({
      day: d,
      weekday: easternWeekday(year, month, d),
      isSunday: easternWeekday(year, month, d) === 0,
      dueAt: toBufferDueAt(at),
      localLabel: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00 ET`
    });
  }
  return out;
}
