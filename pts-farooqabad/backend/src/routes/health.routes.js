const express = require('express');
const { getLiveness, getDbHealth } = require('../controllers/health.controller');

const router = express.Router();

router.get('/', getLiveness);
router.get('/db', getDbHealth);

module.exports = router;
