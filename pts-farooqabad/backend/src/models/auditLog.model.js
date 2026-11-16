const {
  pool,
} = require("../config/db");


function normalizeInteger(
  value,
  fallback,
  {
    min = 1,
    max = Number.MAX_SAFE_INTEGER,
  } = {}
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isInteger(
      parsed
    )
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      parsed,
      min
    ),
    max
  );
}


async function getAuditLogs({
  search = "",
  module = "",
  action = "",
  userId = null,
  dateFrom = "",
  dateTo = "",
  page = 1,
  limit = 20,
} = {}) {
  const safePage =
    normalizeInteger(
      page,
      1,
      {
        min:
          1,
      }
    );

  const safeLimit =
    normalizeInteger(
      limit,
      20,
      {
        min:
          1,

        max:
          100,
      }
    );

  const offset =
    (
      safePage -
      1
    ) *
    safeLimit;


  const conditions = [
    "1 = 1",
  ];

  const params = {};


  if (
    String(
      search ||
      ""
    ).trim()
  ) {
    conditions.push(`
      (
        al.description LIKE :search
        OR al.module LIKE :search
        OR al.action LIKE :search
        OR al.record_id LIKE :search
        OR al.ip_address LIKE :search
        OR u.username LIKE :search
        OR u.full_name LIKE :search
      )
    `);

    params.search =
      `%${String(
        search
      ).trim()}%`;
  }


  if (
    String(
      module ||
      ""
    ).trim()
  ) {
    conditions.push(
      "al.module = :module"
    );

    params.module =
      String(
        module
      ).trim();
  }


  if (
    String(
      action ||
      ""
    ).trim()
  ) {
    conditions.push(
      "al.action = :action"
    );

    params.action =
      String(
        action
      ).trim();
  }


  if (
    Number(
      userId
    ) >
    0
  ) {
    conditions.push(
      "al.user_id = :userId"
    );

    params.userId =
      Number(
        userId
      );
  }


  if (
    String(
      dateFrom ||
      ""
    ).trim()
  ) {
    conditions.push(
      "al.created_at >= :dateFrom"
    );

    params.dateFrom =
      `${String(
        dateFrom
      ).trim()} 00:00:00`;
  }


  if (
    String(
      dateTo ||
      ""
    ).trim()
  ) {
    conditions.push(
      "al.created_at < DATE_ADD(:dateTo, INTERVAL 1 DAY)"
    );

    params.dateTo =
      String(
        dateTo
      ).trim();
  }


  const whereSql =
    conditions.join(
      " AND "
    );


  const [
    countRows,
  ] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM audit_logs al

        LEFT JOIN users u
          ON u.id =
             al.user_id

        WHERE
          ${whereSql}
      `,
      params
    );


  const total =
    Number(
      countRows[0]
        ?.total ||
      0
    );


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          al.id,
          al.user_id,
          al.action,
          al.module,
          al.record_id,
          al.description,
          al.ip_address,
          al.created_at,

          u.username,
          u.full_name

        FROM audit_logs al

        LEFT JOIN users u
          ON u.id =
             al.user_id

        WHERE
          ${whereSql}

        ORDER BY
          al.created_at DESC,
          al.id DESC

        LIMIT ${safeLimit}
        OFFSET ${offset}
      `,
      params
    );


  return {
    rows,

    pagination: {
      page:
        safePage,

      limit:
        safeLimit,

      total,

      total_pages:
        Math.max(
          1,
          Math.ceil(
            total /
            safeLimit
          )
        ),
    },
  };
}


async function getAuditLogById(
  id
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          al.id,
          al.user_id,
          al.action,
          al.module,
          al.record_id,
          al.description,
          al.old_data,
          al.new_data,
          al.ip_address,
          al.created_at,

          u.username,
          u.full_name

        FROM audit_logs al

        LEFT JOIN users u
          ON u.id =
             al.user_id

        WHERE
          al.id =
            :id

        LIMIT 1
      `,
      {
        id,
      }
    );


  return (
    rows[0] ||
    null
  );
}


async function getAuditLogOptions() {
  const [
    moduleRows,
    actionRows,
    userRows,
  ] =
    await Promise.all([
      pool.query(`
        SELECT DISTINCT
          module

        FROM audit_logs

        WHERE
          module IS NOT NULL
          AND TRIM(module) <> ''

        ORDER BY
          module ASC
      `),

      pool.query(`
        SELECT DISTINCT
          action

        FROM audit_logs

        WHERE
          action IS NOT NULL
          AND TRIM(action) <> ''

        ORDER BY
          action ASC
      `),

      pool.query(`
        SELECT DISTINCT
          u.id,
          u.username,
          u.full_name

        FROM audit_logs al

        JOIN users u
          ON u.id =
             al.user_id

        ORDER BY
          u.full_name ASC,
          u.username ASC
      `),
    ]);


  return {
    modules:
      moduleRows[0].map(
        (
          row
        ) =>
          row.module
      ),

    actions:
      actionRows[0].map(
        (
          row
        ) =>
          row.action
      ),

    users:
      userRows[0],
  };
}


module.exports = {
  getAuditLogs,
  getAuditLogById,
  getAuditLogOptions,
};