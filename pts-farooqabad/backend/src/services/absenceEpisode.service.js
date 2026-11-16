const { pool } = require("../config/db");

const {
  registerMissedSession,
  getOpenAbsences,
  reconcileOpenEpisodeForEmployee,
} = require(
  "../models/absenceEpisode.model"
);

const {
  calculateDutyRosterAttendance,
} = require(
  "../models/dutyRoster.model"
);

const EMPLOYEE_CONCURRENCY = 8;


/*
|--------------------------------------------------------------------------
| HELPERS
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


function dateOnlyValue(value) {
  const match =
    clean(value).match(
      /^(\d{4}-\d{2}-\d{2})/
    );

  return match
    ? match[1]
    : null;
}


function createSummary() {
  return {
    candidates: 0,

    opened: 0,

    continued: 0,

    already_registered: 0,

    failed: 0,

    failures: [],
  };
}


function recordAction(
  summary,
  result
) {
  switch (
    result?.action
  ) {
    case "OPENED":
      summary.opened += 1;
      break;

    case "CONTINUED":
      summary.continued += 1;
      break;

    case "ALREADY_REGISTERED":
      summary.already_registered += 1;
      break;

    default:
      break;
  }
}


/*
|--------------------------------------------------------------------------
| SMALL CONCURRENCY POOL
|--------------------------------------------------------------------------
*/

async function mapWithConcurrency(
  items,
  limit,
  worker
) {
  const rows =
    Array.isArray(items)
      ? items
      : [];

  if (!rows.length) {
    return;
  }

  let index = 0;

  const workerCount =
    Math.min(
      Math.max(
        Number(limit) || 1,
        1
      ),

      rows.length
    );

  const runners =
    Array.from(
      {
        length:
          workerCount,
      },

      async () => {
        while (true) {
          const currentIndex =
            index;

          index += 1;

          if (
            currentIndex >=
            rows.length
          ) {
            return;
          }

          await worker(
            rows[currentIndex],
            currentIndex
          );
        }
      }
    );

  await Promise.all(
    runners
  );
}


/*
|--------------------------------------------------------------------------
| GROUP EVENTS BY EMPLOYEE
|--------------------------------------------------------------------------
|
| Same person's missed sessions are always processed chronologically.
|
|--------------------------------------------------------------------------
*/

function groupEventsByEmployee(
  events
) {
  const map =
    new Map();

  for (
    const event
    of Array.isArray(events)
      ? events
      : []
  ) {
    const employeeId =
      clean(
        event?.employee_id
      );

    if (!employeeId) {
      continue;
    }

    if (
      !map.has(
        employeeId
      )
    ) {
      map.set(
        employeeId,
        []
      );
    }

    map
      .get(
        employeeId
      )
      .push(
        event
      );
  }

  for (
    const rows
    of map.values()
  ) {
    rows.sort(
      (
        a,
        b
      ) => {
        const aTime =
          clean(
            a
              ?.required_window_end ||
            a
              ?.window_end
          );

        const bTime =
          clean(
            b
              ?.required_window_end ||
            b
              ?.window_end
          );

        if (
          aTime !==
          bTime
        ) {
          return aTime.localeCompare(
            bTime
          );
        }

        return (
          Number(
            a?.id ||
            a?.assignment_id ||
            0
          ) -
          Number(
            b?.id ||
            b?.assignment_id ||
            0
          )
        );
      }
    );
  }

  return [
    ...map.entries(),
  ].map(
    (
      [
        employeeId,
        rows,
      ]
    ) => ({
      employeeId,

      rows,
    })
  );
}


/*
|--------------------------------------------------------------------------
| DUTY ROSTER MISSED ARRIVAL ROWS
|--------------------------------------------------------------------------
|
| Continuous Absence uses the Duty Roster ARRIVAL window only.
| Missing checkout does not open another absence episode.
|
| Both TRAINEE and STAFF are supported exactly as Duty Roster supports them.
|--------------------------------------------------------------------------
*/

function getMissedDutyRosterRows(
  dutyResult,
  attendanceDate
) {
  const date =
    dateOnlyValue(
      attendanceDate
    );

  return (
    Array.isArray(
      dutyResult?.rows
    )
      ? dutyResult.rows
      : []
  )
    .filter(
      (row) =>
        [
          "TRAINEE",
          "STAFF",
        ].includes(
          clean(
            row?.subject_type
          ).toUpperCase()
        ) &&

        clean(
          row?.attendance_status
        ).toUpperCase() ===
          "ABSENT" &&

        row?.start_window_to
    )
    .map(
      (row) => ({
        ...row,

        attendance_date:
          date,

        required_window_end:
          row.start_window_to,
      })
    );
}


