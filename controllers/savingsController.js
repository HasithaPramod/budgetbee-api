const SavingsGoal = require('../models/SavingsGoal');
const SavingsContribution = require('../models/SavingsContribution');
const { sendError, serverError } = require('../utils/apiError');
const { isValidId, parseAmount, isValidNote, pick, sendSaveError } = require('../utils/validation');
const { addDays, parseDate, parseDay, startOfDay } = require('../utils/period');
const { sortGoals, syncCompletion, goalJson, contributionJson, savingsTotals } = require('../services/savingsService');

const MAX_OPEN_GOALS = 20;
const STATUSES = ['active', 'completed', 'archived'];
const GOAL_FIELDS = ['name', 'category', 'targetAmount', 'targetDate'];

// A malformed id, or another user's goal, is simply "not found"
const findOwnGoal = (req) =>
  isValidId(req.params.id) ? SavingsGoal.findOne({ _id: req.params.id, user: req.user._id }) : null;

// targetDate is "YYYY-MM-DD", or null / "" to remove it. Returns false when
// it is not a real date.
const applyTargetDate = (fields) => {
  if (fields.targetDate === undefined) return true;
  if (fields.targetDate === null || fields.targetDate === '') {
    fields.targetDate = null;
    return true;
  }
  fields.targetDate = parseDay(fields.targetDate);
  return fields.targetDate !== null;
};

// Entries can be dated today or earlier
const parseEntryDate = (value) => {
  if (value === undefined) return new Date();
  const date = parseDate(value);
  return date && date < addDays(startOfDay(), 1) ? date : null;
};

// @desc    List savings goals (optional ?status=active|completed|archived)
// @route   GET /api/savings
// @access  Private
const getGoals = async (req, res) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.status !== undefined) {
      if (!STATUSES.includes(req.query.status)) return sendError(res, 400, 'INVALID_INPUT');
      filter.status = req.query.status;
    }
    const goals = (await SavingsGoal.find(filter)).sort(sortGoals);
    const now = new Date();
    res.json({ goals: goals.map((g) => goalJson(g, now)), ...savingsTotals(goals) });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Create a savings goal. An optional savedAmount records money
//          already put aside as the first deposit.
// @route   POST /api/savings
// @access  Private
const createGoal = async (req, res) => {
  try {
    const body = req.body || {};
    const fields = pick(body, GOAL_FIELDS);
    if (!applyTargetDate(fields)) return sendError(res, 400, 'INVALID_INPUT');
    const starting = body.savedAmount == null || body.savedAmount === 0 ? 0 : parseAmount(body.savedAmount);
    if (starting === null) return sendError(res, 400, 'INVALID_AMOUNT');

    const open = await SavingsGoal.countDocuments({ user: req.user._id, status: { $ne: 'archived' } });
    if (open >= MAX_OPEN_GOALS) return sendError(res, 400, 'LIMIT_REACHED');

    const goal = new SavingsGoal({ ...fields, user: req.user._id, savedAmount: starting });
    syncCompletion(goal);
    await goal.save();
    if (starting > 0) {
      await SavingsContribution.create({ user: req.user._id, goal: goal._id, type: 'deposit', amount: starting });
    }
    res.status(201).json(goalJson(goal));
  } catch (err) {
    if (!sendSaveError(res, err)) serverError(res, err);
  }
};

