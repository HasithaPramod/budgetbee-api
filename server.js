require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sendError, serverError } = require('./utils/apiError');
const connectDB = require('./config/db');

const app = express();

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'BudgetBee API', timestamp: new Date().toISOString() });
});

// ---- Module 1 Routes ----
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/app', require('./routes/appRoutes')); // version check (forced updates)

// ---- Future modules (uncomment as each module is built) ----
// app.use('/api/transactions', require('./routes/transactionRoutes'));   // Module 2
app.use('/api/budgets', require('./routes/budgetRoutes'));                // Module 3
app.use('/api/savings', require('./routes/savingsRoutes'));               // Module 3
app.use('/api/payments', require('./routes/paymentRoutes'));              // Module 3
// app.use('/api/dashboard', require('./routes/dashboardRoutes'));        // Module 4

// ---- 404 handler ----
app.use((req, res) => {
  sendError(res, 404, 'NOT_FOUND');
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  // Upload problems are the user's to fix, not server errors
  if (err.code === 'LIMIT_FILE_SIZE') return sendError(res, 400, 'FILE_TOO_LARGE');
  if (err.code === 'ONLY_IMAGES') return sendError(res, 400, 'ONLY_IMAGES');
  // Anything else: log it, never send internals to the user
  serverError(res, err);
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BudgetBee API running on port ${PORT}`);
  });
});