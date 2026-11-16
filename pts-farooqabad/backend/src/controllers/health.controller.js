const { checkConnection } = require('../config/db');

/**
 * GET /health — process is up and serving requests.
 * Does not touch the database; used for basic liveness checks.
 */
function getLiveness(req, res) {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * GET /health/db — confirms the API can actually reach MySQL.
 * This is the endpoint the frontend calls on Phase 1's status screen.
 */
async function getDbHealth(req, res) {
  const result = await checkConnection();
  res.status(result.connected ? 200 : 503).json({
    success: result.connected,
    data: result,
  });
}

module.exports = { getLiveness, getDbHealth };
