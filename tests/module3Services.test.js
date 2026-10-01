process.env.APP_TZ_OFFSET_MINUTES = '330';

const test = require('node:test');
const assert = require('node:assert/strict');
const { periodRange, parseDay } = require('../utils/period');
const { budgetLimit, spentFor, budgetStatus, computeSafeToSpend } = require('../services/budgetService');
const { dueStatus, dueDatesBefore, amountDueBefore } = require('../services/paymentService');
const { goalJson, syncCompletion } = require('../services/savingsService');

// Wednesday 30 Sep 2026, 12:00 in Colombo
const NOW = new Date('2026-09-30T06:30:00Z');

const tx = { total: 1500, byCategory: { fuel: 1000, food: 500 } };
const bills = { total: 20000, byCategory: { rent: 20000 } };

test('paid bills count toward weekly and monthly budgets, not daily ones', () => {
  assert.equal(spentFor({ category: 'all', period: 'daily' }, tx, bills), 1500);
  assert.equal(spentFor({ category: 'all', period: 'monthly' }, tx, bills), 21500);
  assert.equal(spentFor({ category: 'fuel', period: 'weekly' }, tx, bills), 1000);
  assert.equal(spentFor({ category: 'rent', period: 'monthly' }, tx, bills), 20000);
  assert.equal(spentFor({ category: 'health', period: 'monthly' }, tx, bills), 0);
});

test('an income-based limit follows what was earned', () => {
  assert.equal(budgetLimit({ limitType: 'income_percent', incomePercent: 20 }, 15000), 3000);
  assert.equal(budgetLimit({ limitType: 'income_percent', incomePercent: 20 }, 0), 0);
  assert.equal(budgetLimit({ limitType: 'fixed', amount: 4000 }, 15000), 4000);
});

test('budget status: on track, near the limit, over the limit', () => {
  assert.equal(budgetStatus(500, 1000, 80), 'on_track');
  assert.equal(budgetStatus(800, 1000, 80), 'near_limit');
  assert.equal(budgetStatus(1000, 1000, 80), 'near_limit');
  assert.equal(budgetStatus(1001, 1000, 80), 'over_limit');
  assert.equal(budgetStatus(0, 0, 80), 'on_track');
  assert.equal(budgetStatus(10, 0, 80), 'over_limit');
});

test('safe to spend with a daily budget is the limit minus today', () => {
  const budget = { _id: 'b1', period: 'daily' };
  const result = computeSafeToSpend({
    budget,
    limit: 4020,
    range: periodRange('daily', NOW),
    now: NOW,
    spentToday: 2120,
  });
  assert.equal(result.total, 4020);
  assert.equal(result.used, 2120);
  assert.equal(result.safeToSpend, 1900);
  assert.equal(result.percentUsed, 53);
  assert.equal(result.overspent, false);
});

test('safe to spend with a weekly budget spreads what is left over the days left', () => {
  // Wednesday: Wed, Thu, Fri, Sat, Sun = 5 days
  const result = computeSafeToSpend({
    budget: { _id: 'b1', period: 'weekly' },
    limit: 14000,
    range: periodRange('weekly', NOW),
    now: NOW,
    spentBeforeToday: 3000,
    billsPaid: 1000,
    billsDue: 2000,
    spentToday: 500,
  });
  assert.equal(result.daysLeft, 5);
  assert.equal(result.total, 1600); // (14000 - 3000 - 1000 - 2000) / 5
  assert.equal(result.safeToSpend, 1100);
  assert.equal(result.reservedForBills, 2000);
});

test('paying a planned bill today does not lower today\'s allowance', () => {
  const base = { budget: { _id: 'b1', period: 'monthly' }, limit: 60000, range: periodRange('monthly', NOW), now: NOW };
  const before = computeSafeToSpend({ ...base, billsDue: 20000 });
  const after = computeSafeToSpend({ ...base, billsPaid: 20000 });
  assert.equal(before.total, after.total);
});

