const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, me } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const loginLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

router.post('/login', loginLimit, login);
router.get('/me', authenticate, me);

module.exports = router;
