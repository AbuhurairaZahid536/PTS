const { pool } = require("../config/db");
const {
  getCurrentOperationalProtectionKeys,
  getLongWeekendBiometricClosureEvents,
} = require("../services/operationalStatus.service");

const SUBJECT_TYPES = new Set(["TRAINEE", "STAFF"]);

const SOURCE_TYPES = new Set([
  "ATTENDANCE",
  "DUTY_ROSTER",
]);

const CONTEXT_TYPES = new Set([
  "TIMETABLE",
  "DUTY_SHIFT",
]);

const RETRYABLE_DB_CODES = new Set([
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
]);


/*
|--------------------------------------------------------------------------
| BASIC HELPERS
|--------------------------------------------------------------------------
*/

function clean(value) {
  return value === undefined ||
    value === null
    ? ""
    : String(value).trim();
}


function positiveInt(value) {
  const number =
    Number(value);

  return Number.isInteger(number) &&
    number > 0
    ? number
    : null;
}


function normalizeEnum(
  value,
  allowed,
  label,
  allowNull = false
) {
  const normalized =
    clean(value).toUpperCase();

  if (
    !normalized &&
    allowNull
  ) {
    return null;
  }

  if (
    !allowed.has(normalized)
  ) {
    const error =
      new Error(
        `${label} is invalid.`
      );

    error.statusCode =
      400;

    throw error;
  }

  return normalized;
}


function normalizeDate(value) {
  const match =
    clean(value).match(
      /^(\d{4}-\d{2}-\d{2})/
    );

  return match
    ? match[1]
    : null;
}


function normalizeDateTime(value) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return null;
    }

    const pad =
      (number) =>
        String(number).padStart(
          2,
          "0"
        );

    return (
      `${value.getFullYear()}-` +
      `${pad(
        value.getMonth() + 1
      )}-` +
      `${pad(
        value.getDate()
      )} ` +
      `${pad(
        value.getHours()
      )}:` +
      `${pad(
        value.getMinutes()
      )}:` +
      `${pad(
        value.getSeconds()
      )}`
    );
  }

  const match =
    clean(value).match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/
    );

  return match
    ? `${match[1]} ${match[2]}`
    : null;
}


/*
|--------------------------------------------------------------------------
| SOURCE KEY
|--------------------------------------------------------------------------
|
| ATTENDANCE:
|
|   ATTENDANCE:12345
|
| DUTY ROSTER:
|
|   We can pass our own unique source_key later.
|
|--------------------------------------------------------------------------
*/

function buildSourceKey({
  sourceType,
  sourceRecordId,
  sourceKey,
}) {
  const supplied =
    clean(sourceKey);

  if (supplied) {
    if (
      supplied.length > 190
    ) {
      const error =
        new Error(
          "source_key cannot exceed 190 characters."
        );

      error.statusCode =
        400;

      throw error;
    }

    return supplied;
  }

  const id =
    positiveInt(
      sourceRecordId
    );

  if (!id) {
    const error =
      new Error(
        "source_key or source_record_id is required."
      );

    error.statusCode =
      400;

    throw error;
  }

  return (
    `${sourceType}:` +
    `${id}`
  );
}


/*
|--------------------------------------------------------------------------
| NORMALIZE MISSED REQUIRED WINDOW
|--------------------------------------------------------------------------
*/

function normalizeMissedSession(
  input = {}
) {
  const subjectType =
    normalizeEnum(
      input.subjectType ??
        input.subject_type,

      SUBJECT_TYPES,

      "subject_type"
    );


  const subjectId =
    positiveInt(
      input.subjectId ??
        input.subject_id
    );


  const employeeId =
    clean(
      input.employeeId ??
        input.employee_id
    );


  const sourceType =
    normalizeEnum(
      input.sourceType ??
        input.source_type,

      SOURCE_TYPES,

      "source_type"
    );


  const sourceRecordId =
    positiveInt(
      input.sourceRecordId ??
        input.source_record_id
    );


  const sourceKey =
    buildSourceKey({
      sourceType,

      sourceRecordId,

      sourceKey:
        input.sourceKey ??
        input.source_key,
    });


  const attendanceDate =
    normalizeDate(
      input.attendanceDate ??
        input.attendance_date
    );


  const sessionType =
    clean(
      input.sessionType ??
        input.session_type
    ).toUpperCase();


  const windowStart =
    normalizeDateTime(
      input.windowStart ??
        input.window_start
    );


  const windowEnd =
    normalizeDateTime(
      input.windowEnd ??
        input.window_end
    );


  const contextType =
    normalizeEnum(
      input.contextType ??
        input.context_type,

      CONTEXT_TYPES,

      "context_type",

      true
    );


  const contextId =
    positiveInt(
      input.contextId ??
        input.context_id
    );


  const contextName =
    clean(
      input.contextName ??
        input.context_name
    ) || null;


  if (!subjectId) {
    throw Object.assign(
      new Error(
        "A valid subject_id is required."
      ),
      {
        statusCode:
          400,
      }
    );
  }


  if (!employeeId) {
    throw Object.assign(
      new Error(
        "employee_id is required."
      ),
      {
        statusCode:
          400,
      }
    );
  }


  if (!attendanceDate) {
    throw Object.assign(
      new Error(
        "A valid attendance_date is required."
      ),
      {
        statusCode:
          400,
      }
    );
  }


  if (!sessionType) {
    throw Object.assign(
      new Error(
        "session_type is required."
      ),
      {
        statusCode:
          400,
      }
    );
  }


  if (!windowEnd) {
    throw Object.assign(
      new Error(
        "A valid required window_end is required."
      ),
      {
        statusCode:
          400,
      }
    );
  }


  return {
    subjectType,

    subjectId,

    employeeId,

    sourceType,

    sourceKey,

    sourceRecordId,

    attendanceDate,

    sessionType,

    contextType,

    contextId,

    contextName,

    windowStart,

    windowEnd,
  };
}


/*
|--------------------------------------------------------------------------
| TRANSACTION RETRY
|--------------------------------------------------------------------------
|
| One employee / absence episode remains a small transaction.
|
| Deadlock or lock timeout is retried safely.
|
|--------------------------------------------------------------------------
*/

function isRetryableDbError(
  error
) {
  return (
    RETRYABLE_DB_CODES.has(
      error?.code
    ) ||

    [
      1205,
      1213,
    ].includes(
      Number(
        error?.errno
      )
    )
  );
}


