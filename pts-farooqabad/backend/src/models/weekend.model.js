const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeIds(
  values
) {
  if (
    !Array.isArray(values)
  ) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(Number)
        .filter(
          (value) =>
            Number.isInteger(
              value
            ) &&
            value > 0
        )
    ),
  ];
}

function makePlaceholders(
  values
) {
  return values
    .map(
      () => "?"
    )
    .join(",");
}

/*
|--------------------------------------------------------------------------
| HYDRATE WEEKEND ASSIGNMENTS
|--------------------------------------------------------------------------
|
| Weekend ke saath assigned Courses, individual Trainees, Staff Categories
| aur Weekend Detain trainees attach karta hai.
|
|--------------------------------------------------------------------------
*/


function asDate(
  value
) {
  if (!value) {
    return null;
  }

  /*
  | MySQL DATETIME values in this project are configured wall-clock values
  | (PTS / Pakistan time) and mysql2 returns them as strings. Parsing those
  | strings through `new Date(text)` makes the result depend on the Docker
  | process timezone.  Represent the wall clock with UTC components instead,
  | so 07:00 always means 07:00 for Weekend calculations on every server.
  */
  if (
    value instanceof Date
  ) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : new Date(
          value.getTime()
        );
  }

  const text =
    String(value)
      .trim()
      .replace("T", " ")
      .replace(/Z$/i, "");

  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/
    );

  if (!match) {
    return null;
  }

  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0)
      )
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}


function addMinutes(
  value,
  minutes
) {
  const date =
    asDate(value);

  if (!date) {
    return null;
  }

  date.setUTCMinutes(
    date.getUTCMinutes() +
      Number(
        minutes || 0
      )
  );

  return date;
}


function pad(
  value
) {
  return String(value)
    .padStart(2, "0");
}


