const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getOverview,
  getSafeToSpend,
  getBudgets,
  createBudget,
  getBudget,
  updateBudget,
  deleteBudget,
} = require('../controllers/budgetController');

// Fixed paths first, so they are not taken as an :id
router.get('/overview', protect, getOverview);
router.get('/safe-to-spend', protect, getSafeToSpend);

router.get('/', protect, getBudgets);
router.post('/', protect, createBudget);
router.get('/:id', protect, getBudget);
router.patch('/:id', protect, updateBudget);
router.delete('/:id', protect, deleteBudget);

module.exports = router;
