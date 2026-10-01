// Every error the API returns has a stable machine-readable `code` (the app
// translates it into Sinhala/Tamil/English - see the app's
// lib/l10n/api_error_strings.dart) plus an English `message` for Postman,
// logs and older app builds. Add new errors here, never as inline strings.

const MESSAGES = {
  // Auth / session
  MISSING_FIELDS: 'Missing required fields',
  USER_EXISTS: 'User already exists',
  LOGIN_FIELDS_REQUIRED: 'emailOrPhone and password are required',
  INVALID_CREDENTIALS: 'Invalid credentials',
  EMAIL_NOT_VERIFIED: 'Please verify your email before logging in',
  INVALID_GOOGLE_TOKEN: 'Invalid Google token',
  SESSION_EXPIRED: 'Your session has ended. Please log in again.',
  FORBIDDEN: 'Not authorized for this action',

  // Codes (OTP)
  EMAIL_REQUIRED: 'Email is required',
  EMAIL_AND_CODE_REQUIRED: 'Email and code are required',
  INVALID_OTP: 'Invalid or expired OTP',
  CODE_REQUIRED: 'Enter the verification code',
  CODE_INVALID: 'Invalid code',
  CODE_INVALID_OR_EXPIRED: 'Invalid or expired code. Request a new one.',
  CODE_TOO_MANY_ATTEMPTS: 'Too many wrong attempts. Request a new code.',
  CODE_WRONG_ACCOUNT: 'This code does not belong to your account',

  // Passwords
  RESET_FIELDS_REQUIRED: 'email, code and newPassword are required',
  PASSWORD_FIELDS_REQUIRED: 'currentPassword and newPassword are required',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters',
  CURRENT_PASSWORD_INCORRECT: 'Current password is incorrect',
  PASSWORD_INCORRECT: 'Password is incorrect',
  NO_PASSWORD_YET: 'This account has no password yet. Use /api/users/set-password/request instead.',
  PASSWORD_ALREADY_SET: 'Password already set. Use /api/users/change-password/request instead.',
  EMAIL_REQUIRED_FOR_VERIFICATION: 'An email address is required on this account to verify this change',

  // Profile
  INVALID_ROLE: 'A valid role is required',
  PHONE_IN_USE: 'Phone number already in use',
  WORK_TYPE_REQUIRED: 'Select at least one work type',
  INCOME_SOURCE_NAME_REQUIRED: 'Income source name is required',
  TOO_MANY_INCOME_SOURCES: 'You can add up to 20 income sources',
  INVALID_INPUT: 'Some of the details are not valid',
  NEW_EMAIL_REQUIRED: 'newEmail is required',
  INVALID_EMAIL: 'Invalid email format',
  SAME_EMAIL: 'New email is the same as your current email',
  EMAIL_IN_USE: 'This email is already in use by another account',
  INVALID_LANGUAGE: 'Invalid language code',

  // Profile picture
  NO_IMAGE: 'No image file provided',
  ONLY_IMAGES: 'Only image files are allowed (jpg, jpeg, png, webp, gif)',
  FILE_TOO_LARGE: 'The image is too large (5 MB max)',

  // Delete account
  DELETE_PASSWORD_REQUIRED: 'Enter your password to delete your account',
  USE_PASSWORD_INSTEAD: 'Confirm with your password instead',

  // Budgets, savings goals & payments (Module 3)
  NAME_REQUIRED: 'Enter a name',
  INVALID_AMOUNT: 'Enter an amount between Rs 1 and Rs 100,000,000',
  INVALID_PERCENT: 'Enter a percentage from 1 to 100',
  LIMIT_REACHED: 'You have reached the maximum number of items here',
  BUDGET_NOT_FOUND: 'Budget not found',
  BUDGET_EXISTS: 'You already have a budget for this category and period',
  GOAL_NOT_FOUND: 'Savings goal not found',
  CONTRIBUTION_NOT_FOUND: 'Savings entry not found',
  WITHDRAW_MORE_THAN_SAVED: 'You cannot take out more than you have saved',
  CONTRIBUTION_DELETE_BLOCKED: 'This money was already taken out, so the entry cannot be deleted',
  PAYMENT_NOT_FOUND: 'Payment not found',
  PAYMENT_RECORD_NOT_FOUND: 'Payment record not found',
  PAYMENT_ALREADY_COMPLETED: 'This payment is already completed',
  ONLY_LATEST_PAYMENT_UNDO: 'Only the latest payment can be undone',
  CHANGED_TRY_AGAIN: 'This was just changed. Refresh and try again.',

  // Generic
  NOT_FOUND: 'Route not found',
  SERVER_ERROR: 'Something went wrong. Please try again.',
};

const sendError = (res, status, code, extra = {}) =>
  res.status(status).json({ message: MESSAGES[code] || code, code, ...extra });

// 500s: log the real error for us, never send internals (Mongo errors, stack
// text) to the user
const serverError = (res, err) => {
  console.error(err);
  return sendError(res, 500, 'SERVER_ERROR');
};

module.exports = { MESSAGES, sendError, serverError };
