const express = require('express');
const cors = require('cors');
const { sendError, serverError } = require('./utils/apiError');
const connectDB = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let dbReady;
app.use(async (req, res, next) => {
  try {
    if (!dbReady) dbReady = connectDB();
    await dbReady;
    next();
  } catch (err) {
    serverError(res, err);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'BudgetBee API', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/app', require('./routes/appRoutes'));
app.use('/api/budgets', require('./routes/budgetRoutes'));
app.use('/api/savings', require('./routes/savingsRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));

app.use((req, res) => {
  sendError(res, 404, 'NOT_FOUND');
});

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return sendError(res, 400, 'FILE_TOO_LARGE');
  if (err.code === 'ONLY_IMAGES') return sendError(res, 400, 'ONLY_IMAGES');
  serverError(res, err);
});

module.exports = app;
