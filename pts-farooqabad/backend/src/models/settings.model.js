const {
  pool,
} = require("../config/db");


/*
|--------------------------------------------------------------------------
| DEFAULT SYSTEM SETTINGS
|--------------------------------------------------------------------------
*/

const DEFAULT_SETTINGS = {
  idle_logout_minutes:
    5,

  biometric_auto_sync_seconds:
    10,

  dashboard_refresh_seconds:
    60,

  general_statement_refresh_seconds:
    60,
};


const SETTING_DESCRIPTIONS = {
  idle_logout_minutes:
    "Portal inactivity timeout in minutes.",

  biometric_auto_sync_seconds:
    "Current-date ZKBioTime transaction auto-sync interval in seconds.",

  dashboard_refresh_seconds:
    "Dashboard automatic refresh interval in seconds.",

  general_statement_refresh_seconds:
    "General Statement active-course refresh interval in seconds.",
};


const VALID_SETTING_KEYS =
  Object.keys(
    DEFAULT_SETTINGS
  );


let initializationPromise =
  null;


/*
|--------------------------------------------------------------------------
| ENSURE TABLE + DEFAULT VALUES
|--------------------------------------------------------------------------
*/

async function ensureSystemSettingsTable() {
  if (
    initializationPromise
  ) {
    return initializationPromise;
  }

  initializationPromise =
    (async () => {
      await pool.query(
        `
          CREATE TABLE IF NOT EXISTS system_settings
          (
            setting_key
              VARCHAR(100)
              NOT NULL,

            setting_value
              VARCHAR(255)
              NOT NULL,

            description
              VARCHAR(255)
              NULL,

            updated_by
              BIGINT
              NULL,

            created_at
              TIMESTAMP
              NOT NULL
              DEFAULT CURRENT_TIMESTAMP,

            updated_at
              TIMESTAMP
              NOT NULL
              DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,

            PRIMARY KEY
              (setting_key),

            INDEX
              idx_system_settings_updated_by
              (updated_by)
          )
          ENGINE=InnoDB
          DEFAULT CHARSET=utf8mb4
          COLLATE=utf8mb4_unicode_ci
        `
      );

      /*
      |--------------------------------------------------------------------------
      | INSERT DEFAULTS ONLY WHEN MISSING
      |--------------------------------------------------------------------------
      */

      await pool.query(
        `
          INSERT IGNORE INTO system_settings
          (
            setting_key,
            setting_value,
            description
          )

          VALUES
          (
            'idle_logout_minutes',
            '5',
            'Portal inactivity timeout in minutes.'
          ),
          (
            'biometric_auto_sync_seconds',
            '10',
            'Current-date ZKBioTime transaction auto-sync interval in seconds.'
          ),
          (
            'dashboard_refresh_seconds',
            '60',
            'Dashboard automatic refresh interval in seconds.'
          ),
          (
            'general_statement_refresh_seconds',
            '60',
            'General Statement active-course refresh interval in seconds.'
          )
        `
      );
    })();

  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise =
      null;

    throw error;
  }

  return initializationPromise;
}


/*
|--------------------------------------------------------------------------
| PARSE INTEGER
|--------------------------------------------------------------------------
*/

function parseIntegerSetting(
  value,
  fallback
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed
    )
  ) {
    return fallback;
  }

  return parsed;
}


/*
|--------------------------------------------------------------------------
| GET SETTINGS
|--------------------------------------------------------------------------
*/

