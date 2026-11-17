/**
 * MySQL connection pool (mysql2/promise).
 * No ORM: query modules under src/models/ use this pool directly with
 * parameterized queries. Kept as a single shared pool for the whole app.
 */
const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  dateStrings: ["DATE", "DATETIME"],
  namedPlaceholders: true,
  timezone: '+05:00',
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+05:00'", (error) => {
    if (error) { logger.error({err:error}, 'Could not set PTS database timezone'); connection.destroy(); }
  });
});

/**
 * Cheap connectivity probe used by the /health/db endpoint and on boot.
 * Never throws — returns a result object so callers can decide how to react.
 */
async function checkConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return { connected: rows[0].ok === 1 };
  } catch (err) {
    logger.error({ err }, 'MySQL connectivity check failed');
    return { connected: false, error: err.code || err.message };
  }
}

module.exports = { pool, checkConnection };