function dutyRosterArrivalSourceKey(
  row,
  attendanceDate
) {
  const assignmentId =
    positiveInt(
      row?.assignment_id
    );

  const date =
    dateOnlyValue(
      attendanceDate
    );

  if (
    !assignmentId ||
    !date
  ) {
    return null;
  }

  return (
    `DUTY_ROSTER:${assignmentId}:` +
    `${date}:ARRIVAL`
  );
}


/*
|--------------------------------------------------------------------------
| SOURCE-OF-TRUTH RECONCILIATION
|--------------------------------------------------------------------------
|
| Why this exists:
|
| 1. A required attendance window closes with no currently synced punch.
| 2. Attendance becomes ABSENT and Continuous Absence opens.
| 3. Later, a delayed ZKBioTime transaction arrives INSIDE that old window,
|    or an approved Leave / OSD / Home Rest / Training Drop is entered.
| 4. Attendance is recalculated to PRESENT / EXEMPT.
|
| Without reconciliation, the old absence_episode_session would remain and an
| incorrect OPEN absence could continue forever because that correcting punch
| may be BEFORE absent_from.
|
| Current attendance/duty-roster calculation is therefore authoritative for
| whether a CURRENT-DATE missed session still exists.
|
| Historical reports themselves never call this function; mutation remains
| limited to the current-date scheduler flow.
|--------------------------------------------------------------------------
*/

async function reconcileContinuousAbsenceSourcesForDate({
  attendanceDate,
  timetableRows = [],
  dutyResult = null,
}) {
  const date =
    dateOnlyValue(
      attendanceDate
    );

  if (!date) {
    const error =
      new Error(
        "Valid attendanceDate is required."
      );

    error.statusCode =
      400;

    throw error;
  }


  const validSourceKeys =
    new Set();


  for (
    const row
    of Array.isArray(timetableRows)
      ? timetableRows
      : []
  ) {
    const id =
      positiveInt(
        row?.id
      );

    if (id) {
      validSourceKeys.add(
        `ATTENDANCE:${id}`
      );
    }
  }


  const dutyRows =
    getMissedDutyRosterRows(
      dutyResult,
      date
    );


  for (
    const row
    of dutyRows
  ) {
    const key =
      dutyRosterArrivalSourceKey(
        row,
        date
      );

    if (key) {
      validSourceKeys.add(
        key
      );
    }
  }


  const [
    currentSessionRows,
  ] =
    await pool.query(
      `
        SELECT
          aes.id,
          aes.episode_id,
          aes.source_type,
          aes.source_key

        FROM absence_episode_sessions aes

        JOIN absence_episodes ae
          ON ae.id =
             aes.episode_id

        WHERE
          aes.attendance_date = ?

          AND
          aes.source_type IN
          (
            'ATTENDANCE',
            'DUTY_ROSTER'
          )

        ORDER BY
          aes.id ASC
      `,
      [
        date,
      ]
    );


  const invalidSessions =
    (
      Array.isArray(currentSessionRows)
        ? currentSessionRows
        : []
    ).filter(
      (row) =>
        !validSourceKeys.has(
          clean(
            row?.source_key
          )
        )
    );


  const summary = {
    checked:
      Array.isArray(currentSessionRows)
        ? currentSessionRows.length
        : 0,

    valid:
      Math.max(
        0,
        (
          Array.isArray(currentSessionRows)
            ? currentSessionRows.length
            : 0
        ) -
        invalidSessions.length
      ),

    removed_sessions:
      0,

    repaired_episodes:
      0,

    deleted_episodes:
      0,
  };


  if (!invalidSessions.length) {
    return summary;
  }


  const affectedEpisodeIds =
    [
      ...new Set(
        invalidSessions
          .map(
            (row) =>
              positiveInt(
                row?.episode_id
              )
          )
          .filter(Boolean)
      ),
    ];


  const connection =
    await pool.getConnection();


  try {
    await connection.beginTransaction();


    const sessionIds =
      invalidSessions
        .map(
          (row) =>
            positiveInt(
              row?.id
            )
        )
        .filter(Boolean);


    const DELETE_CHUNK_SIZE =
      300;


    for (
      let index = 0;
      index < sessionIds.length;
      index += DELETE_CHUNK_SIZE
    ) {
      const chunk =
        sessionIds.slice(
          index,
          index + DELETE_CHUNK_SIZE
        );

      if (!chunk.length) {
        continue;
      }

      const placeholders =
        chunk
          .map(
            () => "?"
          )
          .join(",");

      const [
        deleteResult,
      ] =
        await connection.query(
          `
            DELETE FROM absence_episode_sessions

            WHERE
              id IN
              (${placeholders})
          `,
          chunk
        );

      summary.removed_sessions +=
        Number(
          deleteResult?.affectedRows ||
          0
        );
    }


    for (
      const episodeId
      of affectedEpisodeIds
    ) {
      const [
        episodeRows,
      ] =
        await connection.query(
          `
            SELECT
              id,
              status,
              return_punch_at

            FROM absence_episodes

            WHERE
              id = ?

            LIMIT 1

            FOR UPDATE
          `,
          [
            episodeId,
          ]
        );


      const episode =
        episodeRows[0] ||
        null;


      if (!episode) {
        continue;
      }


      const [
        remainingSessions,
      ] =
        await connection.query(
          `
            SELECT
              id,
              subject_type,
              subject_id,
              employee_id,
              source_type,
              source_key,
              source_record_id,
              session_type,
              context_type,
              context_id,
              context_name,
              window_end

            FROM absence_episode_sessions

            WHERE
              episode_id = ?

            ORDER BY
              window_end ASC,
              id ASC
          `,
          [
            episodeId,
          ]
        );


      if (!remainingSessions.length) {
        const [
          deleteEpisodeResult,
        ] =
          await connection.query(
            `
              DELETE FROM absence_episodes

              WHERE
                id = ?
            `,
            [
              episodeId,
            ]
          );

        summary.deleted_episodes +=
          Number(
            deleteEpisodeResult?.affectedRows ||
            0
          );

        continue;
      }


      const first =
        remainingSessions[0];

      const last =
        remainingSessions[
          remainingSessions.length - 1
        ];


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

            missed_session_count = ?,

            duration_seconds =
              CASE
                WHEN
                  status = 'RETURNED'
                  AND return_punch_at IS NOT NULL
                THEN
                  GREATEST(
                    0,
                    TIMESTAMPDIFF(
                      SECOND,
                      ?,
                      return_punch_at
                    )
                  )
                ELSE
                  NULL
              END

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

          remainingSessions.length,

          first.window_end,

          episodeId,
        ]
      );


      summary.repaired_episodes +=
        1;
    }


    await connection.commit();


    return summary;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    connection.release();
  }
}


