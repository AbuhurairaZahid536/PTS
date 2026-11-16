/**
 * Centralized, validated environment configuration.
 * Import this module instead of touching process.env directly anywhere else.
 * Fails fast on boot if a required variable is missing, so a misconfigured
 * server never starts silently.
 */
require('dotenv').config();

const REQUIRED_VARS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];

function requireEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // Intentionally throw synchronously — this must stop server startup.
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy backend/.env.example to backend/.env and fill in real values.'
    );
  }
}

requireEnv();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  },
};

module.exports = config;