function wallClockSql(
  value
) {
  const date =
    asDate(value);

  if (!date) {
    return null;
  }

  return (
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())}`
  );
}


function ptsNowWallClockDate() {
  return new Date(
    Date.now() +
      5 * 60 * 60 * 1000
  );
}


function normalizeEmployeeCode(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .toUpperCase();
}


async function getDepartureSnapshot({
  weekend,
  courses = [],
  assignedTrainees = [],
  detainedTrainees = [],
}) {
  const weekendId =
    Number(
      weekend.id
    );

  const courseIds =
    (
      courses ||
      []
    )
      .map(
        (item) =>
          Number(
            item.id
          )
      )
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0
      );

  const assignedTraineeIds =
    (
      assignedTrainees ||
      []
    )
      .map(
        (item) =>
          Number(
            item.trainee_id ||
            item.id
          )
      )
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0
      );

  const conditions = [
    "t.is_deleted = 0",
    "COALESCE(t.is_staff_exempt, 0) = 0",
    "t.status NOT IN ('TRAINING_DROP', 'INACTIVE', 'COMPLETED')",
  ];

  const params = [];

  if (
    !Boolean(
      weekend.apply_all_trainees
    )
  ) {
    if (
      !courseIds.length &&
      !assignedTraineeIds.length
    ) {
      return {
        departure_window_start:
          null,

        departure_window_end:
          null,

        departure_window_status:
          "NO_SCOPE",

        departure_eligible_count:
          0,

        departure_present_count:
          0,

        departure_authorized_leave_count:
          0,

        departure_valid_count:
          0,

        departure_absent_count:
          0,

        departure_pending_count:
          0,

        detained_trainee_count:
          detainedTrainees.length,

        departure_present_trainee_ids:
          [],

        departure_present_trainees:
          [],

        departure_authorized_leave_trainee_ids:
          [],

        departure_authorized_leave_trainees:
          [],

        departure_valid_trainee_ids:
          [],

        departure_long_weekend_trainee_ids:
          [],

        departure_long_weekend_trainees:
          [],
      };
    }

    const scopeParts =
      [];

    if (courseIds.length) {
      scopeParts.push(
        `t.course_id IN (${makePlaceholders(
          courseIds
        )})`
      );

      params.push(
        ...courseIds
      );
    }

    if (
      assignedTraineeIds.length
    ) {
      scopeParts.push(
        `t.id IN (${makePlaceholders(
          assignedTraineeIds
        )})`
      );

      params.push(
        ...assignedTraineeIds
      );
    }

    conditions.push(
      `(${scopeParts.join(
        " OR "
      )})`
    );
  }


  const [
    traineeRows,
  ] =
    await pool.query(
      `
        SELECT
          t.id
            AS trainee_id,

          t.employee_id,
          t.first_name,
          t.last_name,

          t.course_id,
          c.course_name,

          t.platoon_id,
          p.platoon_number

        FROM trainees t

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          t.id ASC
      `,
      params
    );


  const detainedSet =
    new Set(
      (
        detainedTrainees ||
        []
      )
        .map(
          (item) =>
            Number(
              item.trainee_id ||
              item.id
            )
        )
        .filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0
        )
    );


  const departureDatetime =
    asDate(
      weekend.start_datetime
    );

  const windowStart =
    addMinutes(
      departureDatetime,
      -Math.max(
        0,
        Number(
          weekend.departure_early_minutes ??
          60
        )
      )
    );

  const windowEnd =
    addMinutes(
      departureDatetime,
      Math.max(
        0,
        Number(
          weekend.departure_late_minutes ??
          30
        )
      )
    );


  if (
    !departureDatetime ||
    !windowStart ||
    !windowEnd
  ) {
    return {
      departure_window_start:
        null,

      departure_window_end:
        null,

      departure_window_status:
        "INVALID",

      departure_eligible_count:
        traineeRows.length,

      departure_present_count:
        0,

      departure_authorized_leave_count:
        0,

      departure_valid_count:
        0,

      departure_absent_count:
        0,

      departure_pending_count:
        traineeRows.filter(
          (row) =>
            !detainedSet.has(
              Number(
                row.trainee_id
              )
            )
        ).length,

      detained_trainee_count:
        traineeRows.filter(
          (row) =>
            detainedSet.has(
              Number(
                row.trainee_id
              )
            )
        ).length,

      departure_present_trainee_ids:
        [],

      departure_present_trainees:
        [],

      departure_authorized_leave_trainee_ids:
        [],

      departure_authorized_leave_trainees:
        [],

      departure_valid_trainee_ids:
        [],

      departure_long_weekend_trainee_ids:
        [],

      departure_long_weekend_trainees:
        [],
    };
  }


  const departureDatetimeSql =
    wallClockSql(
      departureDatetime
    );

  const windowStartSql =
    wallClockSql(
      windowStart
    );

  const windowEndSql =
    wallClockSql(
      windowEnd
    );


  /*
  |--------------------------------------------------------------------------
  | AUTHORIZED LEAVE AT WEEKEND DEPARTURE
  |--------------------------------------------------------------------------
  |
  | A trainee who is already outside PTS on an approved biometric-exempt
  | Leave when the Long Weekend starts cannot physically mark the Weekend
  | departure punch. That sanctioned absence is therefore accepted as an
  | alternative Weekend departure authority.
  |
  | Important:
  | - Weekend Detain always overrides this entitlement.
  | - The normal biometric departure list remains separate for audit.
  | - Leave start/end is returned separately so Dashboard can keep the person
  |   under Leave until the sanctioned Leave actually ends, then move them to
  |   Long Weekend for the remaining active Weekend period.
  |--------------------------------------------------------------------------
  */

  const traineeIds =
    traineeRows
      .map(
        (row) =>
          Number(
            row.trainee_id
          )
      )
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0
      );

  let authorizedLeaveRows =
    [];

  if (traineeIds.length) {
    const [
      leaveRows,
    ] =
      await pool.query(
        `
          SELECT
            tl.id
              AS leave_id,

            tl.trainee_id,
            tl.leave_type,
            tl.leave_category,
            tl.reason,
            tl.reference_no,
            tl.start_datetime,
            tl.end_datetime

          FROM trainee_leaves tl

          WHERE
            tl.trainee_id IN (${makePlaceholders(
              traineeIds
            )})

            AND
            tl.biometric_exempt = 1

            AND
            tl.workflow_status IN
            (
              'APPROVED',
              'COMPLETED'
            )

            AND
            tl.start_datetime <= ?

            AND
            tl.end_datetime >= ?

          ORDER BY
            tl.trainee_id ASC,
            tl.start_datetime DESC,
            tl.id DESC
        `,
        [
          ...traineeIds,
          departureDatetimeSql,
          departureDatetimeSql,
        ]
      );

    const leaveByTraineeId =
      new Map();

    for (
      const leave
      of leaveRows || []
    ) {
      const traineeId =
        Number(
          leave.trainee_id
        );

      if (
        !Number.isInteger(traineeId) ||
        traineeId <= 0 ||
        leaveByTraineeId.has(
          traineeId
        )
      ) {
        continue;
      }

      leaveByTraineeId.set(
        traineeId,
        leave
      );
    }

    authorizedLeaveRows =
      traineeRows
        .map(
          (trainee) => {
            const traineeId =
              Number(
                trainee.trainee_id
              );

            const leave =
              leaveByTraineeId.get(
                traineeId
              );

            if (
              !leave ||
              detainedSet.has(
                traineeId
              )
            ) {
              return null;
            }

            return {
              ...trainee,

              authorization_source:
                "LEAVE",

              leave_id:
                Number(
                  leave.leave_id
                ),

              leave_type:
                leave.leave_type ||
                null,

              leave_category:
                leave.leave_category ||
                null,

              leave_reason:
                leave.reason ||
                null,

              leave_reference_no:
                leave.reference_no ||
                null,

              leave_start_datetime:
                leave.start_datetime ||
                null,

              leave_end_datetime:
                leave.end_datetime ||
                null,
            };
          }
        )
        .filter(Boolean);
  }


  /*
  |--------------------------------------------------------------------------
  | AUTHORIZED OSD / SHORT PERMISSION AT WEEKEND DEPARTURE
  |--------------------------------------------------------------------------
  |
  | Same confirmed rule as Leave: if the trainee is already outside PTS on
  | an approved biometric-exempt OSD / Short Permission when the Long Weekend
  | departure starts, a special return merely to mark a Weekend departure
  | punch is not required. The trainee remains OSD until that sanction ends,
  | then becomes Long Weekend if the Weekend is still active.
  |--------------------------------------------------------------------------
  */

  let authorizedOsdRows =
    [];

  if (traineeIds.length) {
    const [
      osdRows,
    ] =
      await pool.query(
        `
          SELECT
            o.id
              AS osd_id,

            o.trainee_id,
            o.record_type,
            o.reason,
            o.reference_no,
            o.start_datetime,
            o.end_datetime

          FROM trainee_osd o

          WHERE
            o.trainee_id IN (${makePlaceholders(
              traineeIds
            )})

            AND
            o.workflow_status IN
            (
              'APPROVED',
              'COMPLETED'
            )

            AND
            o.record_type IN
            (
              'OSD',
              'SHORT_PERMISSION'
            )

            AND
            o.biometric_exempt = 1

            AND
            o.start_datetime <= ?

            AND
            o.end_datetime >= ?

          ORDER BY
            o.trainee_id ASC,
            o.start_datetime DESC,
            o.id DESC
        `,
        [
          ...traineeIds,
          departureDatetimeSql,
          departureDatetimeSql,
        ]
      );

    const osdByTraineeId =
      new Map();

    for (
      const osd
      of osdRows || []
    ) {
      const traineeId =
        Number(
          osd.trainee_id
        );

      if (
        !Number.isInteger(traineeId) ||
        traineeId <= 0 ||
        osdByTraineeId.has(
          traineeId
        )
      ) {
        continue;
      }

      osdByTraineeId.set(
        traineeId,
        osd
      );
    }

    authorizedOsdRows =
      traineeRows
        .map(
          (trainee) => {
            const traineeId =
              Number(
                trainee.trainee_id
              );

            const osd =
              osdByTraineeId.get(
                traineeId
              );

            if (
              !osd ||
              detainedSet.has(
                traineeId
              )
            ) {
              return null;
            }

            return {
              ...trainee,

              authorization_source:
                "OSD",

              osd_id:
                Number(
                  osd.osd_id
                ),

              osd_record_type:
                osd.record_type ||
                "OSD",

              osd_reason:
                osd.reason ||
                null,

              osd_reference_no:
                osd.reference_no ||
                null,

              osd_start_datetime:
                osd.start_datetime ||
                null,

              osd_end_datetime:
                osd.end_datetime ||
                null,
            };
          }
        )
        .filter(Boolean);
  }


  /*
  |--------------------------------------------------------------------------
  | AUTHORIZED HOME REST AT WEEKEND DEPARTURE
  |--------------------------------------------------------------------------
  |
  | Home Rest is an approved off-campus biometric exemption and follows the
  | same departure treatment as Leave. Medical Rest is intentionally NOT part
  | of this rule and still requires a valid Weekend departure biometric.
  |--------------------------------------------------------------------------
  */

  let authorizedHomeRestRows =
    [];

  if (traineeIds.length) {
    const [
      homeRestRows,
    ] =
      await pool.query(
        `
          SELECT
            o.id
              AS outdoor_id,

            o.trainee_id,
            o.outdoor_purpose,
            o.doctor_recommendation,
            o.home_rest_start,
            o.home_rest_end

          FROM trainee_outdoor o

          WHERE
            o.trainee_id IN (${makePlaceholders(
              traineeIds
            )})

            AND
            o.workflow_status IN
            (
              'ACTIVE',
              'COMPLETED'
            )

            AND
            COALESCE(
              o.home_rest,
              0
            ) = 1

            AND
            o.home_rest_start IS NOT NULL

            AND
            o.home_rest_end IS NOT NULL

            AND
            o.home_rest_start <= ?

            AND
            o.home_rest_end >= ?

          ORDER BY
            o.trainee_id ASC,
            o.home_rest_start DESC,
            o.id DESC
        `,
        [
          ...traineeIds,
          departureDatetimeSql,
          departureDatetimeSql,
        ]
      );

    const homeRestByTraineeId =
      new Map();

    for (
      const homeRest
      of homeRestRows || []
    ) {
      const traineeId =
        Number(
          homeRest.trainee_id
        );

      if (
        !Number.isInteger(traineeId) ||
        traineeId <= 0 ||
        homeRestByTraineeId.has(
          traineeId
        )
      ) {
        continue;
      }

      homeRestByTraineeId.set(
        traineeId,
        homeRest
      );
    }

    authorizedHomeRestRows =
      traineeRows
        .map(
          (trainee) => {
            const traineeId =
              Number(
                trainee.trainee_id
              );

            const homeRest =
              homeRestByTraineeId.get(
                traineeId
              );

            if (
              !homeRest ||
              detainedSet.has(
                traineeId
              )
            ) {
              return null;
            }

            return {
              ...trainee,

              authorization_source:
                "HOME_REST",

              outdoor_id:
                Number(
                  homeRest.outdoor_id
                ),

              home_rest_reason:
                homeRest.doctor_recommendation ||
                homeRest.outdoor_purpose ||
                "Home Rest",

              home_rest_start_datetime:
                homeRest.home_rest_start ||
                null,

              home_rest_end_datetime:
                homeRest.home_rest_end ||
                null,
            };
          }
        )
        .filter(Boolean);
  }


  /*
  | One trainee may theoretically have more than one sanctioned record at the
  | departure moment. Keep one identity row and use the LATEST sanction end so
  | Long Weekend never starts before every active authorised status has ended.
  | Existing Dashboard priority still decides whether Leave/Home Rest or OSD
  | is displayed while those records are active.
  */

  const operationalCandidates =
    [
      ...authorizedLeaveRows.map(
        (item) => ({
          ...item,
          authorization_source:
            "LEAVE",
          authorization_start_datetime:
            item.leave_start_datetime ||
            null,
          authorization_end_datetime:
            item.leave_end_datetime ||
            null,
        })
      ),

      ...authorizedHomeRestRows.map(
        (item) => ({
          ...item,
          authorization_source:
            "HOME_REST",
          authorization_start_datetime:
            item.home_rest_start_datetime ||
            null,
          authorization_end_datetime:
            item.home_rest_end_datetime ||
            null,
        })
      ),

      ...authorizedOsdRows.map(
        (item) => ({
          ...item,
          authorization_source:
            "OSD",
          authorization_start_datetime:
            item.osd_start_datetime ||
            null,
          authorization_end_datetime:
            item.osd_end_datetime ||
            null,
        })
      ),
    ];

  const authorizationPriority = {
    LEAVE: 1,
    HOME_REST: 2,
    OSD: 3,
  };

  const authorizedOperationalByTraineeId =
    new Map();

  for (
    const candidate
    of operationalCandidates
  ) {
    const traineeId =
      Number(
        candidate.trainee_id
      );

    const existing =
      authorizedOperationalByTraineeId.get(
        traineeId
      );

    if (!existing) {
      authorizedOperationalByTraineeId.set(
        traineeId,
        {
          ...candidate,
          authorization_sources: [
            candidate.authorization_source,
          ],
        }
      );
      continue;
    }

    const existingPriority =
      authorizationPriority[
        existing.authorization_source
      ] ||
      99;

    const candidatePriority =
      authorizationPriority[
        candidate.authorization_source
      ] ||
      99;

    const primary =
      candidatePriority <
      existingPriority
        ? candidate
        : existing;

    const existingEnd =
      asDate(
        existing.authorization_end_datetime
      );

    const candidateEnd =
      asDate(
        candidate.authorization_end_datetime
      );

    const latestEnd =
      candidateEnd &&
      (
        !existingEnd ||
        candidateEnd.getTime() >
          existingEnd.getTime()
      )
        ? candidate.authorization_end_datetime
        : existing.authorization_end_datetime;

    authorizedOperationalByTraineeId.set(
      traineeId,
      {
        ...primary,
        authorization_end_datetime:
          latestEnd ||
          primary.authorization_end_datetime ||
          null,
        authorization_sources: [
          ...new Set([
            ...(existing.authorization_sources || [
              existing.authorization_source,
            ]),
            candidate.authorization_source,
          ]),
        ],
      }
    );
  }

  const authorizedOperationalRows =
    Array.from(
      authorizedOperationalByTraineeId.values()
    );


  const now =
    ptsNowWallClockDate();

  /*
  | Preserve already-finalized genuine biometric departure evidence. Once a
  | trainee had an accepted in-window punch, a later unrelated punch (or a
  | transient raw-transaction lookup issue) must never make that authority
  | disappear from the active Long Weekend.
  */
  let persistedAttendanceRows =
    [];

  if (
    weekendId > 0
  ) {
    const [
      rows,
    ] =
      await pool.query(
        `
          SELECT
            trainee_id,
            punch_transaction_id,
            punch_time,
            attendance_status

          FROM weekend_departure_attendance

          WHERE
            weekend_id = ?

          ORDER BY
            trainee_id ASC,
            id ASC
        `,
        [
          weekendId,
        ]
      );

    persistedAttendanceRows =
      rows || [];
  }

  const persistedByTraineeId =
    new Map(
      persistedAttendanceRows.map(
        (row) => [
          Number(
            row.trainee_id
          ),
          row,
        ]
      )
    );

  let transactionRows =
    [];

  if (
    now.getTime() >=
    windowStart.getTime()
  ) {
    const [
      rows,
    ] =
      await pool.query(
        `
          SELECT
            id,
            emp_code,
            punch_time

          FROM zkteco_transactions

          WHERE
            punch_time >= ?

            AND
            punch_time <= ?

          ORDER BY
            punch_time ASC,
            id ASC
        `,
        [
          windowStartSql,
          windowEndSql,
        ]
      );

    transactionRows =
      rows ||
      [];
  }


  const eligibleCodeMap =
    new Map();

  for (
    const trainee
    of traineeRows
  ) {
    const code =
      normalizeEmployeeCode(
        trainee.employee_id
      );

    if (code) {
      eligibleCodeMap.set(
        code,
        trainee
      );
    }
  }


  const firstPunchByCode =
    new Map();

  for (
    const tx
    of transactionRows
  ) {
    const code =
      normalizeEmployeeCode(
        tx.emp_code
      );

    if (
      !code ||
      !eligibleCodeMap.has(
        code
      ) ||
      firstPunchByCode.has(
        code
      )
    ) {
      continue;
    }

    firstPunchByCode.set(
      code,
      tx
    );
  }


  const presentRows =
    [];

  const finalRows =
    [];

  let detainedCount =
    0;

  for (
    const trainee
    of traineeRows
  ) {
    const traineeId =
      Number(
        trainee.trainee_id
      );

    const detained =
      detainedSet.has(
        traineeId
      );

    const code =
      normalizeEmployeeCode(
        trainee.employee_id
      );

    const persistedAttendance =
      persistedByTraineeId.get(
        traineeId
      ) ||
      null;

    const persistedBiometricTx =
      persistedAttendance &&
      String(
        persistedAttendance.attendance_status ||
          ""
      )
        .trim()
        .toUpperCase() ===
        "PRESENT" &&
      (
        persistedAttendance.punch_transaction_id ||
        persistedAttendance.punch_time
      )
        ? {
            id:
              persistedAttendance.punch_transaction_id ||
              null,

            emp_code:
              trainee.employee_id,

            punch_time:
              persistedAttendance.punch_time ||
              null,

            _persisted_weekend_departure:
              true,
          }
        : null;

    const tx =
      !detained
        ? firstPunchByCode.get(
            code
          ) ||
          persistedBiometricTx ||
          null
        : null;

    const authorizedOperational =
      !detained
        ? authorizedOperationalByTraineeId.get(
            traineeId
          ) ||
          null
        : null;

    let attendanceStatus =
      "ABSENT";

    if (detained) {
      attendanceStatus =
        "DETAINED";

      detainedCount +=
        1;
    } else if (tx) {
      attendanceStatus =
        "PRESENT";

      presentRows.push({
        ...trainee,

        authorization_source:
          "BIOMETRIC",

        transaction_id:
          tx.id
            ? Number(
                tx.id
              )
            : null,

        punch_time:
          tx.punch_time,
      });
    } else if (authorizedOperational) {
      /*
      | Persist as PRESENT for backward-compatible Weekend departure history.
      | A NULL punch_transaction_id / punch_time distinguishes an authorised
      | Leave / Home Rest / OSD departure from an actual biometric punch.
      */
      attendanceStatus =
        "PRESENT";
    }

    finalRows.push({
      trainee,

      status:
        attendanceStatus,

      transaction:
        tx,

      authorization:
        tx
          ? "BIOMETRIC"
          : authorizedOperational
          ? authorizedOperational.authorization_source
          : null,
    });
  }


  const biometricPresentIds =
    new Set(
      presentRows.map(
        (item) =>
          Number(
            item.trainee_id
          )
      )
    );

  /*
  | A real biometric punch takes precedence if a trainee somehow has both.
  | The authorised operational list is identity-unique, so Valid Total never
  | double-counts a trainee with overlapping sanctioned records.
  */
  const authorizedOnlyRows =
    authorizedOperationalRows.filter(
      (item) =>
        !biometricPresentIds.has(
          Number(
            item.trainee_id
          )
        )
    );

  const leaveOnlyRows =
    authorizedOnlyRows.filter(
      (item) =>
        item.authorization_source ===
        "LEAVE"
    );

  const homeRestOnlyRows =
    authorizedOnlyRows.filter(
      (item) =>
        item.authorization_source ===
        "HOME_REST"
    );

  const osdOnlyRows =
    authorizedOnlyRows.filter(
      (item) =>
        item.authorization_source ===
        "OSD"
    );

  const validDepartureCount =
    presentRows.length +
    authorizedOnlyRows.length;

  const longWeekendAuthorizedOperationalRows =
    authorizedOnlyRows.filter(
      (item) => {
        const authorizationEnd =
          asDate(
            item.authorization_end_datetime
          );

        return Boolean(
          authorizationEnd &&
          authorizationEnd.getTime() <=
            now.getTime()
        );
      }
    );

  const windowFinished =
    now.getTime() >
    windowEnd.getTime();

  /*
  |--------------------------------------------------------------------------
  | Persist final history only after the departure punch window is finished.
  | Rebuild only when final totals changed, so Dashboard GET does not cause
  | thousands of writes on every page refresh.
  |--------------------------------------------------------------------------
  */

  if (
    windowFinished &&
    weekendId > 0
  ) {
    const fingerprint =
      (rows) =>
        (rows || [])
          .map(
            (row) => {
              const traineeId =
                Number(
                  row.trainee_id ??
                    row.trainee?.trainee_id
                );

              const status =
                String(
                  row.attendance_status ??
                    row.status ??
                    ""
                )
                  .trim()
                  .toUpperCase();

              const transactionId =
                Number(
                  row.punch_transaction_id ??
                    row.transaction?.id ??
                    0
                ) ||
                0;

              return (
                `${traineeId}:` +
                `${status}:` +
                `${transactionId}`
              );
            }
          )
          .sort()
          .join("|");

    const calculatedRows =
      finalRows.map(
        (item) => ({
          trainee_id:
            Number(
              item.trainee.trainee_id
            ),

          attendance_status:
            item.status,

          punch_transaction_id:
            item.transaction?.id ||
            null,
        })
      );

    /*
    | Identity/status/transaction fingerprint is deliberate. Comparing only
    | totals allowed a wrong person to remain persisted when another trainee
    | replaced them but the total PRESENT count happened to stay unchanged.
    */
    const needsRebuild =
      fingerprint(
        persistedAttendanceRows
      ) !==
      fingerprint(
        calculatedRows
      );

    if (needsRebuild) {
      const connection =
        await pool.getConnection();

      try {
        await connection.beginTransaction();

        await connection.query(
          `
            DELETE FROM
              weekend_departure_attendance

            WHERE
              weekend_id = ?
          `,
          [
            weekendId,
          ]
        );

        if (
          finalRows.length
        ) {
          const values =
            finalRows.map(
              (item) => [
                weekendId,

                Number(
                  item.trainee.trainee_id
                ),

                departureDatetimeSql,

                windowStartSql,
                windowEndSql,

                item.transaction?.id
                  ? Number(
                      item.transaction.id
                    )
                  : null,

                item.transaction
                  ?.punch_time ||
                  null,

                item.status,

                wallClockSql(now),
                wallClockSql(now),
              ]
            );

          await connection.query(
            `
              INSERT INTO
                weekend_departure_attendance
              (
                weekend_id,
                trainee_id,

                departure_date,

                window_start,
                window_end,

                punch_transaction_id,
                punch_time,

                attendance_status,

                calculated_at,
                recalculated_at
              )

              VALUES ?
            `,
            [
              values,
            ]
          );
        }

        await connection.commit();
      } catch (error) {
        try {
          await connection.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "Weekend departure attendance rollback failed:",
            rollbackError.message
          );
        }

        throw error;
      } finally {
        connection.release();
      }
    }
  }


  const nonDetainedCount =
    Math.max(
      0,
      traineeRows.length -
        detainedCount
    );

  const absentCount =
    windowFinished
      ? Math.max(
          0,
          nonDetainedCount -
            validDepartureCount
        )
      : 0;

  const pendingCount =
    windowFinished
      ? 0
      : Math.max(
          0,
          nonDetainedCount -
            validDepartureCount
        );


  let windowStatus =
    "UPCOMING";

  if (
    now.getTime() >=
      windowStart.getTime() &&
    now.getTime() <=
      windowEnd.getTime()
  ) {
    windowStatus =
      "OPEN";
  } else if (
    windowFinished
  ) {
    windowStatus =
      "CLOSED";
  }


  return {
    departure_window_start:
      windowStartSql,

    departure_window_end:
      windowEndSql,

    departure_window_status:
      windowStatus,

    departure_eligible_count:
      traineeRows.length,

    /* Actual biometric departure punches only. */
    departure_present_count:
      presentRows.length,

    /* Approved Leave covering the exact Weekend departure moment. */
    departure_authorized_leave_count:
      leaveOnlyRows.length,

    /* Approved Home Rest covering the exact Weekend departure moment. */
    departure_authorized_home_rest_count:
      homeRestOnlyRows.length,

    /* Approved OSD / Short Permission covering the departure moment. */
    departure_authorized_osd_count:
      osdOnlyRows.length,

    /* All no-punch sanctioned departure authorities, identity-unique. */
    departure_authorized_operational_count:
      authorizedOnlyRows.length,

    /* Biometric + Leave/Home Rest/OSD departure authority. */
    departure_valid_count:
      validDepartureCount,

    departure_absent_count:
      absentCount,

    departure_pending_count:
      pendingCount,

    detained_trainee_count:
      detainedCount,

    /* Backward compatible: this remains biometric-only. */
    departure_present_trainee_ids:
      presentRows.map(
        (item) =>
          Number(
            item.trainee_id
          )
      ),

    departure_present_trainees:
      presentRows,

    departure_authorized_leave_trainee_ids:
      leaveOnlyRows.map(
        (item) =>
          Number(
            item.trainee_id
          )
      ),

    departure_authorized_leave_trainees:
      leaveOnlyRows,

    departure_authorized_home_rest_trainee_ids:
      homeRestOnlyRows.map(
        (item) =>
          Number(
            item.trainee_id
          )
      ),

    departure_authorized_home_rest_trainees:
      homeRestOnlyRows,

    departure_authorized_osd_trainee_ids:
      osdOnlyRows.map(
        (item) =>
          Number(
            item.trainee_id
          )
      ),

    departure_authorized_osd_trainees:
      osdOnlyRows,

    departure_authorized_operational_trainee_ids:
      authorizedOnlyRows.map(
        (item) =>
          Number(
            item.trainee_id
          )
      ),

    departure_authorized_operational_trainees:
      authorizedOnlyRows,

    departure_valid_trainee_ids:
      [
        ...presentRows.map(
          (item) =>
            Number(
              item.trainee_id
            )
        ),
        ...authorizedOnlyRows.map(
          (item) =>
            Number(
              item.trainee_id
            )
        ),
      ],

    /*
    | Dashboard authority:
    | - biometric departures are Long Weekend immediately (operational cards
    |   can still display an active Leave/OSD/Home Rest with higher priority);
    | - no-punch sanctioned trainees become Long Weekend only after the LAST
    |   sanctioned status active at departure has ended.
    */
    departure_long_weekend_trainee_ids:
      [
        ...presentRows.map(
          (item) =>
            Number(
              item.trainee_id
            )
        ),
        ...longWeekendAuthorizedOperationalRows.map(
          (item) =>
            Number(
              item.trainee_id
            )
        ),
      ],

    departure_long_weekend_trainees:
      [
        ...presentRows,
        ...longWeekendAuthorizedOperationalRows,
      ],
  };
}


async function hydrateWeekends(
  rows
) {
  if (
    !Array.isArray(rows) ||
    !rows.length
  ) {
    return [];
  }

  const weekendIds =
    rows
      .map(
        (row) =>
          Number(row.id)
      )
      .filter(
        (id) =>
          Number.isInteger(id) &&
          id > 0
      );

  if (
    !weekendIds.length
  ) {
    return rows;
  }

  const placeholders =
    makePlaceholders(
      weekendIds
    );

  const [
    courseResult,
    staffResult,
    traineeResult,
    detainedResult,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            wca.weekend_id,

            c.id,
            c.course_name,
            c.course_code,
            c.start_date,
            c.end_date,
            c.is_active

          FROM
            weekend_course_assignments wca

          INNER JOIN
            courses c
              ON c.id =
                 wca.course_id

          WHERE
            wca.weekend_id
            IN (${placeholders})

          ORDER BY
            c.course_name ASC,
            c.id ASC
        `,
        weekendIds
      ),

      pool.query(
        `
          SELECT
            wsa.weekend_id,

            sc.id,
            sc.category_name,
            sc.is_active

          FROM
            weekend_staff_assignments wsa

          INNER JOIN
            staff_categories sc
              ON sc.id =
                 wsa.category_id

          WHERE
            wsa.weekend_id
            IN (${placeholders})

          ORDER BY
            sc.category_name ASC,
            sc.id ASC
        `,
        weekendIds
      ),

      pool.query(
        `
          SELECT
            wta.weekend_id,

            t.id
              AS trainee_id,

            t.employee_id,
            t.first_name,
            t.last_name,

            t.course_id,
            c.course_name,

            t.platoon_id,
            p.platoon_number

          FROM
            weekend_trainee_assignments wta

          INNER JOIN
            trainees t
              ON t.id =
                 wta.trainee_id

          LEFT JOIN
            courses c
              ON c.id =
                 t.course_id

          LEFT JOIN
            platoons p
              ON p.id =
                 t.platoon_id

          WHERE
            wta.weekend_id
            IN (${placeholders})

          ORDER BY
            t.first_name ASC,
            t.last_name ASC,
            t.employee_id ASC,
            t.id ASC
        `,
        weekendIds
      ),

      pool.query(
        `
          SELECT
            wdt.weekend_id,

            t.id
              AS trainee_id,

            t.employee_id,
            t.first_name,
            t.last_name,

            t.course_id,
            c.course_name,

            t.platoon_id,
            p.platoon_number

          FROM
            weekend_detained_trainees wdt

          INNER JOIN
            trainees t
              ON t.id =
                 wdt.trainee_id

          LEFT JOIN
            courses c
              ON c.id =
                 t.course_id

          LEFT JOIN
            platoons p
              ON p.id =
                 t.platoon_id

          WHERE
            wdt.weekend_id
            IN (${placeholders})

          ORDER BY
            t.first_name ASC,
            t.last_name ASC,
            t.employee_id ASC
        `,
        weekendIds
      ),
    ]);

  const courseRows =
    courseResult[0] ||
    [];

  const staffRows =
    staffResult[0] ||
    [];

  const traineeRows =
    traineeResult[0] ||
    [];

  const detainedRows =
    detainedResult[0] ||
    [];

  const courseMap =
    new Map();

  const staffMap =
    new Map();

  const traineeMap =
    new Map();

  const detainedMap =
    new Map();


  for (
    const row
    of courseRows
  ) {
    const weekendId =
      Number(
        row.weekend_id
      );

    if (
      !courseMap.has(
        weekendId
      )
    ) {
      courseMap.set(
        weekendId,
        []
      );
    }

    courseMap
      .get(
        weekendId
      )
      .push({
        id:
          Number(
            row.id
          ),

        course_name:
          row.course_name,

        course_code:
          row.course_code,

        start_date:
          row.start_date,

        end_date:
          row.end_date,

        is_active:
          Boolean(
            row.is_active
          ),
      });
  }


  for (
    const row
    of staffRows
  ) {
    const weekendId =
      Number(
        row.weekend_id
      );

    if (
      !staffMap.has(
        weekendId
      )
    ) {
      staffMap.set(
        weekendId,
        []
      );
    }

    staffMap
      .get(
        weekendId
      )
      .push({
        id:
          Number(
            row.id
          ),

        category_name:
          row.category_name,

        is_active:
          Boolean(
            row.is_active
          ),
      });
  }


  for (
    const row
    of traineeRows
  ) {
    const weekendId =
      Number(
        row.weekend_id
      );

    if (
      !traineeMap.has(
        weekendId
      )
    ) {
      traineeMap.set(
        weekendId,
        []
      );
    }

    traineeMap
      .get(
        weekendId
      )
      .push({
        id:
          Number(
            row.trainee_id
          ),

        trainee_id:
          Number(
            row.trainee_id
          ),

        employee_id:
          row.employee_id,

        first_name:
          row.first_name,

        last_name:
          row.last_name,

        course_id:
          row.course_id
            ? Number(
                row.course_id
              )
            : null,

        course_name:
          row.course_name,

        platoon_id:
          row.platoon_id
            ? Number(
                row.platoon_id
              )
            : null,

        platoon_number:
          row.platoon_number,
      });
  }


  for (
    const row
    of detainedRows
  ) {
    const weekendId =
      Number(
        row.weekend_id
      );

    if (
      !detainedMap.has(
        weekendId
      )
    ) {
      detainedMap.set(
        weekendId,
        []
      );
    }

    detainedMap
      .get(
        weekendId
      )
      .push({
        id:
          Number(
            row.trainee_id
          ),

        trainee_id:
          Number(
            row.trainee_id
          ),

        employee_id:
          row.employee_id,

        first_name:
          row.first_name,

        last_name:
          row.last_name,

        course_id:
          row.course_id
            ? Number(
                row.course_id
              )
            : null,

        course_name:
          row.course_name,

        platoon_id:
          row.platoon_id
            ? Number(
                row.platoon_id
              )
            : null,

        platoon_number:
          row.platoon_number,
      });
  }


  const baseRows =
    rows.map(
      (row) => {
        const id =
          Number(
            row.id
          );

        const courses =
          courseMap.get(
            id
          ) ||
          [];

        const staffCategories =
          staffMap.get(
            id
          ) ||
          [];

        const assignedTrainees =
          traineeMap.get(
            id
          ) ||
          [];

        const detainedTrainees =
          detainedMap.get(
            id
          ) ||
          [];

        return {
          ...row,

          id,

          departure_early_minutes:
            Number(
              row.departure_early_minutes ??
              60
            ),

          departure_late_minutes:
            Number(
              row.departure_late_minutes ??
              30
            ),

          apply_all_trainees:
            Boolean(
              row.apply_all_trainees
            ),

          apply_all_staff:
            Boolean(
              row.apply_all_staff
            ),

          is_active:
            Boolean(
              row.is_active
            ),

          courses,

          staff_categories:
            staffCategories,

          trainees:
            assignedTrainees,

          trainee_ids:
            assignedTrainees.map(
              (trainee) =>
                trainee.id
            ),

          detained_trainees:
            detainedTrainees,

          detained_trainee_ids:
            detainedTrainees.map(
              (trainee) =>
                trainee.id
            ),

          course_ids:
            courses.map(
              (course) =>
                course.id
            ),

          staff_category_ids:
            staffCategories.map(
              (category) =>
                category.id
            ),

          course_count:
            courses.length,

          staff_category_count:
            staffCategories.length,

          trainee_count:
            assignedTrainees.length,

          detained_trainee_count:
            detainedTrainees.length,
        };
      }
    );


  const snapshots =
    await Promise.all(
      baseRows.map(
        (weekend) =>
          getDepartureSnapshot({
            weekend,

            courses:
              weekend.courses,

            assignedTrainees:
              weekend.trainees,

            detainedTrainees:
              weekend.detained_trainees,
          })
      )
    );


  return baseRows.map(
    (
      weekend,
      index
    ) => ({
      ...weekend,

      ...snapshots[
        index
      ],
    })
  );
}

