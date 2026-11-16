const {
  pool,
} = require("../config/db");


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeSubjectType(
  value
) {
  const type =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    type !== "TRAINEE" &&
    type !== "STAFF"
  ) {
    return null;
  }

  return type;
}


function normalizeEmployeeId(
  value
) {
  const normalized =
    String(
      value ||
      ""
    ).trim();

  return (
    normalized ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| CONTINUOUS ABSENCE / RETURN HISTORY
|--------------------------------------------------------------------------
|
| Central source of truth:
|   absence_episodes
|   absence_episode_sessions
|
| Important:
| - No duplicate profile storage.
| - OPEN duration continues dynamically.
| - RETURNED duration remains frozen.
| - Employee ID is also used so previous trainee/course identity records
|   remain visible in the same person's profile.
|
|--------------------------------------------------------------------------
*/

async function getProfileContinuousAbsenceHistory({
  subjectType,
  subjectId,
  employeeId,
}) {
  const type =
    normalizeSubjectType(
      subjectType
    );

  if (!type) {
    throw new Error(
      "Invalid profile subject type."
    );
  }

  const normalizedSubjectId =
    Number(
      subjectId
    );

  if (
    !Number.isInteger(
      normalizedSubjectId
    ) ||
    normalizedSubjectId <=
      0
  ) {
    throw new Error(
      "Invalid profile subject ID."
    );
  }

  const normalizedEmployeeId =
    normalizeEmployeeId(
      employeeId
    );


  /*
  |--------------------------------------------------------------------------
  | EPISODES
  |--------------------------------------------------------------------------
  */

  const [
    episodeRows,
  ] =
    await pool.query(
      `
        SELECT
          ae.id,

          ae.subject_type,
          ae.subject_id,
          ae.employee_id,

          ae.absent_from,

          ae.start_source_type,
          ae.start_source_key,
          ae.start_source_record_id,

          ae.start_session_type,

          ae.start_context_type,
          ae.start_context_id,
          ae.start_context_name,

          ae.last_missed_at,

          ae.last_source_type,
          ae.last_source_key,
          ae.last_source_record_id,

          ae.last_session_type,

          ae.return_punch_at,
          ae.return_transaction_id,

          ae.duration_seconds,

          ae.missed_session_count,

          ae.status,

          CASE
            WHEN ae.status = 'OPEN'
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
          END AS period_seconds,

          ae.created_at,
          ae.updated_at

        FROM absence_episodes ae

        WHERE
          ae.subject_type =
            :subjectType

          AND ae.status IN
          (
            'OPEN',
            'RETURNED'
          )

          AND NOT
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

          AND NOT
          (
            ae.status = 'RETURNED'
            AND ae.return_transaction_id IS NULL
          )

          AND
          (
            ae.subject_id =
              :subjectId

            OR
            (
              :employeeId IS NOT NULL

              AND ae.employee_id =
                :employeeId
            )
          )

        ORDER BY
          ae.absent_from DESC,
          ae.id DESC
      `,
      {
        subjectType:
          type,

        subjectId:
          normalizedSubjectId,

        employeeId:
          normalizedEmployeeId,
      }
    );


  /*
  |--------------------------------------------------------------------------
  | MISSED SESSION HISTORY
  |--------------------------------------------------------------------------
  */

  const [
    sessionRows,
  ] =
    await pool.query(
      `
        SELECT
          aes.id,

          aes.episode_id,

          aes.subject_type,
          aes.subject_id,
          aes.employee_id,

          aes.source_type,
          aes.source_key,
          aes.source_record_id,

          aes.attendance_date,

          aes.session_type,

          aes.context_type,
          aes.context_id,
          aes.context_name,

          aes.window_start,
          aes.window_end,

          aes.created_at

        FROM absence_episode_sessions aes

        JOIN absence_episodes ae
          ON ae.id = aes.episode_id
          AND ae.status IN
          (
            'OPEN',
            'RETURNED'
          )
          AND NOT
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
          AND NOT
          (
            ae.status = 'RETURNED'
            AND ae.return_transaction_id IS NULL
          )

        WHERE
          aes.subject_type =
            :subjectType

          AND
          (
            aes.subject_id =
              :subjectId

            OR
            (
              :employeeId IS NOT NULL

              AND aes.employee_id =
                :employeeId
            )
          )

        ORDER BY
          aes.attendance_date DESC,
          aes.window_end DESC,
          aes.id DESC
      `,
      {
        subjectType:
          type,

        subjectId:
          normalizedSubjectId,

        employeeId:
          normalizedEmployeeId,
      }
    );


  /*
  |--------------------------------------------------------------------------
  | GROUP MISSED SESSIONS BY EPISODE
  |--------------------------------------------------------------------------
  */

  const sessionsByEpisode =
    new Map();

  for (
    const session
    of sessionRows
  ) {
    const episodeId =
      Number(
        session.episode_id
      );

    if (
      !sessionsByEpisode.has(
        episodeId
      )
    ) {
      sessionsByEpisode.set(
        episodeId,
        []
      );
    }

    sessionsByEpisode
      .get(
        episodeId
      )
      .push(
        session
      );
  }


  const records =
    episodeRows.map(
      (
        episode
      ) => ({
        ...episode,

        period_seconds:
          Number(
            episode.period_seconds ||
            0
          ),

        duration_seconds:
          episode.duration_seconds ===
            null ||
          episode.duration_seconds ===
            undefined
            ? null
            : Number(
                episode.duration_seconds
              ),

        missed_session_count:
          Number(
            episode.missed_session_count ||
            0
          ),

        sessions:
          sessionsByEpisode.get(
            Number(
              episode.id
            )
          ) ||
          [],
      })
    );


  /*
  |--------------------------------------------------------------------------
  | SUMMARY
  |--------------------------------------------------------------------------
  */

  let open =
    0;

  let returned =
    0;

  let missedSessions =
    0;

  let totalPeriodSeconds =
    0;

  for (
    const episode
    of records
  ) {
    if (
      episode.status ===
      "OPEN"
    ) {
      open +=
        1;
    }

    if (
      episode.status ===
      "RETURNED"
    ) {
      returned +=
        1;
    }

    missedSessions +=
      Number(
        episode.missed_session_count ||
        0
      );

    totalPeriodSeconds +=
      Number(
        episode.period_seconds ||
        0
      );
  }


  return {
    summary: {
      total_episodes:
        records.length,

      open,

      returned,

      missed_sessions:
        missedSessions,

      total_period_seconds:
        totalPeriodSeconds,
    },

    records,
  };
}


module.exports = {
  getProfileContinuousAbsenceHistory,
};