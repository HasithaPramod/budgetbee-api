const mongoose = require('mongoose');
const { amountField } = require('../utils/validation');

const GOAL_CATEGORIES = [
  'emergency',
  'repairs',
  'rent',
  'vehicle',
  'education',
  'family',
  'festival',
  'business',
  'other',
];

// Validation messages are error codes from utils/apiError.js
const savingsGoalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: [true, 'NAME_REQUIRED'], trim: true, maxlength: 50 },
    category: { type: String, enum: GOAL_CATEGORIES, default: 'other' },
    targetAmount: amountField({ required: [true, 'INVALID_AMOUNT'] }),

    // Changed only by contributions (atomic $inc), never from a request body
    savedAmount: { type: Number, default: 0, min: 0 },
    targetDate: { type: Date, default: null },

    // 'completed' is set automatically once savedAmount reaches the target
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

savingsGoalSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('SavingsGoal', savingsGoalSchema);