/*
|--------------------------------------------------------------------------
| LIST WEEKENDS
|--------------------------------------------------------------------------
*/

async function getWeekends() {
  const [rows] =
    await pool.query(
      `
        SELECT
          w.*,

          CASE

            WHEN
              w.is_active = 0
            THEN
              'INACTIVE'

            WHEN
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00') <
              w.start_datetime
            THEN
              'UPCOMING'

            WHEN
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00') >
              w.end_datetime
            THEN
              'COMPLETED'

            ELSE
              'ACTIVE'

          END
            AS weekend_status

        FROM
          attendance_weekends w

        ORDER BY
          w.start_datetime DESC,
          w.id DESC
      `
    );

  return hydrateWeekends(
    rows
  );
}

/*
|--------------------------------------------------------------------------
| GET SINGLE WEEKEND
|--------------------------------------------------------------------------
*/

async function getWeekendById(
  id
) {
  const weekendId =
    Number(id);

  if (
    !Number.isInteger(
      weekendId
    ) ||
    weekendId <= 0
  ) {
    return null;
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          w.*,

          CASE

            WHEN
              w.is_active = 0
            THEN
              'INACTIVE'

            WHEN
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00') <
              w.start_datetime
            THEN
              'UPCOMING'

            WHEN
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00') >
              w.end_datetime
            THEN
              'COMPLETED'

            ELSE
              'ACTIVE'

          END
            AS weekend_status

        FROM
          attendance_weekends w

        WHERE
          w.id = ?

        LIMIT 1
      `,
      [
        weekendId,
      ]
    );

  if (
    !rows.length
  ) {
    return null;
  }

  const hydrated =
    await hydrateWeekends(
      rows
    );

  return (
    hydrated[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| VALIDATE COURSE / STAFF CATEGORY IDS
|--------------------------------------------------------------------------
*/

async function validateWeekendTargets({
  courseIds = [],
  staffCategoryIds = [],
  traineeIds = [],
  detainedTraineeIds = [],
  applyAllTrainees = false,
}) {
  const cleanCourseIds =
    normalizeIds(
      courseIds
    );

  const cleanStaffIds =
    normalizeIds(
      staffCategoryIds
    );

  const cleanTraineeIds =
    normalizeIds(
      traineeIds
    );

  const cleanDetainedIds =
    normalizeIds(
      detainedTraineeIds
    );

  let existingCourseIds =
    [];

  let existingStaffIds =
    [];

  let validTraineeIds =
    [];

  let validDetainedIds =
    [];


  if (
    cleanCourseIds.length
  ) {
    const placeholders =
      makePlaceholders(
        cleanCourseIds
      );

    const [
      rows,
    ] =
      await pool.query(
        `
          SELECT
            id

          FROM
            courses

          WHERE
            id IN (${placeholders})
        `,
        cleanCourseIds
      );

    existingCourseIds =
      rows.map(
        (row) =>
          Number(
            row.id
          )
      );
  }


  if (
    cleanStaffIds.length
  ) {
    const placeholders =
      makePlaceholders(
        cleanStaffIds
      );

    const [
      rows,
    ] =
      await pool.query(
        `
          SELECT
            id

          FROM
            staff_categories

          WHERE
            id IN (${placeholders})
        `,
        cleanStaffIds
      );

    existingStaffIds =
      rows.map(
        (row) =>
          Number(
            row.id
          )
      );
  }


  if (
    cleanTraineeIds.length
  ) {
    const placeholders =
      makePlaceholders(
        cleanTraineeIds
      );

    const [
      rows,
    ] =
      await pool.query(
        `
          SELECT
            t.id

          FROM
            trainees t

          WHERE
            t.id IN (${placeholders})

            AND
            t.is_deleted = 0

            AND
            COALESCE(
              t.is_staff_exempt,
              0
            ) = 0

            AND
            t.status NOT IN
            (
              'TRAINING_DROP',
              'INACTIVE',
              'COMPLETED'
            )
        `,
        cleanTraineeIds
      );

    validTraineeIds =
      rows.map(
        (row) =>
          Number(
            row.id
          )
      );
  }


  if (
    cleanDetainedIds.length
  ) {
    const traineePlaceholders =
      makePlaceholders(
        cleanDetainedIds
      );

    const params = [
      ...cleanDetainedIds,
    ];

    let scopeSql =
      "";

    if (
      !applyAllTrainees
    ) {
      const scopeParts =
        [];

      if (
        cleanCourseIds.length
      ) {
        scopeParts.push(
          `t.course_id IN (${makePlaceholders(
            cleanCourseIds
          )})`
        );

        params.push(
          ...cleanCourseIds
        );
      }

      if (
        cleanTraineeIds.length
      ) {
        scopeParts.push(
          `t.id IN (${makePlaceholders(
            cleanTraineeIds
          )})`
        );

        params.push(
          ...cleanTraineeIds
        );
      }

      if (
        !scopeParts.length
      ) {
        return {
          valid:
            false,

          invalidCourseIds:
            [],

          invalidStaffCategoryIds:
            [],

          invalidTraineeIds:
            [],

          invalidDetainedTraineeIds:
            cleanDetainedIds,
        };
      }

      scopeSql =
        `
          AND
          (
            ${scopeParts.join(
              " OR "
            )}
          )
        `;
    }

    const [
      rows,
    ] =
      await pool.query(
        `
          SELECT
            t.id

          FROM
            trainees t

          WHERE
            t.id IN (${traineePlaceholders})

            AND
            t.is_deleted = 0

            AND
            COALESCE(
              t.is_staff_exempt,
              0
            ) = 0

            ${scopeSql}
        `,
        params
      );

    validDetainedIds =
      rows.map(
        (row) =>
          Number(
            row.id
          )
      );
  }


  const courseSet =
    new Set(
      existingCourseIds
    );

  const staffSet =
    new Set(
      existingStaffIds
    );

  const traineeSet =
    new Set(
      validTraineeIds
    );

  const detainedSet =
    new Set(
      validDetainedIds
    );


  const invalidCourseIds =
    cleanCourseIds.filter(
      (id) =>
        !courseSet.has(
          id
        )
    );

  const invalidStaffCategoryIds =
    cleanStaffIds.filter(
      (id) =>
        !staffSet.has(
          id
        )
    );

  const invalidTraineeIds =
    cleanTraineeIds.filter(
      (id) =>
        !traineeSet.has(
          id
        )
    );

  const invalidDetainedTraineeIds =
    cleanDetainedIds.filter(
      (id) =>
        !detainedSet.has(
          id
        )
    );


  return {
    valid:
      invalidCourseIds.length ===
        0 &&
      invalidStaffCategoryIds.length ===
        0 &&
      invalidTraineeIds.length ===
        0 &&
      invalidDetainedTraineeIds.length ===
        0,

    invalidCourseIds,

    invalidStaffCategoryIds,

    invalidTraineeIds,

    invalidDetainedTraineeIds,
  };
}

/*
|--------------------------------------------------------------------------
| GET OVERLAPPING WEEKENDS
|--------------------------------------------------------------------------
|
| Sirf time overlap detect karta hai.
| Course/Staff scope conflict controller layer decide karegi.
|
|--------------------------------------------------------------------------
*/

async function getOverlappingWeekends({
  startDatetime,
  endDatetime,
  excludeId = null,
}) {
  const params = [
    endDatetime,
    startDatetime,
  ];

  let excludeSql =
    "";

  if (
    excludeId
  ) {
    excludeSql =
      `
        AND
          w.id <> ?
      `;

    params.push(
      Number(
        excludeId
      )
    );
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          w.*,

          CASE

            WHEN
              w.is_active = 0
            THEN
              'INACTIVE'

            WHEN
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00') <
              w.start_datetime
            THEN
              'UPCOMING'

            WHEN
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00') >
              w.end_datetime
            THEN
              'COMPLETED'

            ELSE
              'ACTIVE'

          END
            AS weekend_status

        FROM
          attendance_weekends w

        WHERE
          w.is_active = 1

          AND
          w.start_datetime < ?

          AND
          w.end_datetime > ?

          ${excludeSql}

        ORDER BY
          w.start_datetime ASC,
          w.id ASC
      `,
      params
    );

  return hydrateWeekends(
    rows
  );
}

