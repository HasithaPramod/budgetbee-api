const mongoose = require('mongoose');
const { amountField } = require('../utils/validation');

// 'all' limits total spending. The others must match the category values
// Module 2 (Transactions) stores on expenses.
const CATEGORIES = [
  'all',
  'food',
  'fuel',
  'transport',
  'vehicle',
  'mobile',
  'rent',
  'utilities',
  'health',
  'education',
  'family',
  'shopping',
  'entertainment',
  'work',
  'other',
];

// Validation messages are error codes from utils/apiError.js
const budgetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, trim: true, maxlength: 50, default: '' },
    category: { type: String, enum: CATEGORIES, default: 'all' },
    period: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },

    // 'income_percent' caps spending at a share of the income earned in the
    // same period, so the limit follows irregular earnings
    limitType: { type: String, enum: ['fixed', 'income_percent'], default: 'fixed' },
    amount: amountField({
      required: [function () { return this.limitType === 'fixed'; }, 'INVALID_AMOUNT'],
    }),
    incomePercent: {
      type: Number,
      required: [function () { return this.limitType === 'income_percent'; }, 'INVALID_PERCENT'],
      min: [1, 'INVALID_PERCENT'],
      max: [100, 'INVALID_PERCENT'],
    },

    // Percent used at which the budget shows "near limit"
    alertAt: { type: Number, min: 50, max: 100, default: 80 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One budget per category and period
budgetSchema.index({ user: 1, category: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
