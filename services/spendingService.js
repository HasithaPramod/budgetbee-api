const mongoose = require('mongoose');
const PaymentRecord = require('../models/PaymentRecord');

// Module 2 (Transactions) is not built yet, so budgets read its collection
// directly (no model, so nothing clashes with Module 2's own). If Module 2
// stores different field names, only this block changes.
const TX = {
  collection: 'transactions',
  user: 'user', // ObjectId of the User
  type: 'type',
  expense: 'expense',
  income: 'income',
  amount: 'amount',
  category: 'category', // same values as Budget.category
  date: 'date',
};

const EMPTY_TOTALS = Object.freeze({ total: 0, byCategory: {} });

const toTotals = (rows) => {
  const byCategory = {};
  let total = 0;
  rows.forEach((row) => {
    const category = row._id || 'other';
    byCategory[category] = (byCategory[category] || 0) + row.total;
    total += row.total;
  });
  return { total, byCategory };
};

// Transactions of one type in [start, end), summed by category
const transactionTotals = async (userId, { start, end }, type = TX.expense) => {
  const rows = await mongoose.connection.db
    .collection(TX.collection)
    .aggregate([
      { $match: { [TX.user]: userId, [TX.type]: type, [TX.date]: { $gte: start, $lt: end } } },
      { $group: { _id: `$${TX.category}`, total: { $sum: `$${TX.amount}` } } },
    ])
    .toArray();
  return toTotals(rows);
};

// Bills marked as paid in [start, end), summed by the bill's category.
// Bills are recorded here only, never also as a transaction, so they are not
// counted twice.
const billTotals = async (userId, { start, end }) => {
  const rows = await PaymentRecord.aggregate([
    { $match: { user: userId, paidAt: { $gte: start, $lt: end } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
  ]);
  return toTotals(rows);
};

const incomeTotal = async (userId, range) => (await transactionTotals(userId, range, TX.income)).total;

module.exports = { EMPTY_TOTALS, transactionTotals, billTotals, incomeTotal };
