// Run from backend/: node scripts/setup-biometric-sync.js
const { ensureFailureQueue } = require('../src/services/transactionSync.service');
const { pool } = require('../src/config/db');
ensureFailureQueue().then(() => console.log('BioTime transaction retry queue is ready.'))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => pool.end());