async function runTransaction(
  work
) {
  let lastError =
    null;


  for (
    let attempt = 1;

    attempt <= 3;

    attempt += 1
  ) {
    const connection =
      await pool.getConnection();


    let retryDelayMs =
      0;


    try {
      await connection.beginTransaction();


      const result =
        await work(
          connection
        );


      await connection.commit();


      return result;
    } catch (error) {
      lastError =
        error;


      try {
        await connection.rollback();
      } catch (_) {
        // Ignore rollback failure.
      }


      if (
        !isRetryableDbError(
          error
        ) ||

        attempt === 3
      ) {
        throw error;
      }


      /*
      |--------------------------------------------------------------------
      | SMALL RETRY BACKOFF
      |--------------------------------------------------------------------
      |
      | A cold start can open many absence episodes at the same time.
      | Immediate deadlock retries can collide again with the same workers.
      | Release the DB connection first, then wait briefly before retrying.
      |
      |--------------------------------------------------------------------
      */

      retryDelayMs =
        30 * attempt;
    } finally {
      connection.release();
    }


    if (
      retryDelayMs > 0
    ) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            retryDelayMs
          )
      );
    }
  }


  throw lastError;
}


/*
|--------------------------------------------------------------------------
| GET EPISODE
|--------------------------------------------------------------------------
*/

async function getEpisodeById(
  episodeId,
  connection = pool
) {
  const id =
    positiveInt(
      episodeId
    );


  if (!id) {
    return null;
  }


  const [
    rows,
  ] =
    await connection.query(
      `
        SELECT
          ae.*,

          CASE

            WHEN
              ae.status =
              'OPEN'

            THEN
              GREATEST(
                0,

                TIMESTAMPDIFF(
                  SECOND,

                  ae.absent_from,

                  DATE_ADD(
                    UTC_TIMESTAMP(),
                    INTERVAL 5 HOUR
                  )
                )
              )

            ELSE
              COALESCE(
                ae.duration_seconds,

                GREATEST(
                  0,

                  TIMESTAMPDIFF(
                    SECOND,

                    ae.absent_from,

                    ae.return_punch_at
                  )
                )
              )

          END
            AS duration_seconds_current

        FROM absence_episodes ae

        WHERE
          ae.id = ?

        LIMIT 1
      `,
      [
        id,
      ]
    );


  return rows[0] ||
    null;
}


/*
|--------------------------------------------------------------------------
| CURRENT OPEN ABSENCE
|--------------------------------------------------------------------------
*/

async function getOpenEpisode({
  subjectType,

  subjectId,

  employeeId,

  connection = pool,

  lock = false,
}) {
  const type =
    normalizeEnum(
      subjectType,

      SUBJECT_TYPES,

      "subject_type"
    );


  const id =
    positiveInt(
      subjectId
    );


  const code =
    clean(
      employeeId
    );


  if (
    !id ||
    !code
  ) {
    return null;
  }


  const [
    rows,
  ] =
    await connection.query(
      `
        SELECT
          ae.*

        FROM absence_episodes ae

        WHERE
          ae.status =
            'OPEN'

          AND
          (
            (
              ae.subject_type = ?

              AND
              ae.subject_id = ?
            )

            OR

            ae.employee_id = ?
          )

        ORDER BY

          CASE

            WHEN
              ae.subject_type = ?

              AND
              ae.subject_id = ?

            THEN 0

            ELSE 1

          END,

          ae.id ASC

        LIMIT 1

        ${
          lock
            ? "FOR UPDATE"
            : ""
        }
      `,
      [
        type,

        id,

        code,

        type,

        id,
      ]
    );


  return rows[0] ||
    null;
}


/*
|--------------------------------------------------------------------------
| MISSED SESSION SOURCE CHECK
|--------------------------------------------------------------------------
*/

async function getMissedSessionBySourceKey(
  sourceKey,

  connection = pool,

  lock = false
) {
  const key =
    clean(
      sourceKey
    );


  if (!key) {
    return null;
  }


  const [
    rows,
  ] =
    await connection.query(
      `
        SELECT
          *

        FROM absence_episode_sessions

        WHERE
          source_key = ?

        LIMIT 1

        ${
          lock
            ? "FOR UPDATE"
            : ""
        }
      `,
      [
        key,
      ]
    );


  return rows[0] ||
    null;
}


/*
|--------------------------------------------------------------------------
| FIND RETURN PUNCH
|--------------------------------------------------------------------------
|
| IMPORTANT BUSINESS RULE
|--------------------------------------------------------------------------
|
| Once Continuous Absence is OPEN:
|
| ANY genuine later biometric punch closes the absence.
|
| It does NOT have to be inside the next Morning / Evening / Duty Roster
| attendance window.
|
|
| Example:
|
| Required window:
| 06:00 PM - 08:00 PM
|
| No punch:
| absent_from = 08:00 PM
|
| Finger punch:
| 09:00 PM
|
| Return:
| 09:00 PM
|
| Absence Period:
| 1 hour
|
|--------------------------------------------------------------------------
*/

async function findFirstBiometricPunchAfter({
  employeeId,

  after,

  onOrBefore = null,

  connection = pool,
}) {
  const code =
    clean(
      employeeId
    );


  const afterAt =
    normalizeDateTime(
      after
    );


  const beforeAt =
    normalizeDateTime(
      onOrBefore
    );


  if (
    !code ||
    !afterAt
  ) {
    return null;
  }


  const extraSql =
    beforeAt
      ? "AND zt.punch_time <= ?"
      : "";


  const params =
    beforeAt
      ? [
          code,
          afterAt,
          beforeAt,
        ]
      : [
          code,
          afterAt,
        ];


  /*
  |--------------------------------------------------------------------------
  | INDEXED NORMAL LOOKUP
  |--------------------------------------------------------------------------
  */

  let [
    rows,
  ] =
    await connection.query(
      `
        SELECT
          id,

          emp_code,

          punch_time,

          punch_state,

          punch_state_display,

          verify_type,

          verify_type_display,

          terminal_sn,

          terminal_alias

        FROM zkteco_transactions zt

        WHERE
          zt.emp_code = ?

          AND
          zt.punch_time > ?

          ${extraSql}

        ORDER BY
          zt.punch_time ASC,

          zt.id ASC

        LIMIT 1
      `,
      params
    );


  if (
    rows.length
  ) {
    return rows[0];
  }


  /*
  |--------------------------------------------------------------------------
  | LEGACY SAFETY FALLBACK
  |--------------------------------------------------------------------------
  |
  | Normally Employee ID exact match will be used.
  |
  | TRIM lookup runs only if exact indexed lookup found nothing.
  |
  |--------------------------------------------------------------------------
  */

  [
    rows,
  ] =
    await connection.query(
      `
        SELECT
          id,

          emp_code,

          punch_time,

          punch_state,

          punch_state_display,

          verify_type,

          verify_type_display,

          terminal_sn,

          terminal_alias

        FROM zkteco_transactions zt

        WHERE
          TRIM(
            zt.emp_code
          ) = ?

          AND
          zt.punch_time > ?

          ${extraSql}

        ORDER BY
          zt.punch_time ASC,

          zt.id ASC

        LIMIT 1
      `,
      params
    );


  return rows[0] ||
    null;
}


