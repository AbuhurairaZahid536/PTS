const {
  pool,
} = require(
  "../config/db"
);


/*
|--------------------------------------------------------------------------
| SENSITIVE FIELDS
|--------------------------------------------------------------------------
|
| Password, token etc. kabhi audit old/new data mein save nahi honge.
|
|--------------------------------------------------------------------------
*/

const SENSITIVE_KEYS =
  new Set([
    "password",
    "password_hash",
    "current_password",
    "new_password",
    "confirm_password",

    "token",
    "access_token",
    "refresh_token",
    "jwt",
    "jwt_secret",

    "authorization",

    "secret",
    "api_key",
    "apikey",
  ]);


/*
|--------------------------------------------------------------------------
| SANITIZE VALUE
|--------------------------------------------------------------------------
*/

function sanitizeValue(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      (
        item
      ) =>
        sanitizeValue(
          item
        )
    );
  }


  if (
    typeof value ===
    "object"
  ) {
    const result = {};


    Object.entries(
      value
    ).forEach(
      ([
        key,
        currentValue,
      ]) => {
        const normalizedKey =
          String(
            key
          )
            .trim()
            .toLowerCase();


        if (
          SENSITIVE_KEYS.has(
            normalizedKey
          )
        ) {
          result[
            key
          ] =
            "[REDACTED]";

          return;
        }


        result[
          key
        ] =
          sanitizeValue(
            currentValue
          );
      }
    );


    return result;
  }


  return value;
}


/*
|--------------------------------------------------------------------------
| JSON DATABASE VALUE
|--------------------------------------------------------------------------
*/

function toDatabaseJson(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  try {
    return JSON.stringify(
      sanitizeValue(
        value
      )
    );
  } catch {
    return JSON.stringify({
      value:
        String(
          value
        ),
    });
  }
}


/*
|--------------------------------------------------------------------------
| NORMALIZE TEXT
|--------------------------------------------------------------------------
*/

function normalizeText(
  value,
  fallback =
    null
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }


  const text =
    String(
      value
    ).trim();


  return (
    text ||
    fallback
  );
}


/*
|--------------------------------------------------------------------------
| LOG AUDIT
|--------------------------------------------------------------------------
|
| connection optional hai.
|
| Agar controller transaction ke andar hai:
|
| logAudit({
|   connection,
|   ...
| })
|
| warna normal pool use hoga.
|
|--------------------------------------------------------------------------
*/

async function logAudit({
  userId = null,

  action,

  module,

  recordId = null,

  description = null,

  oldData = null,

  newData = null,

  ipAddress = null,

  connection = null,
}) {
  const safeAction =
    normalizeText(
      action
    );


  const safeModule =
    normalizeText(
      module
    );


  if (
    !safeAction
  ) {
    throw new Error(
      "Audit action is required."
    );
  }


  if (
    !safeModule
  ) {
    throw new Error(
      "Audit module is required."
    );
  }


  const db =
    connection ||
    pool;


  const [
    result,
  ] =
    await db.query(
      `
        INSERT INTO audit_logs
        (
          user_id,
          action,
          module,
          record_id,
          description,
          old_data,
          new_data,
          ip_address
        )

        VALUES
        (
          :userId,
          :action,
          :module,
          :recordId,
          :description,
          :oldData,
          :newData,
          :ipAddress
        )
      `,
      {
        userId:
          Number(
            userId
          ) >
          0
            ? Number(
                userId
              )
            : null,

        action:
          safeAction
            .toUpperCase(),

        module:
          safeModule
            .toUpperCase(),

        recordId:
          recordId ===
            undefined ||
          recordId ===
            null
            ? null
            : String(
                recordId
              ),

        description:
          normalizeText(
            description
          ),

        oldData:
          toDatabaseJson(
            oldData
          ),

        newData:
          toDatabaseJson(
            newData
          ),

        ipAddress:
          normalizeText(
            ipAddress
          ),
      }
    );


  return {
    id:
      result.insertId,

    action:
      safeAction
        .toUpperCase(),

    module:
      safeModule
        .toUpperCase(),
  };
}


/*
|--------------------------------------------------------------------------
| LOG FROM EXPRESS REQUEST
|--------------------------------------------------------------------------
|
| Controllers mein zyada simple call:
|
| await logRequestAudit(req, {
|   action: "UPDATE",
|   module: "TRAINEE",
|   recordId: trainee.id,
|   description: "...",
|   oldData: existing,
|   newData: trainee,
| });
|
|--------------------------------------------------------------------------
*/

async function logRequestAudit(
  req,
  {
    action,

    module,

    recordId = null,

    description = null,

    oldData = null,

    newData = null,

    connection = null,
  }
) {
  return logAudit({
    userId:
      req?.user?.id ||
      null,

    action,

    module,

    recordId,

    description,

    oldData,

    newData,

    ipAddress:
      req?.ip ||
      req?.socket
        ?.remoteAddress ||
      null,

    connection,
  });
}


/*
|--------------------------------------------------------------------------
| SUMMARY AUDIT
|--------------------------------------------------------------------------
|
| Excel import/bulk operations ke liye.
|
|--------------------------------------------------------------------------
*/

async function logBulkAudit(
  req,
  {
    action,

    module,

    description,

    summary,

    recordId =
      "BULK",

    connection =
      null,
  }
) {
  return logRequestAudit(
    req,
    {
      action,

      module,

      recordId,

      description,

      oldData:
        null,

      newData: {
        summary,
      },

      connection,
    }
  );
}


module.exports = {
  logAudit,

  logRequestAudit,

  logBulkAudit,

  sanitizeValue,
};