/*
|--------------------------------------------------------------------------
| NORMAL TIMETABLE ABSENT ROWS
|--------------------------------------------------------------------------
|
| Only sessions whose required punch window has already finished are used.
|
| Example:
|
| Morning:
| 07:00 - 09:00
|
| No valid punch by 09:00
|
| required_window_end = 09:00
|
|--------------------------------------------------------------------------
*/

async function getMissedTimetableRows(
  attendanceDate
) {
  const date =
    dateOnlyValue(
      attendanceDate
    );

  if (!date) {
    const error =
      new Error(
        "Valid attendanceDate is required."
      );

    error.statusCode =
      400;

    throw error;
  }


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          ar.id,

          ar.attendance_date,

          ar.subject_type,

          ar.subject_id,

          ar.employee_id,

          ar.session_type,

          ar.timetable_id,

          ar.timetable_name,

          ar.window_start,

          ar.window_end,

          ar.early_window_start,

          ar.late_window_end,

          COALESCE(
            ar.late_window_end,
            ar.window_end
          )
            AS required_window_end

        FROM attendance_records ar

        WHERE
          ar.attendance_date = ?

          AND
          ar.attendance_status =
            'ABSENT'

          AND
          COALESCE(
            ar.late_window_end,
            ar.window_end
          )
          IS NOT NULL

          AND
          COALESCE(
            ar.late_window_end,
            ar.window_end
          )
          <= DATE_ADD(
            UTC_TIMESTAMP(),
            INTERVAL 5 HOUR
          )

        ORDER BY
          required_window_end ASC,

          ar.id ASC
      `,
      [
        date,
      ]
    );


  return Array.isArray(
    rows
  )
    ? rows
    : [];
}


/*
|--------------------------------------------------------------------------
| PROCESS NORMAL TIMETABLE ABSENCES
|--------------------------------------------------------------------------
*/

async function syncTimetableAbsencesForDate(
  attendanceDate,
  preloadedRows = null
) {
  const date =
    dateOnlyValue(
      attendanceDate
    );

  if (!date) {
    const error =
      new Error(
        "Valid attendanceDate is required."
      );

    error.statusCode =
      400;

    throw error;
  }


  const rows =
    Array.isArray(
      preloadedRows
    )
      ? preloadedRows
      : await getMissedTimetableRows(
          date
        );


  const summary =
    createSummary();

  summary.candidates =
    rows.length;


  const employeeGroups =
    groupEventsByEmployee(
      rows
    );


  await mapWithConcurrency(
    employeeGroups,

    EMPLOYEE_CONCURRENCY,

    async ({
      employeeId,
      rows:
        employeeRows,
    }) => {
      for (
        const row
        of employeeRows
      ) {
        try {
          const result =
            await registerMissedSession({
              subjectType:
                row.subject_type,

              subjectId:
                row.subject_id,

              employeeId,

              sourceType:
                "ATTENDANCE",

              sourceKey:
                `ATTENDANCE:${row.id}`,

              sourceRecordId:
                row.id,

              attendanceDate:
                row.attendance_date,

              sessionType:
                row.session_type,

              contextType:
                "TIMETABLE",

              contextId:
                row.timetable_id,

              contextName:
                row.timetable_name,

              windowStart:
                row.early_window_start ||
                row.window_start,

              windowEnd:
                row.required_window_end ||
                row.window_end,
            });


          recordAction(
            summary,
            result
          );
        } catch (
          error
        ) {
          summary.failed +=
            1;


          summary.failures.push({
            source_type:
              "ATTENDANCE",

            source_record_id:
              row.id,

            employee_id:
              employeeId,

            error:
              error?.message ||
              String(error),
          });
        }
      }
    }
  );


  return summary;
}


/*
|--------------------------------------------------------------------------
| PROCESS DUTY ROSTER ABSENCES
|--------------------------------------------------------------------------
|
| Duty Roster arrival window uses:
|
| start_window_from
| start_window_to
|
| Missing the arrival window opens / continues the same Continuous Absence.
|
| Missing checkout is NOT treated as a new absence episode.
|
|--------------------------------------------------------------------------
*/

async function syncDutyRosterAbsencesForDate(
  attendanceDate,
  preloadedDutyResult = null
) {
  const date =
    dateOnlyValue(
      attendanceDate
    );

  if (!date) {
    const error =
      new Error(
        "Valid attendanceDate is required."
      );

    error.statusCode =
      400;

    throw error;
  }


  const dutyResult =
    preloadedDutyResult &&
    Array.isArray(
      preloadedDutyResult?.rows
    )
      ? preloadedDutyResult
      : await calculateDutyRosterAttendance(
          date
        );


  const absentRows =
    getMissedDutyRosterRows(
      dutyResult,
      date
    );


  const summary =
    createSummary();

  summary.candidates =
    absentRows.length;


  const employeeGroups =
    groupEventsByEmployee(
      absentRows
    );


  await mapWithConcurrency(
    employeeGroups,

    EMPLOYEE_CONCURRENCY,

    async ({
      employeeId,
      rows:
        employeeRows,
    }) => {
      for (
        const row
        of employeeRows
      ) {
        try {
          const assignmentId =
            positiveInt(
              row.assignment_id
            );


          const sourceKey =
            dutyRosterArrivalSourceKey(
              row,
              date
            );


          if (
            !assignmentId ||
            !sourceKey
          ) {
            throw Object.assign(
              new Error(
                "Duty Roster absence row has an invalid assignment_id."
              ),
              {
                statusCode:
                  409,
              }
            );
          }


          const result =
            await registerMissedSession({
              subjectType:
                clean(
                  row.subject_type
                ).toUpperCase(),

              subjectId:
                row.subject_id,

              employeeId,

              sourceType:
                "DUTY_ROSTER",

              sourceKey,

              sourceRecordId:
                assignmentId,

              attendanceDate:
                date,

              sessionType:
                `SHIFT_${clean(
                  row.shift_key ||
                  row.shift_name ||
                  row.shift_id
                ).toUpperCase()}`,

              contextType:
                "DUTY_SHIFT",

              contextId:
                row.shift_id,

              contextName:
                row.shift_name ||
                row.roster_title ||
                "Duty Roster Shift",

              windowStart:
                row.start_window_from,

              windowEnd:
                row.start_window_to,
            });


          recordAction(
            summary,
            result
          );
        } catch (
          error
        ) {
          summary.failed +=
            1;


          summary.failures.push({
            source_type:
              "DUTY_ROSTER",

            assignment_id:
              row.assignment_id,

            employee_id:
              employeeId,

            error:
              error?.message ||
              String(error),
          });
        }
      }
    }
  );


  return summary;
}


/*
|--------------------------------------------------------------------------
| CLOSE ALL OPEN ABSENCES THAT HAVE A LATER PUNCH
|--------------------------------------------------------------------------
|
| Important:
|
| This checks ALL currently OPEN episodes, not only people who were marked
| absent today.
|
| Example:
|
| Yesterday:
| absence OPEN
|
| Today 10:30 AM:
| biometric punch
|
| → yesterday's open absence is closed at today's exact punch time.
|
|--------------------------------------------------------------------------
*/

async function reconcileAllOpenAbsenceReturns() {
  const openRows =
    await getOpenAbsences({
      includeOperationalProtected:
        true,
    });


  const employeeIds = [
    ...new Set(
      (
        Array.isArray(
          openRows
        )
          ? openRows
          : []
      )
        .map(
          (row) =>
            clean(
              row?.employee_id
            )
        )
        .filter(
          Boolean
        )
    ),
  ];


  const summary = {
    checked:
      employeeIds.length,

    returned: 0,

    still_open: 0,

    no_open_episode: 0,

    failed: 0,

    failures: [],
  };


  await mapWithConcurrency(
    employeeIds,

    EMPLOYEE_CONCURRENCY,

    async (
      employeeId
    ) => {
      try {
        const result =
          await reconcileOpenEpisodeForEmployee(
            employeeId
          );


        switch (
          result?.action
        ) {
          case "RETURNED":

          case "ALREADY_RETURNED":
            summary.returned +=
              1;

            break;


          case "STILL_OPEN":
            summary.still_open +=
              1;

            break;


          case "NO_OPEN_EPISODE":

          case "NO_EMPLOYEE_ID":
            summary.no_open_episode +=
              1;

            break;


          default:
            break;
        }
      } catch (
        error
      ) {
        summary.failed +=
          1;


        summary.failures.push({
          employee_id:
            employeeId,

          error:
            error?.message ||
            String(error),
        });
      }
    }
  );


  return summary;
}


/*
|--------------------------------------------------------------------------
| COMPLETE CONTINUOUS ABSENCE REFRESH
|--------------------------------------------------------------------------
|
| Order matters:
|
| 1. Reconcile source rows that were corrected to PRESENT / EXEMPT
| 2. Normal Timetable missed sessions
| 3. Duty Roster missed arrival windows (Trainee / Staff)
| 4. Any later biometric Return Punch
|
|--------------------------------------------------------------------------
*/

async function syncContinuousAbsenceForDate(
  attendanceDate
) {
  const date =
    dateOnlyValue(
      attendanceDate
    );

  if (!date) {
    const error =
      new Error(
        "Valid attendanceDate is required."
      );

    error.statusCode =
      400;

    throw error;
  }


  const startedAt =
    Date.now();


  /*
  |--------------------------------------------------------------------------
  | LOAD CURRENT SOURCE STATE ONCE
  |--------------------------------------------------------------------------
  |
  | The same attendance rows / Duty Roster calculation are reused for:
  | - correcting stale continuous-absence source sessions
  | - registering current missed sessions
  |
  | This avoids duplicate DB/API work inside one scheduler cycle.
  |--------------------------------------------------------------------------
  */

  const [
    timetableRows,
    dutyResult,
  ] =
    await Promise.all([
      getMissedTimetableRows(
        date
      ),

      calculateDutyRosterAttendance(
        date
      ),
    ]);


  const sourceReconciliation =
    await reconcileContinuousAbsenceSourcesForDate({
      attendanceDate:
        date,

      timetableRows,

      dutyResult,
    });


  const timetable =
    await syncTimetableAbsencesForDate(
      date,
      timetableRows
    );


  const dutyRoster =
    await syncDutyRosterAbsencesForDate(
      date,
      dutyResult
    );


  const returns =
    await reconcileAllOpenAbsenceReturns();


  return {
    attendance_date:
      date,

    source_reconciliation:
      sourceReconciliation,

    timetable,

    duty_roster:
      dutyRoster,

    returns,

    failed:
      Number(
        timetable.failed ||
        0
      ) +

      Number(
        dutyRoster.failed ||
        0
      ) +

      Number(
        returns.failed ||
        0
      ),

    duration_ms:
      Date.now() -
      startedAt,
  };
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getMissedTimetableRows,

  reconcileContinuousAbsenceSourcesForDate,

  syncTimetableAbsencesForDate,

  syncDutyRosterAbsencesForDate,

  reconcileAllOpenAbsenceReturns,

  syncContinuousAbsenceForDate,
};