// @desc    Get one goal with its latest entries
// @route   GET /api/savings/:id
// @access  Private
const getGoal = async (req, res) => {
  try {
    const goal = await findOwnGoal(req);
    if (!goal) return sendError(res, 404, 'GOAL_NOT_FOUND');
    const [recent, count] = await Promise.all([
      SavingsContribution.find({ goal: goal._id }).sort({ date: -1, _id: -1 }).limit(20),
      SavingsContribution.countDocuments({ goal: goal._id }),
    ]);
    res.json({ ...goalJson(goal), recentContributions: recent.map(contributionJson), contributionCount: count });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Update a goal (name, category, targetAmount, targetDate) or
//          archive / restore it with status 'archived' / 'active'
// @route   PATCH /api/savings/:id
// @access  Private
const updateGoal = async (req, res) => {
  try {
    const goal = await findOwnGoal(req);
    if (!goal) return sendError(res, 404, 'GOAL_NOT_FOUND');
    const body = req.body || {};
    const fields = pick(body, GOAL_FIELDS);
    if (!applyTargetDate(fields)) return sendError(res, 400, 'INVALID_INPUT');
    if (body.status !== undefined) {
      if (!['active', 'archived'].includes(body.status)) return sendError(res, 400, 'INVALID_INPUT');
      fields.status = body.status === 'archived' ? 'archived' : 'active';
    }
    goal.set(fields);
    syncCompletion(goal);
    await goal.save();
    res.json(goalJson(goal));
  } catch (err) {
    if (!sendSaveError(res, err)) serverError(res, err);
  }
};

// @desc    Delete a goal and its entries
// @route   DELETE /api/savings/:id
// @access  Private
const deleteGoal = async (req, res) => {
  try {
    const goal = await findOwnGoal(req);
    if (!goal) return sendError(res, 404, 'GOAL_NOT_FOUND');
    await SavingsContribution.deleteMany({ goal: goal._id });
    await goal.deleteOne();
    res.json({ message: 'Savings goal deleted', id: goal._id });
  } catch (err) {
    serverError(res, err);
  }
};

// Saves the goal if its saved amount moved it into or out of "completed".
// Returns true when the goal was just completed.
const saveCompletion = async (goal) => {
  const justCompleted = syncCompletion(goal);
  if (goal.isModified()) await goal.save();
  return justCompleted;
};

// @desc    Add money to a goal ('deposit') or take some out ('withdrawal')
// @route   POST /api/savings/:id/contributions
// @access  Private
const addContribution = async (req, res) => {
  try {
    const { type, amount, note, date } = req.body || {};
    if (!['deposit', 'withdrawal'].includes(type)) return sendError(res, 400, 'INVALID_INPUT');
    const value = parseAmount(amount);
    if (value === null) return sendError(res, 400, 'INVALID_AMOUNT');
    const when = parseEntryDate(date);
    if (!when || !isValidNote(note)) return sendError(res, 400, 'INVALID_INPUT');
    if (!isValidId(req.params.id)) return sendError(res, 404, 'GOAL_NOT_FOUND');

    // One atomic update, so two withdrawals at once can never take out more
    // than was saved
    const filter = { _id: req.params.id, user: req.user._id };
    if (type === 'withdrawal') filter.savedAmount = { $gte: value };
    const change = type === 'deposit' ? value : -value;
    const goal = await SavingsGoal.findOneAndUpdate(filter, { $inc: { savedAmount: change } }, { new: true });
    if (!goal) {
      const exists = await SavingsGoal.exists({ _id: req.params.id, user: req.user._id });
      return exists ? sendError(res, 400, 'WITHDRAW_MORE_THAN_SAVED') : sendError(res, 404, 'GOAL_NOT_FOUND');
    }

    let contribution;
    try {
      contribution = await SavingsContribution.create({
        user: req.user._id,
        goal: goal._id,
        type,
        amount: value,
        note,
        date: when,
      });
    } catch (err) {
      await SavingsGoal.updateOne({ _id: goal._id }, { $inc: { savedAmount: -change } });
      throw err;
    }

    const justCompleted = await saveCompletion(goal);
    res.status(201).json({ goal: goalJson(goal), contribution: contributionJson(contribution), justCompleted });
  } catch (err) {
    if (!sendSaveError(res, err)) serverError(res, err);
  }
};

// @desc    A goal's entries, newest first (?page=1&limit=20)
// @route   GET /api/savings/:id/contributions
// @access  Private
const getContributions = async (req, res) => {
  try {
    const goal = await findOwnGoal(req);
    if (!goal) return sendError(res, 404, 'GOAL_NOT_FOUND');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [items, total] = await Promise.all([
      SavingsContribution.find({ goal: goal._id })
        .sort({ date: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      SavingsContribution.countDocuments({ goal: goal._id }),
    ]);
    res.json({ contributions: items.map(contributionJson), page, limit, total, hasMore: page * limit < total });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Delete an entry and reverse its effect on the saved amount
// @route   DELETE /api/savings/:id/contributions/:contributionId
// @access  Private
const deleteContribution = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return sendError(res, 404, 'GOAL_NOT_FOUND');
    const owner = { _id: req.params.id, user: req.user._id };
    const contribution = isValidId(req.params.contributionId)
      ? await SavingsContribution.findOne({ _id: req.params.contributionId, goal: req.params.id, user: req.user._id })
      : null;
    if (!contribution) {
      const goalExists = await SavingsGoal.exists(owner);
      return sendError(res, 404, goalExists ? 'CONTRIBUTION_NOT_FOUND' : 'GOAL_NOT_FOUND');
    }

    // Removing a deposit takes the money back out (only if it is still
    // there); removing a withdrawal puts it back
    const change = contribution.type === 'deposit' ? -contribution.amount : contribution.amount;
    const filter = change < 0 ? { ...owner, savedAmount: { $gte: -change } } : owner;
    const goal = await SavingsGoal.findOneAndUpdate(filter, { $inc: { savedAmount: change } }, { new: true });
    if (!goal) return sendError(res, 400, 'CONTRIBUTION_DELETE_BLOCKED');

    // Removed by another request in the meantime: undo our change
    const { deletedCount } = await SavingsContribution.deleteOne({ _id: contribution._id });
    if (!deletedCount) {
      await SavingsGoal.updateOne({ _id: goal._id }, { $inc: { savedAmount: -change } });
      return sendError(res, 404, 'CONTRIBUTION_NOT_FOUND');
    }

    await saveCompletion(goal);
    res.json({ message: 'Entry deleted', goal: goalJson(goal) });
  } catch (err) {
    serverError(res, err);
  }
};

module.exports = {
  getGoals,
  createGoal,
  getGoal,
  updateGoal,
  deleteGoal,
  addContribution,
  getContributions,
  deleteContribution,
};