async function getSystemSettings() {
  await ensureSystemSettingsTable();

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          setting_key,
          setting_value,
          description,
          updated_by,
          updated_at

        FROM system_settings

        WHERE
          setting_key IN
          (
            'idle_logout_minutes',
            'biometric_auto_sync_seconds',
            'dashboard_refresh_seconds',
            'general_statement_refresh_seconds'
          )

        ORDER BY
          setting_key ASC
      `
    );

  const data = {
    ...DEFAULT_SETTINGS,
  };

  for (
    const row
    of rows
  ) {
    if (
      !VALID_SETTING_KEYS.includes(
        row.setting_key
      )
    ) {
      continue;
    }

    const parsedValue =
      parseIntegerSetting(
        row.setting_value,
        DEFAULT_SETTINGS[
          row.setting_key
        ]
      );

    data[
      row.setting_key
    ] =
      row.setting_key ===
        "dashboard_refresh_seconds"
        ? Math.max(
            60,
            parsedValue
          )
        : parsedValue;
  }

  return data;
}


/*
|--------------------------------------------------------------------------
| UPDATE SETTINGS
|--------------------------------------------------------------------------
*/

async function updateSystemSettings(
  settings,
  updatedBy =
    null
) {
  await ensureSystemSettingsTable();

  const entries =
    Object.entries(
      settings ||
      {}
    ).filter(
      ([key]) =>
        VALID_SETTING_KEYS.includes(
          key
        )
    );

  if (
    !entries.length
  ) {
    return getSystemSettings();
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (
      const [
        key,
        value,
      ]
      of entries
    ) {
      await connection.query(
        `
          INSERT INTO system_settings
          (
            setting_key,
            setting_value,
            description,
            updated_by
          )

          VALUES
          (
            :settingKey,
            :settingValue,
            :description,
            :updatedBy
          )

          ON DUPLICATE KEY UPDATE
            setting_value =
              :settingValueUpdate,

            description =
              :descriptionUpdate,

            updated_by =
              :updatedByUpdate
        `,
        {
          settingKey:
            key,

          settingValue:
            String(
              value
            ),

          description:
            SETTING_DESCRIPTIONS[
              key
            ] ||
            null,

          updatedBy,

          settingValueUpdate:
            String(
              value
            ),

          descriptionUpdate:
            SETTING_DESCRIPTIONS[
              key
            ] ||
            null,

          updatedByUpdate:
            updatedBy,
        }
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  return getSystemSettings();
}



/*
|--------------------------------------------------------------------------
| COURSE-WISE APPROVED LEAVE CAPS
|--------------------------------------------------------------------------
*/

async function getCourseLeaveCaps() {
  const [rows] =
    await pool.query(
      `
        SELECT
          c.id AS course_id,
          c.course_name,
          c.course_code,
          c.start_date,
          c.end_date,

          clc.max_approved_leaves,
          clc.created_by,
          clc.updated_by,
          clc.created_at,
          clc.updated_at

        FROM course_leave_caps clc

        INNER JOIN courses c
          ON c.id = clc.course_id

        ORDER BY
          c.start_date DESC,
          c.course_name ASC
      `
    );

  return rows;
}


async function getCourseLeaveCapByCourseId(
  courseId
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          c.id AS course_id,
          c.course_name,
          c.course_code,
          c.start_date,
          c.end_date,

          clc.max_approved_leaves,
          clc.created_by,
          clc.updated_by,
          clc.created_at,
          clc.updated_at

        FROM course_leave_caps clc

        INNER JOIN courses c
          ON c.id = clc.course_id

        WHERE
          clc.course_id = :courseId

        LIMIT 1
      `,
      {
        courseId,
      }
    );

  return (
    rows[0] ||
    null
  );
}


async function courseExists(
  courseId
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          course_name

        FROM courses

        WHERE
          id = :courseId

        LIMIT 1
      `,
      {
        courseId,
      }
    );

  return (
    rows[0] ||
    null
  );
}


async function upsertCourseLeaveCap({
  courseId,
  maxApprovedLeaves,
  userId =
    null,
}) {
  await pool.query(
    `
      INSERT INTO course_leave_caps
      (
        course_id,
        max_approved_leaves,
        created_by,
        updated_by
      )

      VALUES
      (
        :courseId,
        :maxApprovedLeaves,
        :userId,
        :userId
      )

      ON DUPLICATE KEY UPDATE
        max_approved_leaves =
          :maxApprovedLeavesUpdate,

        updated_by =
          :userIdUpdate
    `,
    {
      courseId,
      maxApprovedLeaves,
      userId,

      maxApprovedLeavesUpdate:
        maxApprovedLeaves,

      userIdUpdate:
        userId,
    }
  );

  return getCourseLeaveCapByCourseId(
    courseId
  );
}


async function deleteCourseLeaveCap(
  courseId
) {
  const before =
    await getCourseLeaveCapByCourseId(
      courseId
    );

  if (!before) {
    return null;
  }

  await pool.query(
    `
      DELETE FROM course_leave_caps

      WHERE
        course_id = :courseId
    `,
    {
      courseId,
    }
  );

  return before;
}

module.exports = {
  DEFAULT_SETTINGS,

  VALID_SETTING_KEYS,

  ensureSystemSettingsTable,

  getSystemSettings,

  updateSystemSettings,

  getCourseLeaveCaps,
  getCourseLeaveCapByCourseId,
  courseExists,
  upsertCourseLeaveCap,
  deleteCourseLeaveCap,
};