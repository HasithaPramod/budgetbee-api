const Budget = require('../models/Budget');
const SavingsGoal = require('../models/SavingsGoal');
const Payment = require('../models/Payment');
const { EMPTY_TOTALS, transactionTotals, billTotals, incomeTotal } = require('./spendingService');
const { sortGoals, goalJson, savingsTotals } = require('./savingsService');
const { amountDueBefore, upcomingPayments } = require('./paymentService');
const { addDays, daysLeftInRange, formatDay, periodRange } = require('../utils/period');

const money = (n) => Math.round(n * 100) / 100;

const PERIOD_ORDER = { daily: 0, weekly: 1, monthly: 2 };

const percentOf = (part, whole) => {
  if (whole > 0) return Math.round((part / whole) * 100);
  return part > 0 ? 100 : 0;
};

// Overall budget first, then daily, weekly, monthly, then by category
const sortBudgets = (a, b) =>
  (a.category === 'all' ? 0 : 1) - (b.category === 'all' ? 0 : 1) ||
  PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period] ||
  a.category.localeCompare(b.category);

const budgetLimit = (budget, income) =>
  budget.limitType === 'income_percent' ? money((income * budget.incomePercent) / 100) : budget.amount;

// Spending that counts toward a budget. Paid bills count toward weekly and
// monthly budgets only: a daily budget is for day-to-day spending, and a
// monthly rent payment would otherwise use up that day's limit.
const spentFor = (budget, tx, bills) => {
  const of = (totals) => (budget.category === 'all' ? totals.total : totals.byCategory[budget.category] || 0);
  return of(tx) + (budget.period === 'daily' ? 0 : of(bills));
};

const budgetStatus = (spent, limit, alertAt) => {
  if (spent > limit) return 'over_limit';
  return limit > 0 && (spent / limit) * 100 >= alertAt ? 'near_limit' : 'on_track';
};

const budgetJson = (budget, { spent, income, range, now }) => {
  const limit = budgetLimit(budget, income);
  return {
    _id: budget._id,
    name: budget.name,
    category: budget.category,
    period: budget.period,
    limitType: budget.limitType,
    amount: budget.amount ?? null,
    incomePercent: budget.incomePercent ?? null,
    alertAt: budget.alertAt,
    isActive: budget.isActive,
    limit,
    income: budget.limitType === 'income_percent' ? money(income) : null,
    spent: money(spent),
    remaining: money(Math.max(0, limit - spent)),
    percentUsed: percentOf(spent, limit),
    status: budgetStatus(spent, limit, budget.alertAt),
    periodStart: formatDay(range.start),
    periodEnd: formatDay(addDays(range.end, -1)),
    daysLeft: daysLeftInRange(range, now),
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  };
};

// Budgets JSON with this period's spending, one set of queries per period used
const budgetsWithProgress = async (userId, budgets, now = new Date()) => {
  const periods = [...new Set(budgets.map((b) => b.period))];
  const totals = Object.fromEntries(
    await Promise.all(
      periods.map(async (period) => {
        const range = periodRange(period, now);
        const needsIncome = budgets.some((b) => b.period === period && b.limitType === 'income_percent');
        const [tx, bills, income] = await Promise.all([
          transactionTotals(userId, range),
          period === 'daily' ? EMPTY_TOTALS : billTotals(userId, range),
          needsIncome ? incomeTotal(userId, range) : 0,
        ]);
        return [period, { range, tx, bills, income }];
      })
    )
  );
  return budgets.map((budget) => {
    const { range, tx, bills, income } = totals[budget.period];
    return budgetJson(budget, { spent: spentFor(budget, tx, bills), income, range, now });
  });
};

// "Safe to spend today" from the overall budget.
// Daily budget: the whole limit is today's allowance.
// Weekly/monthly: what is left of the limit after spending before today, bills
// already paid and bills still due this period (overdue included) is shared
// evenly over the days left, today included. Paying a planned bill therefore
// does not lower today's allowance, but an unplanned big spend lowers the
// following days. `used` is today's spending.
const computeSafeToSpend = ({
  budget,
  limit,
  range,
  now = new Date(),
  spentBeforeToday = 0,
  spentToday = 0,
  billsPaid = 0,
  billsDue = 0,
}) => {
  const daily = budget.period === 'daily';
  const daysLeft = daily ? 1 : daysLeftInRange(range, now);
  const total = Math.floor(
    daily ? limit : Math.max(0, limit - spentBeforeToday - billsPaid - billsDue) / daysLeft
  );
  return {
    hasBudget: true,
    budgetId: budget._id,
    period: budget.period,
    limit,
    total,
    used: money(spentToday),
    safeToSpend: money(Math.max(0, total - spentToday)),
    percentUsed: percentOf(spentToday, total),
    overspent: spentToday > total,
    reservedForBills: daily ? 0 : money(billsDue),
    daysLeft,
  };
};

const getSafeToSpend = async (userId, now = new Date()) => {
  const overall = await Budget.find({ user: userId, category: 'all', isActive: true });
  const budget = overall.sort((a, b) => PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period])[0];
  if (!budget) return { hasBudget: false };

  const range = periodRange(budget.period, now);
  const today = periodRange('daily', now);
  const [todayTx, income] = await Promise.all([
    transactionTotals(userId, today),
    budget.limitType === 'income_percent' ? incomeTotal(userId, range) : 0,
  ]);
  const limit = budgetLimit(budget, income);
  if (budget.period === 'daily') {
    return computeSafeToSpend({ budget, limit, range, now, spentToday: todayTx.total });
  }

  const [beforeTx, bills, payments] = await Promise.all([
    transactionTotals(userId, { start: range.start, end: today.start }),
    billTotals(userId, range),
    Payment.find({ user: userId, status: 'active', nextDueDate: { $lt: range.end } }),
  ]);
  return computeSafeToSpend({
    budget,
    limit,
    range,
    now,
    spentBeforeToday: beforeTx.total,
    spentToday: todayTx.total,
    billsPaid: bills.total,
    billsDue: amountDueBefore(payments, range.end),
  });
};

// Everything the Budget tab shows, in one request
const getOverview = async (userId, now = new Date()) => {
  const [budgets, goals, payments, safeToSpend] = await Promise.all([
    Budget.find({ user: userId }).sort({ createdAt: 1 }),
    SavingsGoal.find({ user: userId }),
    Payment.find({ user: userId }),
    getSafeToSpend(userId, now),
  ]);
  const visibleGoals = goals.filter((g) => g.status !== 'archived').sort(sortGoals);
  return {
    safeToSpend,
    budgets: (await budgetsWithProgress(userId, budgets, now)).sort(sortBudgets),
    savings: {
      goals: visibleGoals.map((g) => goalJson(g, now)),
      ...savingsTotals(goals),
      archivedCount: goals.length - visibleGoals.length,
    },
    upcomingPayments: {
      ...upcomingPayments(payments, 7, now),
      activeCount: payments.filter((p) => p.status === 'active').length,
      totalCount: payments.length,
    },
    isEmpty: budgets.length === 0 && goals.length === 0 && payments.length === 0,
  };
};

module.exports = {
  sortBudgets,
  budgetLimit,
  spentFor,
  budgetStatus,
  budgetJson,
  budgetsWithProgress,
  computeSafeToSpend,
  getSafeToSpend,
  getOverview,
};
