const mongoose = require('mongoose');
const { amountField } = require('../utils/validation');

const PAYMENT_CATEGORIES = [
  'rent',
  'utilities',
  'mobile',
  'internet',
  'loan',
  'lease',
  'insurance',
  'education',
  'subscription',
  'other',
];

// Custom validators also run on null, and totalInstallments defaults to null
const wholeNumber = { validator: (v) => v == null || Number.isInteger(v), message: 'INVALID_INPUT' };

// A bill or installment the user pays themselves. BudgetBee only tracks it
// and never moves money. Validation messages are error codes from
// utils/apiError.js
const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: [true, 'NAME_REQUIRED'], trim: true, maxlength: 50 },
    category: { type: String, enum: PAYMENT_CATEGORIES, default: 'other' },
    amount: amountField({ required: [true, 'INVALID_AMOUNT'] }),
    frequency: { type: String, enum: ['once', 'weekly', 'monthly', 'yearly'], default: 'monthly' },

    // Start of the local (Sri Lanka) day the next payment is due
    nextDueDate: { type: Date, required: true },
    // Day of the month monthly/yearly bills fall on, taken from nextDueDate,
    // so a bill due on the 31st returns to the 31st after a short month
    dueDay: { type: Number, min: 1, max: 31 },
    reminderDaysBefore: { type: Number, min: 0, max: 30, default: 3, validate: wholeNumber },

    // Loans and leases stop after this many payments (null = no end)
    totalInstallments: { type: Number, min: 1, max: 600, default: null, validate: wholeNumber },
    paidInstallments: { type: Number, min: 0, default: 0, validate: wholeNumber },

    status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' },
    notes: { type: String, trim: true, maxlength: 100, default: '' },
    lastPaidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ user: 1, status: 1, nextDueDate: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
