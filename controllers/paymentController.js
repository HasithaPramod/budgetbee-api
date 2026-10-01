const Payment = require('../models/Payment');
const PaymentRecord = require('../models/PaymentRecord');
const { sendError, serverError } = require('../utils/apiError');
const { isValidId, parseAmount, isValidNote, pick, sendSaveError } = require('../utils/validation');
const { addDays, localDayOfMonth, nextDueDate, parseDate, parseDay, startOfDay } = require('../utils/period');
const {
  sortPayments,
  paymentJson,
  recordJson,
  upcomingPayments,
  paymentsSummary,
} = require('../services/paymentService');

const MAX_OPEN_PAYMENTS = 50;
const STATUSES = ['active', 'paused', 'completed'];
const FIELDS = [
  'name',
  'category',
  'amount',
  'frequency',
  'nextDueDate',
  'reminderDaysBefore',
  'totalInstallments',
  'paidInstallments',
  'notes',
];

// A malformed id, or another user's bill, is simply "not found"
const findOwnPayment = (req) =>
  isValidId(req.params.id) ? Payment.findOne({ _id: req.params.id, user: req.user._id }) : null;

// Reads the whitelisted fields; nextDueDate ("YYYY-MM-DD") also sets the due
// day. Returns null when a value is invalid.
const readFields = (body) => {
  const fields = pick(body, FIELDS);
  if (fields.nextDueDate !== undefined) {
    fields.nextDueDate = parseDay(fields.nextDueDate);
    if (!fields.nextDueDate) return null;
    fields.dueDay = localDayOfMonth(fields.nextDueDate);
  }
  if (body.status !== undefined) {
    if (!['active', 'paused'].includes(body.status)) return null;
    fields.status = body.status;
  }
  return fields;
};

// Installments only apply to repeating bills, and at least one must be left
// to pay (a completed bill is not checked)
const installmentsOk = (payment) => {
  if (payment.frequency === 'once') payment.totalInstallments = null;
  if (payment.status === 'completed' || payment.totalInstallments == null) return true;
  return payment.paidInstallments < payment.totalInstallments;
};

// Payments can be dated today or earlier
const parsePaidAt = (value) => {
  if (value === undefined) return new Date();
  const date = parseDate(value);
  return date && date < addDays(startOfDay(), 1) ? date : null;
};

