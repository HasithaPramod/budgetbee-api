const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getGoals,
  createGoal,
  getGoal,
  updateGoal,
  deleteGoal,
  addContribution,
  getContributions,
  deleteContribution,
} = require('../controllers/savingsController');

router.get('/', protect, getGoals);
router.post('/', protect, createGoal);
router.get('/:id', protect, getGoal);
router.patch('/:id', protect, updateGoal);
router.delete('/:id', protect, deleteGoal);

// Money in and out of a goal
router.post('/:id/contributions', protect, addContribution);
router.get('/:id/contributions', protect, getContributions);
router.delete('/:id/contributions/:contributionId', protect, deleteContribution);

module.exports = router;
