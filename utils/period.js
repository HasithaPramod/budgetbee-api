// Budget periods and bill due dates in Sri Lanka time (UTC+05:30, no DST), so
// "today", "this week" and "this month" are right even when the server runs
// in UTC. APP_TZ_OFFSET_MINUTES overrides the offset.

const DAY_MS = 24 * 60 * 60 * 1000;

const offsetMs = () => {
  const raw = process.env.APP_TZ_OFFSET_MINUTES;
  const minutes = raw === undefined || raw === '' ? 330 : Number(raw);
  return (Number.isFinite(minutes) ? minutes : 330) * 60 * 1000;
};

// Local calendar date of an instant
const localParts = (date) => {
  const shifted = new Date(date.getTime() + offsetMs());
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0 = Sunday
  };
};

// Instant of local midnight; month/day may overflow (Date.UTC normalises them)
const localMidnight = (year, month, day) => new Date(Date.UTC(year, month, day) - offsetMs());

const startOfDay = (date = new Date()) => {
  const { year, month, day } = localParts(date);
  return localMidnight(year, month, day);
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

// Whole local days from `from` to `to` (negative when `to` is earlier)
const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

const PERIODS = ['daily', 'weekly', 'monthly'];

// { start, end } of the day, week (Monday to Sunday) or month containing
// `date`. `end` is exclusive.
const periodRange = (period, date = new Date()) => {
  const { year, month, day, weekday } = localParts(date);
  if (period === 'daily') {
    const start = localMidnight(year, month, day);
    return { start, end: addDays(start, 1) };
  }
  if (period === 'weekly') {
    const start = localMidnight(year, month, day - ((weekday + 6) % 7));
    return { start, end: addDays(start, 7) };
  }
  if (period === 'monthly') {
    return { start: localMidnight(year, month, 1), end: localMidnight(year, month + 1, 1) };
  }
  throw new Error(`Unknown period: ${period}`);
};

// Days left in the range, today included (at least 1)
const daysLeftInRange = (range, now = new Date()) =>
  Math.max(1, Math.round((range.end - startOfDay(now)) / DAY_MS));

const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// The due date after `date` for a repeating bill, or null for a one-off
// ('once') bill. Monthly and yearly bills keep their due day: a bill due on
// the 31st falls on 28/29 February, then on 31 March again.
const nextDueDate = (date, frequency, dueDay) => {
  if (frequency === 'weekly') return addDays(startOfDay(date), 7);
  const { year, month, day } = localParts(date);
  const wanted = dueDay || day;
  if (frequency === 'monthly') {
    const y = year + Math.floor((month + 1) / 12);
    const m = (month + 1) % 12;
    return localMidnight(y, m, Math.min(wanted, daysInMonth(y, m)));
  }
  if (frequency === 'yearly') {
    return localMidnight(year + 1, month, Math.min(wanted, daysInMonth(year + 1, month)));
  }
  return null;
};

// Local day of the month a date falls on (stored as a bill's dueDay)
const localDayOfMonth = (date) => localParts(date).day;

// Parses a date sent by the app. "YYYY-MM-DD" means that calendar day in
// Sri Lanka; anything else must be a valid ISO timestamp. Returns null when
// the value is not a real date.
const parseDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    if (month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
    return localMidnight(year, month, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Same as parseDate, then moved to the start of that local day
const parseDay = (value) => {
  const date = parseDate(value);
  return date && startOfDay(date);
};

// "YYYY-MM-DD" of the local day (what the app gets back for due/target dates)
const formatDay = (date) => {
  if (!date) return null;
  const { year, month, day } = localParts(date);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

module.exports = {
  DAY_MS,
  PERIODS,
  startOfDay,
  addDays,
  daysBetween,
  periodRange,
  daysLeftInRange,
  nextDueDate,
  localDayOfMonth,
  parseDate,
  parseDay,
  formatDay,
};
