const { MESSAGES, sendError } = require('./apiError');

const MAX_AMOUNT = 100000000;

// LKR amount schema field, 1 to 100,000,000. Messages are catalogue codes.
const amountField = (extra = {}) => ({
  type: Number,
  min: [1, 'INVALID_AMOUNT'],
  max: [MAX_AMOUNT, 'INVALID_AMOUNT'],
  ...extra,
});

// Mongo ObjectId as a 24-character hex string. Anything else in an :id route
// is answered with the item's 404 code, never a 500 CastError.
const isValidId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// A number (or numeric string) from 1 to MAX_AMOUNT, otherwise null
const parseAmount = (value) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 1 && amount <= MAX_AMOUNT ? amount : null;
};

// Optional short note (same 100-character limit as the models)
const isValidNote = (note) => note === undefined || (typeof note === 'string' && note.trim().length <= 100);

// Copies only the listed fields that were actually sent (whitelist)
const pick = (body, fields) => {
  const out = {};
  fields.forEach((field) => {
    if (body[field] !== undefined) out[field] = body[field];
  });
  return out;
};

// 400 for a failed save, same rule as userController.updateProfile: model
// messages that are catalogue codes pass through, enum/cast failures become
// INVALID_INPUT, a unique-index clash becomes `duplicateCode`. Returns null
// when the error is something else (the caller sends a 500).
const sendSaveError = (res, err, duplicateCode) => {
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    const code = first && MESSAGES[first.message] ? first.message : 'INVALID_INPUT';
    return sendError(res, 400, code);
  }
  if (err.name === 'CastError') return sendError(res, 400, 'INVALID_INPUT');
  if (err.code === 11000 && duplicateCode) return sendError(res, 400, duplicateCode);
  return null;
};

module.exports = { MAX_AMOUNT, amountField, isValidId, parseAmount, isValidNote, pick, sendSaveError };
