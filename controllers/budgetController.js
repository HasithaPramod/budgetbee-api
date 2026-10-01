const Budget = require('../models/Budget');
const { sendError, serverError } = require('../utils/apiError');
const { isValidId, pick, sendSaveError } = require('../utils/validation');
const budgetService = require('../services/budgetService');

const MAX_BUDGETS = 30;
const FIELDS = ['name', 'category', 'period', 'limitType', 'amount', 'incomePercent', 'alertAt', 'isActive'];

// A malformed id, or another user's budget, is simply "not found"
const findOwnBudget = (req) =>
  isValidId(req.params.id) ? Budget.findOne({ _id: req.params.id, user: req.user._id }) : null;

// Keep only the value for the chosen limit type
const clearUnusedLimit = (budget) => {
  if (budget.limitType === 'income_percent') budget.amount = undefined;
  else budget.incomePercent = undefined;
};

const withProgress = async (req, budget) => (await budgetService.budgetsWithProgress(req.user._id, [budget]))[0];

// @desc    Everything the Budget tab shows (safe to spend, budgets, savings
//          goals, upcoming payments) in one call
// @route   GET /api/budgets/overview
// @access  Private
const getOverview = async (req, res) => {
  try {
    res.json(await budgetService.getOverview(req.user._id));
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    "Safe to spend today" for the Dashboard card
// @route   GET /api/budgets/safe-to-spend
// @access  Private
const getSafeToSpend = async (req, res) => {
  try {
    res.json(await budgetService.getSafeToSpend(req.user._id));
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    List budgets with this period's spending
// @route   GET /api/budgets
// @access  Private
const getBudgets = async (req, res) => {
  try {
    const budgets = await Budget.find({ user: req.user._id }).sort({ createdAt: 1 });
    const list = await budgetService.budgetsWithProgress(req.user._id, budgets);
    res.json({ budgets: list.sort(budgetService.sortBudgets) });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Create a budget
// @route   POST /api/budgets
// @access  Private
const createBudget = async (req, res) => {
  try {
    if ((await Budget.countDocuments({ user: req.user._id })) >= MAX_BUDGETS) {
      return sendError(res, 400, 'LIMIT_REACHED');
    }
    const budget = new Budget({ ...pick(req.body || {}, FIELDS), user: req.user._id });
    clearUnusedLimit(budget);
    await budget.save();
    res.status(201).json(await withProgress(req, budget));
  } catch (err) {
    if (!sendSaveError(res, err, 'BUDGET_EXISTS')) serverError(res, err);
  }
};

// @desc    Get one budget with this period's spending
// @route   GET /api/budgets/:id
// @access  Private
const getBudget = async (req, res) => {
  try {
    const budget = await findOwnBudget(req);
    if (!budget) return sendError(res, 404, 'BUDGET_NOT_FOUND');
    res.json(await withProgress(req, budget));
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Update a budget (any of the create fields, plus isActive)
// @route   PATCH /api/budgets/:id
// @access  Private
const updateBudget = async (req, res) => {
  try {
    const budget = await findOwnBudget(req);
    if (!budget) return sendError(res, 404, 'BUDGET_NOT_FOUND');
    budget.set(pick(req.body || {}, FIELDS));
    clearUnusedLimit(budget);
    await budget.save();
    res.json(await withProgress(req, budget));
  } catch (err) {
    if (!sendSaveError(res, err, 'BUDGET_EXISTS')) serverError(res, err);
  }
};

// @desc    Delete a budget
// @route   DELETE /api/budgets/:id
// @access  Private
const deleteBudget = async (req, res) => {
  try {
    const budget = await findOwnBudget(req);
    if (!budget) return sendError(res, 404, 'BUDGET_NOT_FOUND');
    await budget.deleteOne();
    res.json({ message: 'Budget deleted', id: budget._id });
  } catch (err) {
    serverError(res, err);
  }
};

module.exports = {
  getOverview,
  getSafeToSpend,
  getBudgets,
  createBudget,
  getBudget,
  updateBudget,
  deleteBudget,
};
