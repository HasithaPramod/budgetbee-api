const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getPayments,
  getUpcomingPayments,
  createPayment,
  getPayment,
  updatePayment,
  deletePayment,
  payPayment,
  undoPayment,
} = require('../controllers/paymentController');

// Fixed path first, so it is not taken as an :id
router.get('/upcoming', protect, getUpcomingPayments);

router.get('/', protect, getPayments);
router.post('/', protect, createPayment);
router.get('/:id', protect, getPayment);
router.patch('/:id', protect, updatePayment);
router.delete('/:id', protect, deletePayment);

// "Mark as paid" and its undo
router.post('/:id/pay', protect, payPayment);
router.delete('/:id/records/:recordId', protect, undoPayment);

module.exports = router;