// @desc    List bills (optional ?status=active|paused|completed) with this
//          month's summary
// @route   GET /api/payments
// @access  Private
const getPayments = async (req, res) => {
  try {
    const { status } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) return sendError(res, 400, 'INVALID_INPUT');
    const all = await Payment.find({ user: req.user._id });
    const now = new Date();
    const list = (status ? all.filter((p) => p.status === status) : all).sort(sortPayments);
    res.json({
      payments: list.map((p) => paymentJson(p, now)),
      summary: await paymentsSummary(req.user._id, all, now),
    });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Bills that are overdue or due within ?days= days (default 7)
// @route   GET /api/payments/upcoming
// @access  Private
const getUpcomingPayments = async (req, res) => {
  try {
    const days = req.query.days === undefined ? 7 : Number(req.query.days);
    if (!Number.isInteger(days) || days < 0 || days > 60) return sendError(res, 400, 'INVALID_INPUT');
    const now = new Date();
    const payments = await Payment.find({
      user: req.user._id,
      status: 'active',
      nextDueDate: { $lt: addDays(startOfDay(now), days + 1) },
    });
    res.json(upcomingPayments(payments, days, now));
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Add a bill, recurring payment or loan / lease installment
// @route   POST /api/payments
// @access  Private
const createPayment = async (req, res) => {
  try {
    const fields = readFields(req.body || {});
    if (!fields || !fields.nextDueDate) return sendError(res, 400, 'INVALID_INPUT');
    const open = await Payment.countDocuments({ user: req.user._id, status: { $ne: 'completed' } });
    if (open >= MAX_OPEN_PAYMENTS) return sendError(res, 400, 'LIMIT_REACHED');

    const payment = new Payment({ ...fields, user: req.user._id });
    if (!installmentsOk(payment)) return sendError(res, 400, 'INVALID_INPUT');
    await payment.save();
    res.status(201).json(paymentJson(payment));
  } catch (err) {
    if (!sendSaveError(res, err)) serverError(res, err);
  }
};

// @desc    Get one bill with its payment history (latest 24)
// @route   GET /api/payments/:id
// @access  Private
const getPayment = async (req, res) => {
  try {
    const payment = await findOwnPayment(req);
    if (!payment) return sendError(res, 404, 'PAYMENT_NOT_FOUND');
    const [records, count] = await Promise.all([
      PaymentRecord.find({ payment: payment._id }).sort({ createdAt: -1, _id: -1 }).limit(24),
      PaymentRecord.countDocuments({ payment: payment._id }),
    ]);
    res.json({ ...paymentJson(payment), records: records.map(recordJson), recordCount: count });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Update a bill, or pause / resume it with status 'paused' / 'active'
// @route   PATCH /api/payments/:id
// @access  Private
const updatePayment = async (req, res) => {
  try {
    const payment = await findOwnPayment(req);
    if (!payment) return sendError(res, 404, 'PAYMENT_NOT_FOUND');
    const fields = readFields(req.body || {});
    if (!fields) return sendError(res, 400, 'INVALID_INPUT');
    if (fields.status !== undefined && payment.status === 'completed') {
      return sendError(res, 400, 'PAYMENT_ALREADY_COMPLETED');
    }
    payment.set(fields);
    if (!installmentsOk(payment)) return sendError(res, 400, 'INVALID_INPUT');
    await payment.save();
    res.json(paymentJson(payment));
  } catch (err) {
    if (!sendSaveError(res, err)) serverError(res, err);
  }
};

// @desc    Delete a bill and its payment history
// @route   DELETE /api/payments/:id
// @access  Private
const deletePayment = async (req, res) => {
  try {
    const payment = await findOwnPayment(req);
    if (!payment) return sendError(res, 404, 'PAYMENT_NOT_FOUND');
    await PaymentRecord.deleteMany({ payment: payment._id });
    await payment.deleteOne();
    res.json({ message: 'Payment deleted', id: payment._id });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Mark the current due date as paid ({ amount?, paidAt?, note? }).
//          Moves the bill to its next due date, or completes a one-off bill
//          or a fully paid loan.
// @route   POST /api/payments/:id/pay
// @access  Private
const payPayment = async (req, res) => {
  try {
    const payment = await findOwnPayment(req);
    if (!payment) return sendError(res, 404, 'PAYMENT_NOT_FOUND');
    if (payment.status === 'completed') return sendError(res, 400, 'PAYMENT_ALREADY_COMPLETED');

    const body = req.body || {};
    const amount = body.amount === undefined ? payment.amount : parseAmount(body.amount);
    if (amount === null) return sendError(res, 400, 'INVALID_AMOUNT');
    const paidAt = parsePaidAt(body.paidAt);
    if (!paidAt || !isValidNote(body.note)) return sendError(res, 400, 'INVALID_INPUT');

    const paidInstallments = payment.paidInstallments + 1;
    const finished =
      payment.frequency === 'once' ||
      (payment.totalInstallments != null && paidInstallments >= payment.totalInstallments);
    const update = { paidInstallments, lastPaidAt: paidAt };
    if (finished) update.status = 'completed';
    else update.nextDueDate = nextDueDate(payment.nextDueDate, payment.frequency, payment.dueDay);

    // Only if nothing changed since we read it (a double tap, another phone)
    const updated = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        nextDueDate: payment.nextDueDate,
        paidInstallments: payment.paidInstallments,
        status: payment.status,
      },
      { $set: update },
      { new: true }
    );
    if (!updated) return sendError(res, 409, 'CHANGED_TRY_AGAIN');

    let record;
    try {
      record = await PaymentRecord.create({
        user: req.user._id,
        payment: payment._id,
        amount,
        category: payment.category,
        dueDate: payment.nextDueDate,
        paidAt,
        note: body.note,
      });
    } catch (err) {
      await Payment.updateOne(
        { _id: payment._id },
        {
          $set: {
            paidInstallments: payment.paidInstallments,
            lastPaidAt: payment.lastPaidAt,
            status: payment.status,
            nextDueDate: payment.nextDueDate,
          },
        }
      );
      throw err;
    }
    res.status(201).json({ payment: paymentJson(updated), record: recordJson(record) });
  } catch (err) {
    if (!sendSaveError(res, err)) serverError(res, err);
  }
};

// @desc    Undo the latest "Mark as paid": deletes the record and moves the
//          bill back to the due date it covered
// @route   DELETE /api/payments/:id/records/:recordId
// @access  Private
const undoPayment = async (req, res) => {
  try {
    const payment = await findOwnPayment(req);
    if (!payment) return sendError(res, 404, 'PAYMENT_NOT_FOUND');
    const record = isValidId(req.params.recordId)
      ? await PaymentRecord.findOne({ _id: req.params.recordId, payment: payment._id, user: req.user._id })
      : null;
    if (!record) return sendError(res, 404, 'PAYMENT_RECORD_NOT_FOUND');

    const [latest, previous] = await PaymentRecord.find({ payment: payment._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(2);
    if (!latest._id.equals(record._id)) return sendError(res, 400, 'ONLY_LATEST_PAYMENT_UNDO');

    // Undone by another request in the meantime
    const { deletedCount } = await PaymentRecord.deleteOne({ _id: record._id });
    if (!deletedCount) return sendError(res, 404, 'PAYMENT_RECORD_NOT_FOUND');

    const update = {
      nextDueDate: record.dueDate,
      paidInstallments: Math.max(0, payment.paidInstallments - 1),
      lastPaidAt: previous ? previous.paidAt : null,
    };
    if (payment.status === 'completed') update.status = 'active';
    const updated = await Payment.findOneAndUpdate({ _id: payment._id }, { $set: update }, { new: true });
    res.json({ payment: paymentJson(updated) });
  } catch (err) {
    serverError(res, err);
  }
};

module.exports = {
  getPayments,
  getUpcomingPayments,
  createPayment,
  getPayment,
  updatePayment,
  deletePayment,
  payPayment,
  undoPayment,
};
