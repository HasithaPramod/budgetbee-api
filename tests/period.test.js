process.env.APP_TZ_OFFSET_MINUTES = '330';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  startOfDay,
  daysBetween,
  periodRange,
  daysLeftInRange,
  nextDueDate,
  parseDate,
  parseDay,
  formatDay,
} = require('../utils/period');

const at = (iso) => new Date(iso);
// Wednesday 30 Sep 2026, 12:00 in Colombo
const WEDNESDAY_NOON = at('2026-09-30T06:30:00Z');

test('startOfDay uses Sri Lanka midnight, not UTC midnight', () => {
  // 23:59 on 30 Sep in Colombo
  assert.equal(startOfDay(at('2026-09-30T18:29:59Z')).toISOString(), '2026-09-29T18:30:00.000Z');
  // 00:00 on 1 Oct in Colombo (still 30 Sep in UTC)
  assert.equal(startOfDay(at('2026-09-30T18:30:00Z')).toISOString(), '2026-09-30T18:30:00.000Z');
});

test('daily range is one local day', () => {
  const { start, end } = periodRange('daily', WEDNESDAY_NOON);
  assert.equal(start.toISOString(), '2026-09-29T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-09-30T18:30:00.000Z');
});

test('weekly range runs Monday to Sunday', () => {
  const monday = '2026-09-27T18:30:00.000Z';
  const nextMonday = '2026-10-04T18:30:00.000Z';
  for (const now of [WEDNESDAY_NOON, at('2026-09-27T18:30:00Z'), at('2026-10-04T18:29:59Z')]) {
    const { start, end } = periodRange('weekly', now);
    assert.equal(start.toISOString(), monday);
    assert.equal(end.toISOString(), nextMonday);
  }
});

test('monthly range covers the local month, including the year end', () => {
  const sep = periodRange('monthly', WEDNESDAY_NOON);
  assert.equal(sep.start.toISOString(), '2026-08-31T18:30:00.000Z');
  assert.equal(sep.end.toISOString(), '2026-09-30T18:30:00.000Z');

  const dec = periodRange('monthly', at('2026-12-15T06:30:00Z'));
  assert.equal(formatDay(dec.start), '2026-12-01');
  assert.equal(dec.end.toISOString(), '2026-12-31T18:30:00.000Z');
});

test('days left in the period includes today', () => {
  assert.equal(daysLeftInRange(periodRange('weekly', WEDNESDAY_NOON), WEDNESDAY_NOON), 5);
  assert.equal(daysLeftInRange(periodRange('monthly', WEDNESDAY_NOON), WEDNESDAY_NOON), 1);
  assert.equal(daysLeftInRange(periodRange('daily', WEDNESDAY_NOON), WEDNESDAY_NOON), 1);
});

test('daysBetween counts local calendar days', () => {
  // 23:00 on 30 Sep to 01:00 on 1 Oct in Colombo
  assert.equal(daysBetween(at('2026-09-30T17:30:00Z'), at('2026-09-30T19:30:00Z')), 1);
  assert.equal(daysBetween(WEDNESDAY_NOON, parseDay('2026-09-28')), -2);
});

test('a monthly bill due on the 31st keeps its day after short months', () => {
  const jan31 = parseDay('2027-01-31');
  const feb = nextDueDate(jan31, 'monthly', 31);
  assert.equal(formatDay(feb), '2027-02-28');
  assert.equal(formatDay(nextDueDate(feb, 'monthly', 31)), '2027-03-31');
  assert.equal(formatDay(nextDueDate(parseDay('2028-01-31'), 'monthly', 31)), '2028-02-29');
});

test('monthly, yearly, weekly and one-off due dates', () => {
  assert.equal(formatDay(nextDueDate(parseDay('2026-12-10'), 'monthly', 10)), '2027-01-10');
  assert.equal(formatDay(nextDueDate(parseDay('2028-02-29'), 'yearly', 29)), '2029-02-28');
  assert.equal(formatDay(nextDueDate(parseDay('2026-09-30'), 'weekly')), '2026-10-07');
  assert.equal(nextDueDate(parseDay('2026-09-30'), 'once', 30), null);
});

test('parseDate reads app dates as Sri Lanka days and rejects bad ones', () => {
  assert.equal(parseDate('2026-10-05').toISOString(), '2026-10-04T18:30:00.000Z');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026-13-01'), null);
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(12345), null);
  assert.equal(parseDate('2026-09-30T10:00:00Z').toISOString(), '2026-09-30T10:00:00.000Z');
  assert.equal(formatDay(parseDay('2026-09-30T20:00:00Z')), '2026-10-01');
});