test('overspending leaves nothing safe to spend', () => {
  const result = computeSafeToSpend({
    budget: { _id: 'b1', period: 'weekly' },
    limit: 5000,
    range: periodRange('weekly', NOW),
    now: NOW,
    spentBeforeToday: 6000,
    spentToday: 100,
  });
  assert.equal(result.total, 0);
  assert.equal(result.safeToSpend, 0);
  assert.equal(result.percentUsed, 100);
  assert.equal(result.overspent, true);
});

const bill = (overrides) => ({
  status: 'active',
  frequency: 'monthly',
  amount: 1000,
  reminderDaysBefore: 3,
  totalInstallments: null,
  paidInstallments: 0,
  ...overrides,
});

test('due status of a bill', () => {
  assert.equal(dueStatus(bill({ nextDueDate: parseDay('2026-09-29') }), NOW), 'overdue');
  assert.equal(dueStatus(bill({ nextDueDate: parseDay('2026-09-30') }), NOW), 'due_today');
  assert.equal(dueStatus(bill({ nextDueDate: parseDay('2026-10-03') }), NOW), 'due_soon');
  assert.equal(dueStatus(bill({ nextDueDate: parseDay('2026-10-04') }), NOW), 'upcoming');
  assert.equal(dueStatus(bill({ nextDueDate: parseDay('2026-09-01'), status: 'paused' }), NOW), 'paused');
});

test('unpaid due dates before a date include every missed payment', () => {
  const monthEnd = periodRange('monthly', NOW).end;
  const overdue = bill({ nextDueDate: parseDay('2026-08-15'), dueDay: 15 });
  assert.equal(dueDatesBefore(overdue, monthEnd).length, 2); // 15 Aug and 15 Sep
  const loan = bill({ nextDueDate: parseDay('2026-08-15'), dueDay: 15, totalInstallments: 12, paidInstallments: 11 });
  assert.equal(dueDatesBefore(loan, monthEnd).length, 1); // only one installment left
  const weekly = bill({ frequency: 'weekly', nextDueDate: parseDay('2026-10-01'), amount: 500 });
  assert.equal(amountDueBefore([weekly], periodRange('weekly', NOW).end), 500);
  assert.equal(amountDueBefore([bill({ nextDueDate: parseDay('2026-09-10'), status: 'paused' })], monthEnd), 0);
});

const goal = (overrides) => ({
  _id: 'g1',
  name: 'Tyres',
  category: 'repairs',
  targetAmount: 30000,
  savedAmount: 9000,
  targetDate: parseDay('2026-10-30'),
  status: 'active',
  ...overrides,
});

test('goal progress and suggested saving per day and week', () => {
  const json = goalJson(goal(), NOW);
  assert.equal(json.remainingAmount, 21000);
  assert.equal(json.progressPercent, 30);
  assert.equal(json.daysLeft, 30);
  assert.equal(json.suggestedPerDay, 700); // 21000 / 30
  assert.equal(json.suggestedPerWeek, 4200); // 21000 / 5 weeks
  assert.equal(json.targetDate, '2026-10-30');

  assert.equal(goalJson(goal({ savedAmount: 29990 }), NOW).progressPercent, 99);
  assert.equal(goalJson(goal({ targetDate: null }), NOW).suggestedPerDay, null);
  assert.equal(goalJson(goal({ targetDate: parseDay('2026-09-01') }), NOW).suggestedPerDay, null);
});

test('a goal completes at its target and reopens after a withdrawal', () => {
  const g = goal({ savedAmount: 30000 });
  assert.equal(syncCompletion(g), true);
  assert.equal(g.status, 'completed');
  g.savedAmount = 25000;
  assert.equal(syncCompletion(g), false);
  assert.equal(g.status, 'active');
  const archived = goal({ savedAmount: 30000, status: 'archived' });
  syncCompletion(archived);
  assert.equal(archived.status, 'archived');
});