/*
|--------------------------------------------------------------------------
| CLOSE EPISODE INSIDE CURRENT TRANSACTION
|--------------------------------------------------------------------------
*/

async function closeEpisodeInsideTransaction(
  connection,

  episode,

  punch
) {
  if (
    !episode ||

    episode.status !==
      "OPEN" ||

    !punch
  ) {
    return false;
  }


  const punchTime =
    normalizeDateTime(
      punch.punch_time
    );


  const [
    check,
  ] =
    await connection.query(
      `
        SELECT
          (
            TIMESTAMPDIFF(
              SECOND,
              ?,
              ?
            ) > 0
          )
            AS valid_return
      `,
      [
        episode.absent_from,

        punchTime,
      ]
    );


  if (
    Number(
      check[0]
        ?.valid_return ||
      0
    ) !== 1
  ) {
    return false;
  }


  await connection.query(
    `
      UPDATE absence_episodes

      SET
        return_punch_at = ?,

        return_transaction_id = ?,

        duration_seconds =
          GREATEST(
            0,

            TIMESTAMPDIFF(
              SECOND,

              absent_from,

              ?
            )
          ),

        status =
          'RETURNED'

      WHERE
        id = ?

        AND
        status =
          'OPEN'
    `,
    [
      punchTime,

      punch.id,

      punchTime,

      episode.id,
    ]
  );


  return true;
}


/*
|--------------------------------------------------------------------------
| CLOSE USING KNOWN PUNCH
|--------------------------------------------------------------------------
*/

