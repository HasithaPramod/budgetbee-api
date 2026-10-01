const { addDays, daysBetween, formatDay, nextDueDate, periodRange, startOfDay } = require('../utils/period');
const { billTotals } = require('./spendingService');

const money = (n) => Math.round(n * 100) / 100;

// overdue | due_today | due_soon (within reminderDaysBefore) | upcoming,
// or the bill's own paused / completed status
const dueStatus = (payment, now = new Date()) => {
  if (payment.status !== 'active') return payment.status;
  const days = daysBetween(now, payment.nextDueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due_today';
  if (days <= payment.reminderDaysBefore) return 'due_soon';
  return 'upcoming';
};

// Due dates of an active bill's unpaid payments before `until`, oldest
// first. A bill left unpaid for two months has two.
const dueDatesBefore = (payment, until, max = 60) => {
  if (payment.status !== 'active') return [];
  const left = payment.totalInstallments ? payment.totalInstallments - payment.paidInstallments : max;
  const dates = [];
  let date = payment.nextDueDate;
  while (date && date < until && dates.length < Math.min(left, max)) {
    dates.push(date);
    date = nextDueDate(date, payment.frequency, payment.dueDay);
  }
  return dates;
};

// Amount still to pay on these bills before `until`
const amountDueBefore = (payments, until) =>
  money(payments.reduce((sum, p) => sum + dueDatesBefore(p, until).length * p.amount, 0));

const STATUS_ORDER = { active: 0, paused: 1, completed: 2 };

// Active bills by due date, then paused, then completed (latest paid first)
const sortPayments = (a, b) =>
  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
  (a.status === 'completed'
    ? (b.lastPaidAt || 0) - (a.lastPaidAt || 0)
    : a.nextDueDate - b.nextDueDate);

const paymentJson = (payment, now = new Date()) => ({
  _id: payment._id,
  name: payment.name,
  category: payment.category,
  amount: payment.amount,
  frequency: payment.frequency,
  nextDueDate: formatDay(payment.nextDueDate),
  dueDay: payment.dueDay,
  reminderDaysBefore: payment.reminderDaysBefore,
  totalInstallments: payment.totalInstallments,
  paidInstallments: payment.paidInstallments,
  remainingInstallments: payment.totalInstallments
    ? Math.max(0, payment.totalInstallments - payment.paidInstallments)
    : null,
  status: payment.status,
  dueStatus: dueStatus(payment, now),
  daysUntilDue: payment.status === 'completed' ? null : daysBetween(now, payment.nextDueDate),
  notes: payment.notes,
  lastPaidAt: payment.lastPaidAt,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
});

const recordJson = (r) => ({
  _id: r._id,
  payment: r.payment,
  amount: r.amount,
  category: r.category,
  dueDate: formatDay(r.dueDate),
  paidAt: r.paidAt,
  note: r.note,
  createdAt: r.createdAt,
});

// Active bills that are overdue or due within `days` days
const upcomingPayments = (payments, days, now = new Date()) => {
  const until = addDays(startOfDay(now), days + 1);
  const due = payments
    .filter((p) => p.status === 'active' && p.nextDueDate < until)
    .sort((a, b) => a.nextDueDate - b.nextDueDate);
  return {
    days,
    payments: due.map((p) => paymentJson(p, now)),
    totalDue: money(due.reduce((sum, p) => sum + p.amount, 0)),
    overdueCount: due.filter((p) => dueStatus(p, now) === 'overdue').length,
  };
};

// Header of the Payments screen: paid so far this month, still to pay this
// month (overdue included) and how many bills are overdue
const paymentsSummary = async (userId, payments, now = new Date()) => {
  const month = periodRange('monthly', now);
  const paid = await billTotals(userId, month);
  return {
    paidThisMonth: money(paid.total),
    dueThisMonth: amountDueBefore(payments, month.end),
    overdueCount: payments.filter((p) => dueStatus(p, now) === 'overdue').length,
  };
};

module.exports = {
  dueStatus,
  dueDatesBefore,
  amountDueBefore,
  sortPayments,
  paymentJson,
  recordJson,
  upcomingPayments,
  paymentsSummary,
};
