const pino = require("pino");

const isDev =
  (process.env.NODE_ENV || "development") !== "production";

const logger = pino({
  level:
    process.env.LOG_LEVEL || "info",

  /*
  |--------------------------------------------------------------------------
  | SENSITIVE DATA REDACTION
  |--------------------------------------------------------------------------
  |
  | Keep useful request/error logging, but never write authentication tokens,
  | cookies, API keys or common credential fields to application logs.
  |
  | NOTE:
  | - pino-http logs request headers under req.headers.
  | - censor preserves the field name while replacing the secret value.
  |
  |--------------------------------------------------------------------------
  */
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',

      "req.body.password",
      "req.body.token",
      "req.body.access_token",
      "req.body.refresh_token",

      "password",
      "token",
      "access_token",
      "refresh_token",

      "err.config.headers.authorization",
      "err.config.headers.Authorization",
      'err.config.headers["x-api-key"]',
    ],

    censor:
      "[REDACTED]",
  },

  transport: isDev
    ? {
        target:
          "pino-pretty",

        options: {
          colorize:
            true,

          translateTime:
            "HH:MM:ss",
        },
      }
    : undefined,
});

module.exports = logger;
