const { daysBetween, formatDay } = require('../utils/period');

const money = (n) => Math.round(n * 100) / 100;

const STATUS_ORDER = { active: 0, completed: 1, archived: 2 };

// Active goals first (nearest target date first, goals without one last),
// then completed, then archived
const sortGoals = (a, b) =>
  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
  (a.targetDate ? a.targetDate.getTime() : Infinity) - (b.targetDate ? b.targetDate.getTime() : Infinity) ||
  a.createdAt - b.createdAt;

// Active and completed follow the saved amount; archived stays archived.
// Returns true when this call completed the goal.
const syncCompletion = (goal) => {
  if (goal.status === 'archived') return false;
  const reached = goal.savedAmount >= goal.targetAmount;
  if (reached && goal.status !== 'completed') {
    goal.status = 'completed';
    goal.completedAt = new Date();
    return true;
  }
  if (!reached && goal.status === 'completed') {
    goal.status = 'active';
    goal.completedAt = null;
  }
  return false;
};

// Goal JSON for the app, with progress and how much to put aside per day and
// per week to reach the target date
const goalJson = (goal, now = new Date()) => {
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const daysLeft = goal.targetDate ? daysBetween(now, goal.targetDate) : null;
  const canSuggest = goal.status === 'active' && remaining > 0 && daysLeft !== null && daysLeft >= 0;
  const days = Math.max(1, daysLeft || 0);
  return {
    _id: goal._id,
    name: goal.name,
    category: goal.category,
    targetAmount: goal.targetAmount,
    savedAmount: money(goal.savedAmount),
    targetDate: formatDay(goal.targetDate),
    status: goal.status,
    completedAt: goal.completedAt,
    remainingAmount: money(remaining),
    progressPercent: goal.savedAmount >= goal.targetAmount ? 100 : Math.floor((goal.savedAmount / goal.targetAmount) * 100),
    daysLeft,
    suggestedPerDay: canSuggest ? Math.ceil(remaining / days) : null,
    suggestedPerWeek: canSuggest ? Math.ceil(remaining / Math.ceil(days / 7)) : null,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
};

const contributionJson = (c) => ({
  _id: c._id,
  goal: c.goal,
  type: c.type,
  amount: c.amount,
  note: c.note,
  date: c.date,
  createdAt: c.createdAt,
});

// Totals over the goals the Budget tab shows (archived ones are hidden)
const savingsTotals = (goals) => {
  const visible = goals.filter((g) => g.status !== 'archived');
  return {
    totalSaved: money(visible.reduce((sum, g) => sum + g.savedAmount, 0)),
    totalTarget: money(visible.reduce((sum, g) => sum + g.targetAmount, 0)),
  };
};

module.exports = { sortGoals, syncCompletion, goalJson, contributionJson, savingsTotals };
