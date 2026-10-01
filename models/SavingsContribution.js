const mongoose = require('mongoose');
const { amountField } = require('../utils/validation');

// Money added to or taken from a savings goal. The goal's savedAmount is the
// running total of these entries.
const savingsContributionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    goal: { type: mongoose.Schema.Types.ObjectId, ref: 'SavingsGoal', required: true },
    type: { type: String, enum: ['deposit', 'withdrawal'], required: true },
    amount: amountField({ required: [true, 'INVALID_AMOUNT'] }),
    note: { type: String, trim: true, maxlength: 100, default: '' },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

savingsContributionSchema.index({ goal: 1, date: -1 });
savingsContributionSchema.index({ user: 1 });

module.exports = mongoose.model('SavingsContribution', savingsContributionSchema);
