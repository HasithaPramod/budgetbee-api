require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BudgetBee API running on port ${PORT}`);
  });
}

module.exports = app;
