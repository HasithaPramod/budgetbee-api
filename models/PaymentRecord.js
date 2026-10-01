const mongoose = require('mongoose');
const { amountField } = require('../utils/validation');

// One "Mark as paid" on a bill. Also counted as spending by weekly and
// monthly budgets (see services/spendingService.js).
const paymentRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    amount: amountField({ required: [true, 'INVALID_AMOUNT'] }),
    // Copied from the bill so spending can be grouped without a lookup
    category: { type: String, required: true },
    // The due date this payment covered; undo moves the bill back to it
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 100, default: '' },
  },
  { timestamps: true }
);

paymentRecordSchema.index({ payment: 1, createdAt: -1 });
paymentRecordSchema.index({ user: 1, paidAt: -1 });

module.exports = mongoose.model('PaymentRecord', paymentRecordSchema);