async function closeOpenEpisodeWithPunch({
  episodeId,

  transactionId,

  punchTime,
}) {
  const id =
    positiveInt(
      episodeId
    );


  const transaction =
    positiveInt(
      transactionId
    );


  const returnedAt =
    normalizeDateTime(
      punchTime
    );


  if (
    !id ||

    !transaction ||

    !returnedAt
  ) {
    throw Object.assign(
      new Error(
        "episodeId, transactionId and punchTime are required."
      ),
      {
        statusCode:
          400,
      }
    );
  }


  return runTransaction(
    async (
      connection
    ) => {
      const [
        rows,
      ] =
        await connection.query(
          `
            SELECT
              *

            FROM absence_episodes

            WHERE
              id = ?

            LIMIT 1

            FOR UPDATE
          `,
          [
            id,
          ]
        );


      const episode =
        rows[0];


      if (!episode) {
        throw Object.assign(
          new Error(
            "Absence episode not found."
          ),
          {
            statusCode:
              404,
          }
        );
      }


      if (
        episode.status ===
        "RETURNED"
      ) {
        return {
          action:
            "ALREADY_RETURNED",

          episode:
            await getEpisodeById(
              id,
              connection
            ),
        };
      }


      const closed =
        await closeEpisodeInsideTransaction(
          connection,

          episode,

          {
            id:
              transaction,

            punch_time:
              returnedAt,
          }
        );


      if (!closed) {
        throw Object.assign(
          new Error(
            "Return punch must be later than absent_from."
          ),
          {
            statusCode:
              400,
          }
        );
      }


      return {
        action:
          "RETURNED",

        episode:
          await getEpisodeById(
            id,
            connection
          ),
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| REGISTER MISSED REQUIRED WINDOW
|--------------------------------------------------------------------------
|
| FIRST MISSED WINDOW
|
|   → OPEN absence
|
|
| ANOTHER WINDOW MISSED
|
|   → same absence continues
|
|
| RETURN PUNCH HAPPENED
|
|   → old absence closes
|
|
| ANOTHER WINDOW MISSED AFTER RETURN
|
|   → new absence episode
|
|--------------------------------------------------------------------------
*/

async function registerMissedSession(
  input
) {
  const event =
    normalizeMissedSession(
      input
    );


  return runTransaction(
    async (
      connection
    ) => {
      /*
      |--------------------------------------------------------------------------
      | ALREADY PROCESSED
      |--------------------------------------------------------------------------
      */

      const existingSession =
        await getMissedSessionBySourceKey(
          event.sourceKey,

          connection,

          true
        );


      if (
        existingSession
      ) {
        return {
          action:
            "ALREADY_REGISTERED",

          session:
            existingSession,

          episode:
            await getEpisodeById(
              existingSession
                .episode_id,

              connection
            ),
        };
      }


      /*
      |--------------------------------------------------------------------------
      | CURRENT OPEN ABSENCE
      |--------------------------------------------------------------------------
      */

      let openEpisode =
        await getOpenEpisode({
          subjectType:
            event.subjectType,

          subjectId:
            event.subjectId,

          employeeId:
            event.employeeId,

          connection,

          lock:
            true,
        });


      /*
      |--------------------------------------------------------------------------
      | HISTORICAL OUT-OF-ORDER SAFETY
      |--------------------------------------------------------------------------
      |
      | Historical backfill will later be processed chronologically.
      |
      |--------------------------------------------------------------------------
      */

      if (
        openEpisode &&

        String(
          event.windowEnd
        ) <
          String(
            openEpisode
              .absent_from
          )
      ) {
        const error =
          new Error(
            "Missed attendance event is older than the current open absence and must be reconciled chronologically."
          );


        error.code =
          "ABSENCE_OUT_OF_ORDER";


        error.statusCode =
          409;


        throw error;
      }


      /*
      |--------------------------------------------------------------------------
      | DID PERSON RETURN BEFORE THIS LATER MISSED WINDOW?
      |--------------------------------------------------------------------------
      */

      if (
        openEpisode
      ) {
        const returnPunch =
          await findFirstBiometricPunchAfter({
            employeeId:
              openEpisode
                .employee_id,

            after:
              openEpisode
                .absent_from,

            onOrBefore:
              event.windowEnd,

            connection,
          });


        if (
          returnPunch
        ) {
          await closeEpisodeInsideTransaction(
            connection,

            openEpisode,

            returnPunch
          );


          openEpisode =
            null;
        }
      }


      let episodeId =
        openEpisode
          ? Number(
              openEpisode.id
            )
          : null;


      let action =
        openEpisode
          ? "CONTINUED"
          : "OPENED";


      /*
      |--------------------------------------------------------------------------
      | OPEN NEW ABSENCE
      |--------------------------------------------------------------------------
      */

      if (!episodeId) {
        try {
          const [
            result,
          ] =
            await connection.query(
              `
                INSERT INTO absence_episodes
                (
                  subject_type,

                  subject_id,

                  employee_id,

                  absent_from,

                  start_source_type,

                  start_source_key,

                  start_source_record_id,

                  start_session_type,

                  start_context_type,

                  start_context_id,

                  start_context_name,

                  last_missed_at,

                  last_source_type,

                  last_source_key,

                  last_source_record_id,

                  last_session_type,

                  missed_session_count,

                  status
                )

                VALUES
                (
                  ?, ?, ?, ?,

                  ?, ?, ?,

                  ?, ?, ?, ?,

                  ?, ?, ?, ?, ?,

                  1,

                  'OPEN'
                )
              `,
              [
                event.subjectType,

                event.subjectId,

                event.employeeId,

                event.windowEnd,

                event.sourceType,

                event.sourceKey,

                event.sourceRecordId,

                event.sessionType,

                event.contextType,

                event.contextId,

                event.contextName,

                event.windowEnd,

                event.sourceType,

                event.sourceKey,

                event.sourceRecordId,

                event.sessionType,
              ]
            );


          episodeId =
            Number(
              result.insertId
            );
        } catch (error) {
          /*
          |--------------------------------------------------------------------------
          | CONCURRENT SAFETY
          |--------------------------------------------------------------------------
          |
          | DB unique open employee / subject key is authoritative.
          |
          |--------------------------------------------------------------------------
          */

          if (
            error?.code !==
            "ER_DUP_ENTRY"
          ) {
            throw error;
          }


          const concurrent =
            await getOpenEpisode({
              subjectType:
                event.subjectType,

              subjectId:
                event.subjectId,

              employeeId:
                event.employeeId,

              connection,

              lock:
                true,
            });


          if (!concurrent) {
            throw error;
          }


          episodeId =
            Number(
              concurrent.id
            );


          action =
            "CONTINUED";
        }
      }


      /*
      |--------------------------------------------------------------------------
      | SAVE MISSED SESSION
      |--------------------------------------------------------------------------
      */

      let sessionInserted =
        true;


      try {
        await connection.query(
          `
            INSERT INTO absence_episode_sessions
            (
              episode_id,

              subject_type,

              subject_id,

              employee_id,

              source_type,

              source_key,

              source_record_id,

              attendance_date,

              session_type,

              context_type,

              context_id,

              context_name,

              window_start,

              window_end
            )

            VALUES
            (
              ?, ?, ?, ?,

              ?, ?, ?,

              ?, ?,

              ?, ?, ?,

              ?, ?
            )
          `,
          [
            episodeId,

            event.subjectType,

            event.subjectId,

            event.employeeId,

            event.sourceType,

            event.sourceKey,

            event.sourceRecordId,

            event.attendanceDate,

            event.sessionType,

            event.contextType,

            event.contextId,

            event.contextName,

            event.windowStart,

            event.windowEnd,
          ]
        );
      } catch (error) {
        if (
          error?.code !==
          "ER_DUP_ENTRY"
        ) {
          throw error;
        }


        sessionInserted =
          false;
      }


      /*
      |--------------------------------------------------------------------------
      | DUPLICATE SAFE
      |--------------------------------------------------------------------------
      */

      if (
        !sessionInserted
      ) {
        const existing =
          await getMissedSessionBySourceKey(
            event.sourceKey,

            connection,

            true
          );


        if (!existing) {
          throw Object.assign(
            new Error(
              "Missed session duplicate could not be resolved."
            ),
            {
              statusCode:
                409,
            }
          );
        }


        return {
          action:
            "ALREADY_REGISTERED",

          session:
            existing,

          episode:
            await getEpisodeById(
              existing.episode_id,

              connection
            ),
        };
      }


      /*
      |--------------------------------------------------------------------------
      | CONTINUE SAME ABSENCE
      |--------------------------------------------------------------------------
      */

      if (
        action ===
        "CONTINUED"
      ) {
        await connection.query(
          `
            UPDATE absence_episodes

            SET
              last_missed_at =
                GREATEST(
                  last_missed_at,

                  ?
                ),

              last_source_type = ?,

              last_source_key = ?,

              last_source_record_id = ?,

              last_session_type = ?,

              missed_session_count =
                missed_session_count + 1

            WHERE
              id = ?
          `,
          [
            event.windowEnd,

            event.sourceType,

            event.sourceKey,

            event.sourceRecordId,

            event.sessionType,

            episodeId,
          ]
        );
      }


      return {
        action,

        episode:
          await getEpisodeById(
            episodeId,

            connection
          ),

        session:
          await getMissedSessionBySourceKey(
            event.sourceKey,

            connection
          ),
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| REBUILD ONE OPEN EPISODE FROM ITS MISSED SESSIONS + AVAILABLE PUNCHES
|--------------------------------------------------------------------------
|
| Why this is necessary:
|
| A biometric punch can arrive late from ZKBioTime after more missed sessions
| have already been attached to the same OPEN episode.
|
| Example:
|
|   Morning missed 09:10  -> OPEN episode
|   Evening missed 20:10  -> same episode continued
|   12:00 punch syncs late afterwards
|
| Business rule says the 12:00 punch RETURNED the trainee from the Morning
| absence. The Evening miss must therefore start a NEW episode. Merely closing
| the old row at 12:00 leaves its later Evening session attached to the wrong
| period and produces incorrect Dashboard/Profile durations.
|
| This routine transactionally rebuilds only the CURRENT OPEN episode into the
| correct chronological groups. Existing session source rows are preserved and
| simply reassigned to the correct episode. No attendance history is changed.
|--------------------------------------------------------------------------
*/

async function rebuildOpenEpisodeTimeline(
  episodeId
) {
  const id =
    positiveInt(
      episodeId
    );

  if (!id) {
    return {
      action:
        "NO_OPEN_EPISODE",

      episode:
        null,
    };
  }

  return runTransaction(
    async (
      connection
    ) => {
      const [
        episodeRows,
      ] =
        await connection.query(
          `
            SELECT
              *

            FROM absence_episodes

            WHERE
              id = ?

            LIMIT 1

            FOR UPDATE
          `,
          [
            id,
          ]
        );

      const originalEpisode =
        episodeRows[0] ||
        null;

      if (
        !originalEpisode ||
        originalEpisode.status !==
          "OPEN"
      ) {
        return {
          action:
            "NO_OPEN_EPISODE",

          episode:
            originalEpisode,
        };
      }

      const [
        sessions,
      ] =
        await connection.query(
          `
            SELECT
              id,
              episode_id,

              subject_type,
              subject_id,
              employee_id,

              source_type,
              source_key,
              source_record_id,

              attendance_date,
              session_type,

              context_type,
              context_id,
              context_name,

              window_start,
              window_end

            FROM absence_episode_sessions

            WHERE
              episode_id = ?

            ORDER BY
              window_end ASC,
              id ASC

            FOR UPDATE
          `,
          [
            id,
          ]
        );

      if (!sessions.length) {
        await connection.query(
          `
            DELETE FROM absence_episodes

            WHERE
              id = ?
              AND status = 'OPEN'
          `,
          [
            id,
          ]
        );

        return {
          action:
            "STALE_OPEN_REMOVED",

          episode:
            null,
        };
      }

      /*
      |--------------------------------------------------------------------
      | BUILD CHRONOLOGICAL GROUPS
      |--------------------------------------------------------------------
      |
      | A group starts at the first missed session. The first genuine punch
      | AFTER that group's absent_from closes it. Any missed session whose
      | window_end is later than that return punch belongs to the next group.
      |--------------------------------------------------------------------
      */

      const groups = [];
      let index = 0;

      while (
        index <
        sessions.length
      ) {
        const first =
          sessions[index];

        const startAt =
          normalizeDateTime(
            first.window_end
          );

        if (!startAt) {
          throw Object.assign(
            new Error(
              "Continuous absence session has an invalid window_end."
            ),
            {
              statusCode:
                409,
            }
          );
        }

        const returnPunch =
          await findFirstBiometricPunchAfter({
            employeeId:
              first.employee_id,

            after:
              startAt,

            connection,
          });

        const returnAt =
          returnPunch
            ? normalizeDateTime(
                returnPunch.punch_time
              )
            : null;

        let endIndex =
          sessions.length - 1;

        if (returnAt) {
          endIndex =
            index;

          while (
            endIndex + 1 <
              sessions.length &&
            String(
              normalizeDateTime(
                sessions[
                  endIndex + 1
                ].window_end
              ) ||
              ""
            ) <
              String(
                returnAt
              )
          ) {
            endIndex +=
              1;
          }
        }

        const groupSessions =
          sessions.slice(
            index,
            endIndex + 1
          );

        groups.push({
          sessions:
            groupSessions,

          returnPunch:
            returnPunch ||
            null,

          returnAt:
            returnAt ||
            null,
        });

        index =
          endIndex + 1;
      }

      let latestOpenEpisodeId =
        null;

      let returnedGroups =
        0;

      const episodeIds = [];

      for (
        let groupIndex = 0;
        groupIndex <
          groups.length;
        groupIndex += 1
      ) {
        const group =
          groups[groupIndex];

        const first =
          group.sessions[0];

        const last =
          group.sessions[
            group.sessions.length - 1
          ];

        const isReturned =
          Boolean(
            group.returnPunch &&
            group.returnAt
          );

        if (isReturned) {
          returnedGroups +=
            1;
        }

        let targetEpisodeId =
          null;

        if (groupIndex === 0) {
          targetEpisodeId =
            id;

          await connection.query(
            `
              UPDATE absence_episodes

              SET
                subject_type = ?,
                subject_id = ?,
                employee_id = ?,

                absent_from = ?,

                start_source_type = ?,
                start_source_key = ?,
                start_source_record_id = ?,
                start_session_type = ?,
                start_context_type = ?,
                start_context_id = ?,
                start_context_name = ?,

                last_missed_at = ?,
                last_source_type = ?,
                last_source_key = ?,
                last_source_record_id = ?,
                last_session_type = ?,

                return_punch_at = ?,
                return_transaction_id = ?,

                duration_seconds =
                  CASE
                    WHEN ? IS NOT NULL
                    THEN
                      GREATEST(
                        0,
                        TIMESTAMPDIFF(
                          SECOND,
                          ?,
                          ?
                        )
                      )
                    ELSE NULL
                  END,

                missed_session_count = ?,

                status = ?

              WHERE
                id = ?
            `,
            [
              first.subject_type,
              first.subject_id,
              first.employee_id,

              first.window_end,

              first.source_type,
              first.source_key,
              first.source_record_id,
              first.session_type,
              first.context_type,
              first.context_id,
              first.context_name,

              last.window_end,
              last.source_type,
              last.source_key,
              last.source_record_id,
              last.session_type,

              group.returnAt,
              group.returnPunch
                ?.id ||
                null,

              group.returnAt,
              first.window_end,
              group.returnAt,

              group.sessions.length,

              isReturned
                ? "RETURNED"
                : "OPEN",

              id,
            ]
          );
        } else {
          const [
            insertResult,
          ] =
            await connection.query(
              `
                INSERT INTO absence_episodes
                (
                  subject_type,
                  subject_id,
                  employee_id,

                  absent_from,

                  start_source_type,
                  start_source_key,
                  start_source_record_id,
                  start_session_type,
                  start_context_type,
                  start_context_id,
                  start_context_name,

                  last_missed_at,
                  last_source_type,
                  last_source_key,
                  last_source_record_id,
                  last_session_type,

                  return_punch_at,
                  return_transaction_id,
                  duration_seconds,

                  missed_session_count,
                  status
                )

                VALUES
                (
                  ?, ?, ?,
                  ?,
                  ?, ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, ?, ?,
                  ?, ?,

                  CASE
                    WHEN ? IS NOT NULL
                    THEN
                      GREATEST(
                        0,
                        TIMESTAMPDIFF(
                          SECOND,
                          ?,
                          ?
                        )
                      )
                    ELSE NULL
                  END,

                  ?, ?
                )
              `,
              [
                first.subject_type,
                first.subject_id,
                first.employee_id,

                first.window_end,

                first.source_type,
                first.source_key,
                first.source_record_id,
                first.session_type,
                first.context_type,
                first.context_id,
                first.context_name,

                last.window_end,
                last.source_type,
                last.source_key,
                last.source_record_id,
                last.session_type,

                group.returnAt,
                group.returnPunch
                  ?.id ||
                  null,

                group.returnAt,
                first.window_end,
                group.returnAt,

                group.sessions.length,

                isReturned
                  ? "RETURNED"
                  : "OPEN",
              ]
            );

          targetEpisodeId =
            Number(
              insertResult.insertId
            );
        }

        episodeIds.push(
          targetEpisodeId
        );

        if (!isReturned) {
          latestOpenEpisodeId =
            targetEpisodeId;
        }

        const sessionIds =
          group.sessions
            .map(
              (session) =>
                positiveInt(
                  session.id
                )
            )
            .filter(Boolean);

        if (sessionIds.length) {
          const placeholders =
            sessionIds
              .map(
                () => "?"
              )
              .join(",");

          await connection.query(
            `
              UPDATE absence_episode_sessions

              SET
                episode_id = ?

              WHERE
                id IN
                (${placeholders})
            `,
            [
              targetEpisodeId,
              ...sessionIds,
            ]
          );
        }
      }

      const currentEpisode =
        latestOpenEpisodeId
          ? await getEpisodeById(
              latestOpenEpisodeId,
              connection
            )
          : null;

      return {
        action:
          returnedGroups > 0
            ? "RETURNED"
            : "STILL_OPEN",

        episode:
          currentEpisode,

        rebuilt:
          groups.length > 1,

        rebuilt_episode_ids:
          episodeIds,

        returned_groups:
          returnedGroups,
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| RECONCILE ONE EMPLOYEE AFTER BIOMETRIC SYNC
|--------------------------------------------------------------------------
|
| OPEN episode?
|
|   YES
|    ↓
| rebuild the OPEN timeline from its missed sessions + all currently synced
| biometric punches
|    ↓
| delayed punches split the timeline correctly instead of leaving later
| missed sessions attached to the wrong returned period
|--------------------------------------------------------------------------
*/

async function reconcileOpenEpisodeForEmployee(
  employeeId
) {
  const code =
    clean(
      employeeId
    );

  if (!code) {
    return {
      action:
        "NO_EMPLOYEE_ID",

      episode:
        null,
    };
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id

        FROM absence_episodes

        WHERE
          status = 'OPEN'

          AND employee_id = ?

        ORDER BY
          absent_from ASC,
          id ASC

        LIMIT 1
      `,
      [
        code,
      ]
    );

  if (!rows[0]?.id) {
    return {
      action:
        "NO_OPEN_EPISODE",

      episode:
        null,
    };
  }

  return rebuildOpenEpisodeTimeline(
    rows[0].id
  );
}


/*
|--------------------------------------------------------------------------
| CURRENT OPEN ABSENCES
|--------------------------------------------------------------------------
|
| Duration is calculated dynamically.
|
| We do NOT update duration in DB every minute.
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| REPAIR OPEN ABSENCE FOR ACTIVE REPATRIATES
|--------------------------------------------------------------------------
|
| Older records may have been repatriated before the direct createDrop closure
| existed. Repair them lazily so Dashboard/Report become correct immediately,
| without requiring a schema migration or a one-off manual SQL command.
|
| Administrative closure marker:
|   status = RETURNED
|   return_punch_at = active repatriate datetime
|   return_transaction_id = NULL
|
|--------------------------------------------------------------------------
*/

async function closeOpenAbsencesForActiveRepatriates() {
  await pool.query(
    `
      UPDATE absence_episodes ae

      JOIN
      (
        SELECT
          trainee_id,
          MAX(drop_datetime) AS drop_datetime

        FROM trainee_training_drop

        WHERE drop_status = 'ACTIVE'

        GROUP BY trainee_id
      ) active_drop
        ON active_drop.trainee_id = ae.subject_id

      SET
        ae.status = 'RETURNED',
        ae.return_punch_at = active_drop.drop_datetime,
        ae.return_transaction_id = NULL,
        ae.duration_seconds =
          GREATEST(
            0,
            TIMESTAMPDIFF(
              SECOND,
              ae.absent_from,
              active_drop.drop_datetime
            )
          )

      WHERE ae.subject_type = 'TRAINEE'
        AND ae.status = 'OPEN'
    `
  );
}


/*
|--------------------------------------------------------------------------
| CLOSE OPEN ABSENCE WHEN AN OFFICIAL STATUS INTERRUPTS CONTINUITY
|--------------------------------------------------------------------------
|
| Final business rule:
|
| - Approved Leave / Home Rest interrupts Continuous Absence.
| - Approved OSD / Short Permission interrupts Continuous Absence.
| - Active Repatriate interrupts Continuous Absence (handled above).
| - Long Weekend interrupts Continuous Absence ONLY after a real accepted
|   biometric departure punch.
| - Merely assigning a trainee to Long Weekend does NOT interrupt absence.
|
| The existing schema supports OPEN / RETURNED only. Administrative closures
| therefore use RETURNED with return_transaction_id = NULL. Genuine Long
| Weekend biometric departure uses the real transaction id when the punch is
| at/after the episode start.
|
| The source missed sessions remain attached to the closed episode so the same
| historical absence cannot reopen later. A later missed required session can
| start a NEW Continuous Absence episode normally.
|--------------------------------------------------------------------------
*/

async function closeOpenAbsencesForSanctionedInterruptions() {
  const ptsNowSql =
    "DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 HOUR)";

  const [candidates] =
    await pool.query(
      `
        SELECT
          candidate.episode_id,
          candidate.closure_at,
          candidate.transaction_id,
          candidate.source_type

        FROM
        (
          SELECT
            ae.id AS episode_id,

            CASE
              WHEN l.start_datetime < ae.absent_from
              THEN ae.absent_from
              ELSE l.start_datetime
            END AS closure_at,

            NULL AS transaction_id,
            'LEAVE' AS source_type

          FROM absence_episodes ae

          JOIN trainee_leaves l
            ON ae.subject_type = 'TRAINEE'
           AND l.trainee_id = ae.subject_id

          WHERE ae.status = 'OPEN'
            AND l.workflow_status IN ('APPROVED', 'COMPLETED')
            AND COALESCE(l.biometric_exempt, 0) = 1
            AND l.start_datetime <= ${ptsNowSql}
            AND l.end_datetime >= ae.absent_from

          UNION ALL

          SELECT
            ae.id AS episode_id,

            CASE
              WHEN l.start_datetime < ae.absent_from
              THEN ae.absent_from
              ELSE l.start_datetime
            END AS closure_at,

            NULL AS transaction_id,
            'LEAVE' AS source_type

          FROM absence_episodes ae

          JOIN staff_leaves l
            ON ae.subject_type = 'STAFF'
           AND l.staff_id = ae.subject_id

          WHERE ae.status = 'OPEN'
            AND l.workflow_status IN ('APPROVED', 'COMPLETED')
            AND COALESCE(l.biometric_exempt, 0) = 1
            AND l.start_datetime <= ${ptsNowSql}
            AND l.end_datetime >= ae.absent_from

          UNION ALL

          SELECT
            ae.id AS episode_id,

            CASE
              WHEN o.start_datetime < ae.absent_from
              THEN ae.absent_from
              ELSE o.start_datetime
            END AS closure_at,

            NULL AS transaction_id,
            'OSD' AS source_type

          FROM absence_episodes ae

          JOIN trainee_osd o
            ON ae.subject_type = 'TRAINEE'
           AND o.trainee_id = ae.subject_id

          WHERE ae.status = 'OPEN'
            AND o.workflow_status IN ('APPROVED', 'COMPLETED')
            AND o.record_type IN ('OSD', 'SHORT_PERMISSION')
            AND COALESCE(o.biometric_exempt, 0) = 1
            AND o.start_datetime <= ${ptsNowSql}
            AND o.end_datetime >= ae.absent_from

          UNION ALL

          SELECT
            ae.id AS episode_id,

            CASE
              WHEN o.start_datetime < ae.absent_from
              THEN ae.absent_from
              ELSE o.start_datetime
            END AS closure_at,

            NULL AS transaction_id,
            'OSD' AS source_type

          FROM absence_episodes ae

          JOIN staff_osd o
            ON ae.subject_type = 'STAFF'
           AND o.staff_id = ae.subject_id

          WHERE ae.status = 'OPEN'
            AND o.workflow_status IN ('APPROVED', 'COMPLETED')
            AND o.record_type IN ('OSD', 'SHORT_PERMISSION')
            AND COALESCE(o.biometric_exempt, 0) = 1
            AND o.start_datetime <= ${ptsNowSql}
            AND o.end_datetime >= ae.absent_from

          UNION ALL

          SELECT
            ae.id AS episode_id,

            CASE
              WHEN o.home_rest_start < ae.absent_from
              THEN ae.absent_from
              ELSE o.home_rest_start
            END AS closure_at,

            NULL AS transaction_id,
            'HOME_REST' AS source_type

          FROM absence_episodes ae

          JOIN trainee_outdoor o
            ON ae.subject_type = 'TRAINEE'
           AND o.trainee_id = ae.subject_id

          WHERE ae.status = 'OPEN'
            AND COALESCE(o.home_rest, 0) = 1
            AND o.home_rest_start IS NOT NULL
            AND o.home_rest_end IS NOT NULL
            AND UPPER(COALESCE(o.workflow_status, 'ACTIVE')) NOT IN ('CANCELLED', 'REJECTED')
            AND o.home_rest_start <= ${ptsNowSql}
            AND o.home_rest_end >= ae.absent_from

          UNION ALL

          SELECT
            ae.id AS episode_id,

            CASE
              WHEN o.home_rest_start < ae.absent_from
              THEN ae.absent_from
              ELSE o.home_rest_start
            END AS closure_at,

            NULL AS transaction_id,
            'HOME_REST' AS source_type

          FROM absence_episodes ae

          JOIN staff_outdoor o
            ON ae.subject_type = 'STAFF'
           AND o.staff_id = ae.subject_id

          WHERE ae.status = 'OPEN'
            AND COALESCE(o.home_rest, 0) = 1
            AND o.home_rest_start IS NOT NULL
            AND o.home_rest_end IS NOT NULL
            AND UPPER(COALESCE(o.workflow_status, 'ACTIVE')) NOT IN ('CANCELLED', 'REJECTED')
            AND o.home_rest_start <= ${ptsNowSql}
            AND o.home_rest_end >= ae.absent_from

          UNION ALL

          /*
          | Finalized/persisted real Weekend biometric departure.
          | Leave-authorized Weekend rows have punch_time = NULL and are
          | intentionally excluded here.
          */
          SELECT
            ae.id AS episode_id,

            CASE
              WHEN wda.punch_time < ae.absent_from
              THEN ae.absent_from
              ELSE wda.punch_time
            END AS closure_at,

            CASE
              WHEN wda.punch_time >= ae.absent_from
              THEN wda.punch_transaction_id
              ELSE NULL
            END AS transaction_id,

            'LONG_WEEKEND_BIOMETRIC' AS source_type

          FROM absence_episodes ae

          JOIN weekend_departure_attendance wda
            ON ae.subject_type = 'TRAINEE'
           AND wda.trainee_id = ae.subject_id

          WHERE ae.status = 'OPEN'
            AND UPPER(COALESCE(wda.attendance_status, '')) = 'PRESENT'
            AND wda.punch_time IS NOT NULL
            AND wda.punch_time <= ${ptsNowSql}
            AND wda.window_end >= ae.absent_from
        ) candidate

        WHERE candidate.closure_at <= ${ptsNowSql}

        ORDER BY
          candidate.episode_id ASC,
          candidate.closure_at ASC,
          CASE
            WHEN candidate.transaction_id IS NOT NULL THEN 0
            ELSE 1
          END ASC
      `
    );

  if (!candidates?.length) {
    return 0;
  }

  /* Earliest valid interruption closes each OPEN episode. */
  const firstByEpisode =
    new Map();

  for (const row of candidates) {
    const episodeId =
      Number(row?.episode_id);

    if (
      !Number.isInteger(episodeId) ||
      episodeId <= 0 ||
      firstByEpisode.has(episodeId)
    ) {
      continue;
    }

    const closureAt =
      normalizeDateTime(
        row?.closure_at
      );

    if (!closureAt) {
      continue;
    }

    firstByEpisode.set(
      episodeId,
      {
        closureAt,
        transactionId:
          positiveInt(
            row?.transaction_id
          ) || null,
      }
    );
  }

  if (!firstByEpisode.size) {
    return 0;
  }

  const connection =
    await pool.getConnection();

  let closed =
    0;

  try {
    await connection.beginTransaction();

    for (const [episodeId, event] of firstByEpisode.entries()) {
      const [result] =
        await connection.query(
          `
            UPDATE absence_episodes

            SET
              status = 'RETURNED',
              return_punch_at = ?,
              return_transaction_id = ?,
              duration_seconds =
                GREATEST(
                  0,
                  TIMESTAMPDIFF(
                    SECOND,
                    absent_from,
                    ?
                  )
                )

            WHERE id = ?
              AND status = 'OPEN'
          `,
          [
            event.closureAt,
            event.transactionId,
            event.closureAt,
            episodeId,
          ]
        );

      closed +=
        Number(
          result?.affectedRows ||
          0
        );
    }

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Preserve original error.
    }

    throw error;
  } finally {
    connection.release();
  }

  return closed;
}


async function closeOpenAbsencesForLiveLongWeekendBiometric() {
  const events =
    await getLongWeekendBiometricClosureEvents();

  if (!events?.length) {
    return 0;
  }

  const traineeIds =
    [
      ...new Set(
        events
          .map(
            (event) =>
              positiveInt(
                event?.subject_id
              )
          )
          .filter(Boolean)
      ),
    ];

  if (!traineeIds.length) {
    return 0;
  }

  const placeholders =
    traineeIds.map(
      () => "?"
    ).join(",");

  const [openRows] =
    await pool.query(
      `
        SELECT
          id,
          subject_id,
          absent_from

        FROM absence_episodes

        WHERE subject_type = 'TRAINEE'
          AND status = 'OPEN'
          AND subject_id IN (${placeholders})

        ORDER BY id ASC
      `,
      traineeIds
    );

  if (!openRows?.length) {
    return 0;
  }

  const eventsByTrainee =
    new Map();

  for (const event of events) {
    const traineeId =
      positiveInt(
        event?.subject_id
      );

    const closureAt =
      normalizeDateTime(
        event?.closure_at
      );

    const coverageEnd =
      normalizeDateTime(
        event?.coverage_end
      );

    if (
      !traineeId ||
      !closureAt
    ) {
      continue;
    }

    if (
      !eventsByTrainee.has(
        traineeId
      )
    ) {
      eventsByTrainee.set(
        traineeId,
        []
      );
    }

    eventsByTrainee
      .get(traineeId)
      .push({
        closureAt,
        coverageEnd,
        transactionId:
          positiveInt(
            event?.transaction_id
          ) || null,
      });
  }

  const connection =
    await pool.getConnection();

  let closed =
    0;

  try {
    await connection.beginTransaction();

    for (const row of openRows) {
      const traineeId =
        positiveInt(
          row?.subject_id
        );

      const absentFrom =
        normalizeDateTime(
          row?.absent_from
        );

      if (
        !traineeId ||
        !absentFrom
      ) {
        continue;
      }

      const matching =
        (eventsByTrainee.get(
          traineeId
        ) || [])
          .filter(
            (event) =>
              !event.coverageEnd ||
              event.coverageEnd >=
                absentFrom
          )
          .map(
            (event) => {
              const punchAfterAbsence =
                event.closureAt >=
                absentFrom;

              return {
                closureAt:
                  punchAfterAbsence
                    ? event.closureAt
                    : absentFrom,

                transactionId:
                  punchAfterAbsence
                    ? event.transactionId
                    : null,
              };
            }
          )
          .sort(
            (a, b) =>
              a.closureAt.localeCompare(
                b.closureAt
              )
          );

      const event =
        matching[0];

      if (!event) {
        continue;
      }

      const [result] =
        await connection.query(
          `
            UPDATE absence_episodes

            SET
              status = 'RETURNED',
              return_punch_at = ?,
              return_transaction_id = ?,
              duration_seconds =
                GREATEST(
                  0,
                  TIMESTAMPDIFF(
                    SECOND,
                    absent_from,
                    ?
                  )
                )

            WHERE id = ?
              AND status = 'OPEN'
          `,
          [
            event.closureAt,
            event.transactionId,
            event.closureAt,
            Number(row.id),
          ]
        );

      closed +=
        Number(
          result?.affectedRows ||
          0
        );
    }

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Preserve original error.
    }

    throw error;
  } finally {
    connection.release();
  }

  return closed;
}


async function reconcileOpenAbsenceOperationalInterruptions() {
  /* Repatriate is terminal and keeps its existing dedicated repair. */
  await closeOpenAbsencesForActiveRepatriates();

  /* Approved Leave / OSD / Home Rest + finalized Weekend biometric. */
  await closeOpenAbsencesForSanctionedInterruptions();

  /* Current Weekend window may have a valid punch before history is persisted. */
  await closeOpenAbsencesForLiveLongWeekendBiometric();
}


async function getOpenAbsences({
  subjectType = null,
  includeOperationalProtected = false,
} = {}) {
  await reconcileOpenAbsenceOperationalInterruptions();


  const conditions = [
    "ae.status = 'OPEN'",

    /* Active Repatriate always overrides Continuous Absence. */
    `
      NOT
      (
        ae.subject_type = 'TRAINEE'
        AND EXISTS
        (
          SELECT 1
          FROM trainee_training_drop active_drop
          WHERE active_drop.trainee_id = ae.subject_id
            AND active_drop.drop_status = 'ACTIVE'
        )
      )
    `,

    /*
    | Only current Portal identities are allowed into the live absence source.
    | Old orphan episodes from permanently deleted people must not reappear on
    | Dashboard cards / pies.
    */
    `
      (
        (
          ae.subject_type = 'TRAINEE'
          AND EXISTS
          (
            SELECT 1
            FROM trainees current_trainee
            WHERE current_trainee.id = ae.subject_id
              AND current_trainee.is_deleted = 0
          )
        )

        OR

        (
          ae.subject_type = 'STAFF'
          AND EXISTS
          (
            SELECT 1
            FROM staff current_staff
            WHERE current_staff.id = ae.subject_id
              AND current_staff.is_deleted = 0
          )
        )
      )
    `,
  ];


  const params =
    [];


  if (
    subjectType
  ) {
    conditions.push(
      "ae.subject_type = ?"
    );


    params.push(
      normalizeEnum(
        subjectType,

        SUBJECT_TYPES,

        "subject_type"
      )
    );
  }


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          ae.*,

          GREATEST(
            0,

            TIMESTAMPDIFF(
              SECOND,

              ae.absent_from,

              DATE_ADD(
                    UTC_TIMESTAMP(),
                    INTERVAL 5 HOUR
                  )
            )
          )
            AS duration_seconds_current

        FROM absence_episodes ae

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          ae.absent_from ASC,

          ae.id ASC
      `,
      params
    );

  /* Internal reconciliation must still be able to see every physically OPEN
     episode so a genuine later biometric punch can close it immediately. */
  if (
    includeOperationalProtected
  ) {
    return rows;
  }

  /*
  |--------------------------------------------------------------------------
  | LIVE ACTIONABLE OPEN ABSENCE SOURCE
  |--------------------------------------------------------------------------
  |
  | An OPEN absence episode can legitimately remain in history while the same
  | person is currently under an approved operational status.  Dashboard and
  | the current OPEN Continuous Absence report must not classify that person as
  | actionable ABSENT during the sanctioned period.
  |
  | Protected current states are resolved centrally by operationalStatus:
  |   - Leave / Home Rest
  |   - OSD / Short Permission
  |   - valid Long Weekend departure
  |   - Staff Duty Rest / Custom Shift Duty Rest
  |   - Repatriate remains handled above as a terminal state
  |
  | Medical Rest is intentionally NOT protected because PTS business rules do
  | not treat Medical Rest as a biometric attendance exemption.
  |
  | Historical episode rows themselves are NOT rewritten here.  This function
  | is deliberately the canonical LIVE actionable-absence source.
  |--------------------------------------------------------------------------
  */

  const normalizedSubjectType =
    subjectType
      ? normalizeEnum(
          subjectType,
          SUBJECT_TYPES,
          "subject_type"
        )
      : null;

  const protectedKeys =
    await getCurrentOperationalProtectionKeys({
      subjectType:
        normalizedSubjectType,
    });

  if (
    !(protectedKeys instanceof Set) ||
    protectedKeys.size === 0
  ) {
    return rows;
  }

  return (rows || []).filter(
    (row) => {
      const key =
        `${String(
          row?.subject_type ||
            ""
        )
          .trim()
          .toUpperCase()}:` +
        `${Number(
          row?.subject_id
        )}`;

      return !protectedKeys.has(
        key
      );
    }
  );
}


/*
|--------------------------------------------------------------------------
| MISSED SESSIONS OF ONE EPISODE
|--------------------------------------------------------------------------
*/

async function getEpisodeSessions(
  episodeId
) {
  const id =
    positiveInt(
      episodeId
    );


  if (!id) {
    return [];
  }


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          *

        FROM absence_episode_sessions

        WHERE
          episode_id = ?

        ORDER BY
          window_end ASC,

          id ASC
      `,
      [
        id,
      ]
    );


  return rows;
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  registerMissedSession,

  getEpisodeById,

  getOpenEpisode,

  getOpenAbsences,

  getEpisodeSessions,

  findFirstBiometricPunchAfter,

  closeOpenEpisodeWithPunch,

  reconcileOpenEpisodeForEmployee,
};