/*
|--------------------------------------------------------------------------
| INSERT COURSE ASSIGNMENTS
|--------------------------------------------------------------------------
*/

async function insertCourseAssignments(
  connection,
  weekendId,
  courseIds
) {
  const ids =
    normalizeIds(
      courseIds
    );

  if (
    !ids.length
  ) {
    return;
  }

  const values =
    ids.map(
      (courseId) => [
        Number(
          weekendId
        ),
        courseId,
      ]
    );

  await connection.query(
    `
      INSERT INTO
        weekend_course_assignments
      (
        weekend_id,
        course_id
      )

      VALUES ?
    `,
    [
      values,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| INSERT STAFF ASSIGNMENTS
|--------------------------------------------------------------------------
*/

async function insertStaffAssignments(
  connection,
  weekendId,
  staffCategoryIds
) {
  const ids =
    normalizeIds(
      staffCategoryIds
    );

  if (
    !ids.length
  ) {
    return;
  }

  const values =
    ids.map(
      (categoryId) => [
        Number(
          weekendId
        ),
        categoryId,
      ]
    );

  await connection.query(
    `
      INSERT INTO
        weekend_staff_assignments
      (
        weekend_id,
        category_id
      )

      VALUES ?
    `,
    [
      values,
    ]
  );
}


async function insertTraineeAssignments(
  connection,
  weekendId,
  traineeIds,
  userId = null
) {
  const ids =
    normalizeIds(
      traineeIds
    );

  if (!ids.length) {
    return;
  }

  const values =
    ids.map(
      (traineeId) => [
        Number(
          weekendId
        ),

        traineeId,

        userId ||
          null,
      ]
    );

  await connection.query(
    `
      INSERT INTO
        weekend_trainee_assignments
      (
        weekend_id,
        trainee_id,
        created_by
      )

      VALUES ?
    `,
    [
      values,
    ]
  );
}


async function insertDetainedTrainees(
  connection,
  weekendId,
  traineeIds,
  userId = null
) {
  const ids =
    normalizeIds(
      traineeIds
    );

  if (!ids.length) {
    return;
  }

  const values =
    ids.map(
      (traineeId) => [
        Number(
          weekendId
        ),

        traineeId,

        userId ||
          null,
      ]
    );

  await connection.query(
    `
      INSERT INTO
        weekend_detained_trainees
      (
        weekend_id,
        trainee_id,
        created_by
      )

      VALUES ?
    `,
    [
      values,
    ]
  );
}


/*
|--------------------------------------------------------------------------
| CREATE WEEKEND
|--------------------------------------------------------------------------
*/

async function createWeekend(
  data,
  userId = null
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] =
      await connection.query(
        `
          INSERT INTO
            attendance_weekends
          (
            weekend_name,

            start_datetime,
            end_datetime,

            departure_early_minutes,
            departure_late_minutes,

            apply_all_trainees,
            apply_all_staff,

            remarks,

            is_active,

            created_by,
            updated_by
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          data.weekend_name,

          data.start_datetime,
          data.end_datetime,

          data.departure_early_minutes,
          data.departure_late_minutes,

          data.apply_all_trainees
            ? 1
            : 0,

          data.apply_all_staff
            ? 1
            : 0,

          data.remarks ||
            null,

          data.is_active
            ? 1
            : 0,

          userId,
          userId,
        ]
      );

    const weekendId =
      Number(
        result.insertId
      );

    /*
    |--------------------------------------------------------------------------
    | If All Trainees selected, individual Courses are not stored.
    |--------------------------------------------------------------------------
    */

    if (
      !data.apply_all_trainees
    ) {
      await insertCourseAssignments(
        connection,
        weekendId,
        data.course_ids
      );

      await insertTraineeAssignments(
        connection,
        weekendId,
        data.trainee_ids,
        userId
      );
    }

    /*
    |--------------------------------------------------------------------------
    | If All Staff selected, individual Staff Categories are not stored.
    |--------------------------------------------------------------------------
    */

    if (
      !data.apply_all_staff
    ) {
      await insertStaffAssignments(
        connection,
        weekendId,
        data.staff_category_ids
      );
    }

    await insertDetainedTrainees(
      connection,
      weekendId,
      data.detained_trainee_ids,
      userId
    );

    await connection.commit();

    return getWeekendById(
      weekendId
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch (
      rollbackError
    ) {
      console.error(
        "Weekend create rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE WEEKEND
|--------------------------------------------------------------------------
*/

async function updateWeekend(
  id,
  data,
  userId = null
) {
  const weekendId =
    Number(id);

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
        UPDATE
          attendance_weekends

        SET
          weekend_name = ?,

          start_datetime = ?,
          end_datetime = ?,

          departure_early_minutes = ?,
          departure_late_minutes = ?,

          apply_all_trainees = ?,
          apply_all_staff = ?,

          remarks = ?,

          is_active = ?,

          updated_by = ?

        WHERE
          id = ?
      `,
      [
        data.weekend_name,

        data.start_datetime,
        data.end_datetime,

        data.departure_early_minutes,
        data.departure_late_minutes,

        data.apply_all_trainees
          ? 1
          : 0,

        data.apply_all_staff
          ? 1
          : 0,

        data.remarks ||
          null,

        data.is_active
          ? 1
          : 0,

        userId,

        weekendId,
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Rebuild assignments
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE FROM
          weekend_course_assignments

        WHERE
          weekend_id = ?
      `,
      [
        weekendId,
      ]
    );

    await connection.query(
      `
        DELETE FROM
          weekend_staff_assignments

        WHERE
          weekend_id = ?
      `,
      [
        weekendId,
      ]
    );

    await connection.query(
      `
        DELETE FROM
          weekend_trainee_assignments

        WHERE
          weekend_id = ?
      `,
      [
        weekendId,
      ]
    );

    await connection.query(
      `
        DELETE FROM
          weekend_detained_trainees

        WHERE
          weekend_id = ?
      `,
      [
        weekendId,
      ]
    );

    await connection.query(
      `
        DELETE FROM
          weekend_departure_attendance

        WHERE
          weekend_id = ?
      `,
      [
        weekendId,
      ]
    );

    if (
      !data.apply_all_trainees
    ) {
      await insertCourseAssignments(
        connection,
        weekendId,
        data.course_ids
      );

      await insertTraineeAssignments(
        connection,
        weekendId,
        data.trainee_ids,
        userId
      );
    }

    if (
      !data.apply_all_staff
    ) {
      await insertStaffAssignments(
        connection,
        weekendId,
        data.staff_category_ids
      );
    }

    await insertDetainedTrainees(
      connection,
      weekendId,
      data.detained_trainee_ids,
      userId
    );

    await connection.commit();

    return getWeekendById(
      weekendId
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch (
      rollbackError
    ) {
      console.error(
        "Weekend update rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE WEEKEND
|--------------------------------------------------------------------------
|
| FK ON DELETE CASCADE ki wajah se Course aur Staff assignments
| automatically delete ho jayengi.
|
|--------------------------------------------------------------------------
*/

async function deleteWeekend(
  id
) {
  const weekendId =
    Number(id);

  if (
    !Number.isInteger(
      weekendId
    ) ||
    weekendId <= 0
  ) {
    return false;
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    /*
    | The individual-trainee junction table is intentionally cleaned here
    | as well as by any DB-level cascade that may exist. This keeps deletion
    | safe on installations where the migration was created without FKs.
    */
    await connection.query(
      `
        DELETE FROM
          weekend_trainee_assignments

        WHERE
          weekend_id = ?
      `,
      [
        weekendId,
      ]
    );

    const [
      result,
    ] =
      await connection.query(
        `
          DELETE FROM
            attendance_weekends

          WHERE
            id = ?
        `,
        [
          weekendId,
        ]
      );

    await connection.commit();

    return (
      result.affectedRows >
      0
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch (
      rollbackError
    ) {
      console.error(
        "Weekend delete rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getWeekends,

  getWeekendById,

  validateWeekendTargets,

  getOverlappingWeekends,

  createWeekend,

  updateWeekend,

  deleteWeekend,
};