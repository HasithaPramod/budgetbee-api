const Budget = require('../models/Budget');
const SavingsGoal = require('../models/SavingsGoal');
const SavingsContribution = require('../models/SavingsContribution');
const Payment = require('../models/Payment');
const PaymentRecord = require('../models/PaymentRecord');

// Called by Delete Account before the user itself is removed
const deleteModule3Data = async (userId) => {
  await Promise.all([
    Budget.deleteMany({ user: userId }),
    SavingsGoal.deleteMany({ user: userId }),
    SavingsContribution.deleteMany({ user: userId }),
    Payment.deleteMany({ user: userId }),
    PaymentRecord.deleteMany({ user: userId }),
  ]);
};

module.exports = { deleteModule3Data };
