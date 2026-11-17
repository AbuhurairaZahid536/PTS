const { effectiveAttendanceStatus } = require("./attendanceStatus.sql");
const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| TRAINEES FOR ATTENDANCE DATE
|--------------------------------------------------------------------------
*/

async function getTrainees(
  attendanceDate
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          t.id AS subject_id,

          'TRAINEE' AS subject_type,

          t.employee_id,

          t.first_name,
          t.last_name,

          t.course_id,
          t.platoon_id,

          c.course_name,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          p.platoon_number,

          NULL AS category_id,
          NULL AS category_name,
          NULL AS branch_name,

          COUNT(*) OVER
          (
            PARTITION BY
              TRIM(
                CAST(
                  t.employee_id
                  AS CHAR
                )
              )
          )
            AS employee_active_match_count

        FROM trainees t

        JOIN courses c
          ON c.id = t.course_id

        LEFT JOIN platoons p
          ON p.id = t.platoon_id

        WHERE
          t.is_deleted = 0

          AND
          t.is_staff_exempt = 0

          AND
          c.start_date IS NOT NULL

          AND
          c.end_date IS NOT NULL

          AND
          :attendanceDate
          BETWEEN
            c.start_date
          AND
            c.end_date

          /*
          |--------------------------------------------------------------------------
          | IMPORTANT
          |--------------------------------------------------------------------------
          |
          | COMPLETED and TRAINING_DROP legacy trainee status attendance ko
          | historical dates par block nahi karega.
          |
          | Course dates + trainee_training_drop are source of truth.
          |--------------------------------------------------------------------------
          */

          AND
          COALESCE(
            UPPER(
              TRIM(
                t.status
              )
            ),
            'ACTIVE'
          ) <> 'INACTIVE'

        ORDER BY
          t.employee_id,
          c.start_date DESC,
          t.id DESC
      `,
      {
        attendanceDate,
      }
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| STAFF
|--------------------------------------------------------------------------
*/

async function getStaff() {
  const [rows] =
    await pool.query(
      `
        SELECT
          s.id AS subject_id,

          'STAFF' AS subject_type,

          s.employee_id,

          s.first_name,
          s.last_name,

          NULL AS course_id,
          NULL AS platoon_id,

          NULL AS course_name,

          NULL AS course_start_date,
          NULL AS course_end_date,

          NULL AS platoon_number,

          s.category_id,

          sc.category_name,

          sb.branch_name,

          COUNT(*) OVER
          (
            PARTITION BY
              TRIM(
                CAST(
                  s.employee_id
                  AS CHAR
                )
              )
          )
            AS employee_active_match_count

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id = s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id = s.branch_id

        WHERE
          s.is_deleted = 0

        ORDER BY
          s.employee_id,
          s.id
      `
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| SUBJECTS
|--------------------------------------------------------------------------
*/

async function getSubjects(
  attendanceDate,
  subjectType = null
) {
  if (
    subjectType ===
    "TRAINEE"
  ) {
    return getTrainees(
      attendanceDate
    );
  }

  if (
    subjectType ===
    "STAFF"
  ) {
    return getStaff();
  }

  const [
    trainees,
    staff,
  ] =
    await Promise.all([
      getTrainees(
        attendanceDate
      ),

      getStaff(),
    ]);

  return [
    ...trainees,
    ...staff,
  ];
}

/*
|--------------------------------------------------------------------------
| STAFF ASSIGNED TO ACTIVE DUTY ROSTER
|--------------------------------------------------------------------------
|
| Staff assigned to an ACTIVE Duty Roster on the attendance date must not
| be processed by the normal Staff timetable engine. Their biometric
| attendance is calculated separately from the Duty Roster shift windows.
| Trainees are intentionally not returned here because Trainee attendance
| remains Course-timetable based even when named on a Duty Roster.
|
|--------------------------------------------------------------------------
*/

async function getDutyRosterStaffSubjectIds(
  attendanceDate
) {
  const [rows] =
    await pool.query(
      `
        SELECT DISTINCT
          dra.subject_id

        FROM duty_rosters dr

        JOIN duty_roster_shifts drs
          ON drs.roster_id =
             dr.id

        JOIN duty_roster_points drp
          ON drp.shift_id =
             drs.id

        JOIN duty_roster_assignments dra
          ON dra.duty_point_id =
             drp.id

        JOIN staff s
          ON s.id =
             dra.subject_id

        WHERE
          dr.roster_status =
            'ACTIVE'

          AND
          dr.roster_date = ?

          AND
          dra.subject_type =
            'STAFF'

          AND
          s.is_deleted = 0

        ORDER BY
          dra.subject_id ASC
      `,
      [
        attendanceDate,
      ]
    );

  return rows
    .map(
      (row) =>
        Number(
          row.subject_id
        )
    )
    .filter(
      (id) =>
        Number.isInteger(id) &&
        id > 0
    );
}

/*
|--------------------------------------------------------------------------
| TIMETABLE ASSIGNMENTS
|--------------------------------------------------------------------------
*/

async function getTimetableAssignments(
  attendanceDate
) {
  const [
    traineeRows,
    staffRows,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            'TRAINEE'
              AS assignment_type,

            a.course_id
              AS assignment_id,

            tt.*

          FROM timetable_course_assignments a

          JOIN attendance_timetable_rules tt
            ON tt.id = a.timetable_id

          JOIN courses c
            ON c.id = a.course_id

          WHERE
            tt.is_active = 1

            AND
            c.start_date IS NOT NULL

            AND
            c.end_date IS NOT NULL

            AND
            ? BETWEEN
              c.start_date
            AND
              c.end_date

            AND
            (
              tt.effective_from IS NULL

              OR
              tt.effective_from <= ?
            )

            AND
            (
              tt.effective_to IS NULL

              OR
              tt.effective_to >= ?
            )

          ORDER BY
            a.course_id,

            COALESCE(
              tt.effective_from,
              '1900-01-01'
            ) DESC,

            tt.id DESC
        `,
        [
          attendanceDate,
          attendanceDate,
          attendanceDate,
        ]
      ),

      pool.query(
        `
          SELECT
            'STAFF'
              AS assignment_type,

            a.category_id
              AS assignment_id,

            tt.*

          FROM timetable_staff_assignments a

          JOIN attendance_timetable_rules tt
            ON tt.id = a.timetable_id

          WHERE
            tt.is_active = 1

            AND
            (
              tt.effective_from IS NULL

              OR
              tt.effective_from <= ?
            )

            AND
            (
              tt.effective_to IS NULL

              OR
              tt.effective_to >= ?
            )

          ORDER BY
            a.category_id,

            COALESCE(
              tt.effective_from,
              '1900-01-01'
            ) DESC,

            tt.id DESC
        `,
        [
          attendanceDate,
          attendanceDate,
        ]
      ),
    ]);

  return [
    ...traineeRows[0],
    ...staffRows[0],
  ];
}

/*
|--------------------------------------------------------------------------
| BIOMETRIC TRANSACTIONS
|--------------------------------------------------------------------------
*/

async function getPunchesBulk({
  employeeIds,
  startDatetime,
  endDatetime,
}) {
  const cleanIds = [
    ...new Set(
      (employeeIds || [])
        .filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(
              value
            ).trim() !== ""
        )
        .map(
          (value) =>
            String(
              value
            ).trim()
        )
    ),
  ];

  if (!cleanIds.length) {
    return [];
  }

  const allRows = [];

  const CHUNK_SIZE = 800;

  for (
    let i = 0;
    i < cleanIds.length;
    i += CHUNK_SIZE
  ) {
    const chunk =
      cleanIds.slice(
        i,
        i + CHUNK_SIZE
      );

    const placeholders =
      chunk
        .map(() => "?")
        .join(",");

    const [rows] =
      await pool.query(
        `
          SELECT
            id,

            emp,
            emp_code,

            punch_time,

            punch_state,
            punch_state_display,

            verify_type,
            verify_type_display,

            terminal_sn,
            terminal_alias

          FROM zkteco_transactions

          WHERE
            emp_code IN
            (
              ${placeholders}
            )

            AND
            punch_time >= ?

            AND
            punch_time <= ?

          ORDER BY
            emp_code,
            punch_time,
            id
        `,
        [
          ...chunk,

          startDatetime,

          endDatetime,
        ]
      );

    allRows.push(
      ...rows
    );
  }

  return allRows;
}

/*
|--------------------------------------------------------------------------
| EXCEPTIONS
|--------------------------------------------------------------------------
*/

async function getExceptionData({
  subjectType = null,
  startDatetime,
  endDatetime,
}) {
  const result = {
    leaves: [],
    osd: [],
    homeRest: [],
    trainingDrop: [],
    manualAbsence: [],
    dutyRest: [],
  };

  const types =
    subjectType
      ? [subjectType]
      : [
          "TRAINEE",
          "STAFF",
        ];

  for (
    const type of types
  ) {
    const isTrainee =
      type ===
      "TRAINEE";

    const leaveTable =
      isTrainee
        ? "trainee_leaves"
        : "staff_leaves";

    const osdTable =
      isTrainee
        ? "trainee_osd"
        : "staff_osd";

    const outdoorTable =
      isTrainee
        ? "trainee_outdoor"
        : "staff_outdoor";

    const manualTable =
      isTrainee
        ? "trainee_manual_absence"
        : "staff_manual_absence";

    const idColumn =
      isTrainee
        ? "trainee_id"
        : "staff_id";

    const [
      leaveRows,
      osdRows,
      homeRestRows,
      manualRows,
    ] =
      await Promise.all([
        /*
        |--------------------------------------------------------------------------
        | LEAVE
        |--------------------------------------------------------------------------
        */

        pool.query(
          `
            SELECT
              '${type}'
                AS subject_type,

              ${idColumn}
                AS subject_id,

              id,

              leave_type,
              leave_category,

              workflow_status,

              start_datetime,
              end_datetime,

              reason,
              reference_no

            FROM ${leaveTable}

            WHERE
              biometric_exempt = 1

              AND
              workflow_status IN
              (
                'APPROVED',
                'COMPLETED'
              )

              AND
              start_datetime <= ?

              AND
              end_datetime >= ?
          `,
          [
            endDatetime,
            startDatetime,
          ]
        ),

        /*
        |--------------------------------------------------------------------------
        | OSD / PERMISSION
        |--------------------------------------------------------------------------
        */

        pool.query(
          `
            SELECT
              '${type}'
                AS subject_type,

              ${idColumn}
                AS subject_id,

              id,

              record_type,
              workflow_status,

              reason,
              duty_place,
              reference_no,

              start_datetime,
              end_datetime

            FROM ${osdTable}

            WHERE
              biometric_exempt = 1

              AND
              workflow_status IN
              (
                'APPROVED',
                'COMPLETED'
              )

              AND
              start_datetime <= ?

              AND
              end_datetime >= ?
          `,
          [
            endDatetime,
            startDatetime,
          ]
        ),

        /*
        |--------------------------------------------------------------------------
        | HOME REST
        |--------------------------------------------------------------------------
        */

        pool.query(
          `
            SELECT
              '${type}'
                AS subject_type,

              ${idColumn}
                AS subject_id,

              id,

              home_rest_start,
              home_rest_end,

              doctor_name,
              doctor_recommendation,
              reference_no

            FROM ${outdoorTable}

            WHERE
              home_rest = 1

              AND
              workflow_status IN
              (
                'ACTIVE',
                'COMPLETED'
              )

              AND
              home_rest_start IS NOT NULL

              AND
              home_rest_end IS NOT NULL

              AND
              home_rest_start <= ?

              AND
              home_rest_end >= ?
          `,
          [
            endDatetime,
            startDatetime,
          ]
        ),

        /*
        |--------------------------------------------------------------------------
        | MANUAL ABSENCE
        |--------------------------------------------------------------------------
        */

        pool.query(
          `
            SELECT
              '${type}'
                AS subject_type,

              ${idColumn}
                AS subject_id,

              id,

              absence_category,
              program_class,

              start_datetime,
              end_datetime,

              reason,
              reference_no,
              remarks

            FROM ${manualTable}

            WHERE
              record_status =
                'ACTIVE'

              AND
              start_datetime <= ?

              AND
              end_datetime >= ?
          `,
          [
            endDatetime,
            startDatetime,
          ]
        ),
      ]);

    result.leaves.push(
      ...leaveRows[0]
    );

    result.osd.push(
      ...osdRows[0]
    );

    result.homeRest.push(
      ...homeRestRows[0]
    );

    result.manualAbsence.push(
      ...manualRows[0]
    );

    /*
    |--------------------------------------------------------------------------
    | STAFF DUTY REST
    |--------------------------------------------------------------------------
    |
    | Duty Rest applies only to STAFF.
    | ALL          = every non-deleted Staff member
    | CATEGORIES   = Staff whose current category is selected
    | STAFF        = explicitly selected Staff members
    |
    |--------------------------------------------------------------------------
    */

    if (!isTrainee) {
      const [
        dutyRestRows,
      ] =
        await pool.query(
          `
            SELECT
              'STAFF'
                AS subject_type,

              s.id
                AS subject_id,

              dr.id,

              dr.title,
              dr.selection_mode,

              dr.start_datetime,
              dr.end_datetime,

              dr.reason,
              dr.reference_no,
              dr.remarks,

              dr.record_status

            FROM staff_duty_rest dr

            JOIN staff s
              ON
              (
                s.is_deleted = 0

                AND
                (
                  dr.selection_mode =
                    'ALL'

                  OR
                  (
                    dr.selection_mode =
                      'CATEGORIES'

                    AND EXISTS
                    (
                      SELECT 1

                      FROM staff_duty_rest_categories drc

                      WHERE
                        drc.duty_rest_id =
                          dr.id

                        AND
                        drc.category_id =
                          s.category_id
                    )
                  )

                  OR
                  (
                    dr.selection_mode =
                      'STAFF'

                    AND EXISTS
                    (
                      SELECT 1

                      FROM staff_duty_rest_members drm

                      WHERE
                        drm.duty_rest_id =
                          dr.id

                        AND
                        drm.staff_id =
                          s.id
                    )
                  )
                )
              )

            WHERE
              dr.record_status IN
              (
                'ACTIVE',
                'COMPLETED'
              )

              AND
              dr.start_datetime <= ?

              AND
              dr.end_datetime >= ?
          `,
          [
            endDatetime,
            startDatetime,
          ]
        );

      result.dutyRest.push(
        ...dutyRestRows
      );
    }

    /*
    |--------------------------------------------------------------------------
    | TRAINING DROP
    |--------------------------------------------------------------------------
    |
    | Drop period is treated as:
    |
    | [drop_datetime, rejoin_datetime)
    |
    | i.e. exact Rejoin time se trainee dobara attendance eligible hai.
    |--------------------------------------------------------------------------
    */

    if (isTrainee) {
      const [dropRows] =
        await pool.query(
          `
            SELECT
              'TRAINEE'
                AS subject_type,

              trainee_id
                AS subject_id,

              id,

              drop_status,

              drop_datetime,
              rejoin_datetime,

              reason,
              order_reference

            FROM trainee_training_drop

            WHERE
              drop_status IN
              (
                'ACTIVE',
                'REJOINED'
              )

              AND
              drop_datetime <= ?

              AND
              (
                rejoin_datetime IS NULL

                OR
                rejoin_datetime > ?
              )
          `,
          [
            endDatetime,
            startDatetime,
          ]
        );

      result.trainingDrop.push(
        ...dropRows
      );
    }
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| SAVE ATTENDANCE BULK
|--------------------------------------------------------------------------
*/

async function saveAttendanceBulk(
  records
) {
  if (
    !records ||
    !records.length
  ) {
    return;
  }

  const CHUNK_SIZE = 200;

  for (
    let i = 0;
    i < records.length;
    i += CHUNK_SIZE
  ) {
    const chunk =
      records.slice(
        i,
        i + CHUNK_SIZE
      );

    const values = [];

    const rowSql =
      chunk
        .map(
          (record) => {
            values.push(
              record.attendance_date,

              record.subject_type,
              record.subject_id,

              record.employee_id ||
                null,

              record.session_type,

              record.timetable_id ||
                null,

              record.timetable_name ||
                null,

              record.window_start ||
                null,

              record.window_end ||
                null,

              record.early_window_start ||
                null,

              record.late_window_end ||
                null,

              record.selected_punch ||
                null,

              record.transaction_id ||
                null,

              record.attendance_status,

              record.timing_status,

              record.timing_minutes ??
                null,

              record.exemption_type ||
                null,

              record.exemption_record_id ||
                null,

              record.exemption_description ||
                null,

              record.has_manual_absence
                ? 1
                : 0,

              record.manual_absence_data
                ? JSON.stringify(
                    record.manual_absence_data
                  )
                : null
            );

            return `
              (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?,
                NOW()
              )
            `;
          }
        )
        .join(",");

    await pool.query(
      `
        INSERT INTO attendance_records
        (
          attendance_date,

          subject_type,
          subject_id,
          employee_id,

          session_type,

          timetable_id,
          timetable_name,

          window_start,
          window_end,

          early_window_start,
          late_window_end,

          selected_punch,
          transaction_id,

          attendance_status,
          timing_status,
          timing_minutes,

          exemption_type,
          exemption_record_id,
          exemption_description,

          has_manual_absence,
          manual_absence_data,

          processed_at
        )

        VALUES
          ${rowSql}

        ON DUPLICATE KEY UPDATE

          employee_id =
            VALUES(
              employee_id
            ),

          timetable_id =
            VALUES(
              timetable_id
            ),

          timetable_name =
            VALUES(
              timetable_name
            ),

          window_start =
            VALUES(
              window_start
            ),

          window_end =
            VALUES(
              window_end
            ),

          early_window_start =
            VALUES(
              early_window_start
            ),

          late_window_end =
            VALUES(
              late_window_end
            ),

          selected_punch =
            VALUES(
              selected_punch
            ),

          transaction_id =
            VALUES(
              transaction_id
            ),

          attendance_status =
            VALUES(
              attendance_status
            ),

          timing_status =
            VALUES(
              timing_status
            ),

          timing_minutes =
            VALUES(
              timing_minutes
            ),

          exemption_type =
            VALUES(
              exemption_type
            ),

          exemption_record_id =
            VALUES(
              exemption_record_id
            ),

          exemption_description =
            VALUES(
              exemption_description
            ),

          has_manual_absence =
            VALUES(
              has_manual_absence
            ),

          manual_absence_data =
            VALUES(
              manual_absence_data
            ),

          processed_at =
            NOW()
      `,
      values
    );
  }
}

/*
|--------------------------------------------------------------------------
| REMOVE STALE ATTENDANCE
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Subject identity:
|
| TRAINEE:10
| STAFF:10
|
| dono different subjects hain.
|--------------------------------------------------------------------------
*/

async function removeStaleAttendanceRecords({
  attendanceDate,
  subjectType = null,
  subjects = [],
  subjectIds = [],
}) {
  const normalizedType =
    subjectType
      ? String(
          subjectType
        )
          .trim()
          .toUpperCase()
      : null;

  /*
  |--------------------------------------------------------------------------
  | Build exact per-type IDs
  |--------------------------------------------------------------------------
  */

  const traineeIds =
    new Set();

  const staffIds =
    new Set();

  for (
    const subject of
    subjects || []
  ) {
    const id =
      Number(
        subject.subject_id
      );

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      continue;
    }

    if (
      subject.subject_type ===
      "TRAINEE"
    ) {
      traineeIds.add(id);
    }

    if (
      subject.subject_type ===
      "STAFF"
    ) {
      staffIds.add(id);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Backward compatibility:
  | old caller subjectIds + explicit subjectType
  |--------------------------------------------------------------------------
  */

  if (
    !subjects.length &&
    normalizedType &&
    Array.isArray(
      subjectIds
    )
  ) {
    for (
      const rawId of
      subjectIds
    ) {
      const id =
        Number(rawId);

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        continue;
      }

      if (
        normalizedType ===
        "TRAINEE"
      ) {
        traineeIds.add(id);
      }

      if (
        normalizedType ===
        "STAFF"
      ) {
        staffIds.add(id);
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | SINGLE TYPE CLEANUP
  |--------------------------------------------------------------------------
  */

  if (
    normalizedType ===
    "TRAINEE" ||
    normalizedType ===
    "STAFF"
  ) {
    const ids =
      normalizedType ===
      "TRAINEE"
        ? [
            ...traineeIds,
          ]
        : [
            ...staffIds,
          ];

    const conditions = [
      "attendance_date = ?",
      "subject_type = ?",
    ];

    const params = [
      attendanceDate,
      normalizedType,
    ];

    if (ids.length) {
      const placeholders =
        ids
          .map(() => "?")
          .join(",");

      conditions.push(
        `subject_id NOT IN (${placeholders})`
      );

      params.push(
        ...ids
      );
    }

    await pool.query(
      `
        DELETE
        FROM attendance_records

        WHERE
          ${conditions.join(
            " AND "
          )}
      `,
      params
    );

    return;
  }

  /*
  |--------------------------------------------------------------------------
  | COMBINED TRAINEE + STAFF CLEANUP
  |--------------------------------------------------------------------------
  */

  const staleClauses = [];

  const params = [
    attendanceDate,
  ];

  const traineeArray = [
    ...traineeIds,
  ];

  const staffArray = [
    ...staffIds,
  ];

  if (
    traineeArray.length
  ) {
    const placeholders =
      traineeArray
        .map(() => "?")
        .join(",");

    staleClauses.push(`
      (
        subject_type = 'TRAINEE'

        AND
        subject_id NOT IN
        (
          ${placeholders}
        )
      )
    `);

    params.push(
      ...traineeArray
    );
  } else {
    staleClauses.push(`
      subject_type = 'TRAINEE'
    `);
  }

  if (
    staffArray.length
  ) {
    const placeholders =
      staffArray
        .map(() => "?")
        .join(",");

    staleClauses.push(`
      (
        subject_type = 'STAFF'

        AND
        subject_id NOT IN
        (
          ${placeholders}
        )
      )
    `);

    params.push(
      ...staffArray
    );
  } else {
    staleClauses.push(`
      subject_type = 'STAFF'
    `);
  }

  await pool.query(
    `
      DELETE
      FROM attendance_records

      WHERE
        attendance_date = ?

        AND
        (
          ${staleClauses.join(
            " OR "
          )}
        )
    `,
    params
  );
}

/*
|--------------------------------------------------------------------------
| ATTENDANCE RECORDS
|--------------------------------------------------------------------------
*/

async function getAttendanceRecords({
  attendanceDate,
  subjectType = null,
  sessionType = null,
  status = null,
  timingStatus = null,
  manualOnly = false,
  search = "",
  courseId = null,
  platoonId = null,
  categoryId = null,
  branchId = null,
}) {
  const conditions = [
    "ar.attendance_date = :attendanceDate",

    /*
    |--------------------------------------------------------------------------
    | Do not show stale trainee row outside Course dates
    |--------------------------------------------------------------------------
    */

    `
      (
        ar.subject_type <> 'TRAINEE'

        OR
        (
          t.id IS NOT NULL

          AND
          c.start_date IS NOT NULL

          AND
          c.end_date IS NOT NULL

          AND
          ar.attendance_date
          BETWEEN
            c.start_date
          AND
            c.end_date
        )
      )
    `,
  ];

  const params = {
    attendanceDate,
  };

  if (subjectType) {
    conditions.push(
      "ar.subject_type = :subjectType"
    );

    params.subjectType =
      subjectType;
  }

  if (sessionType) {
    conditions.push(
      "ar.session_type = :sessionType"
    );

    params.sessionType =
      sessionType;
  }

  if (status) {
    conditions.push(
      `${effectiveAttendanceStatus} = :status`
    );

    params.status =
      status;
  }

  if (timingStatus) {
    conditions.push(
      "ar.timing_status = :timingStatus"
    );

    params.timingStatus =
      timingStatus;
  }

  if (manualOnly) {
    conditions.push(
      "ar.has_manual_absence = 1"
    );
  }

  if (
    search &&
    String(
      search
    ).trim()
  ) {
    conditions.push(`
      (
        ar.employee_id LIKE :search

        OR
        t.first_name LIKE :search

        OR
        t.last_name LIKE :search

        OR
        CONCAT_WS(
          ' ',
          t.first_name,
          t.last_name
        ) LIKE :search

        OR
        s.first_name LIKE :search

        OR
        s.last_name LIKE :search

        OR
        CONCAT_WS(
          ' ',
          s.first_name,
          s.last_name
        ) LIKE :search
      )
    `);

    params.search =
      `%${String(
        search
      ).trim()}%`;
  }

  if (courseId) {
    conditions.push(
      "t.course_id = :courseId"
    );

    params.courseId =
      courseId;
  }

  if (platoonId) {
    conditions.push(
      "t.platoon_id = :platoonId"
    );

    params.platoonId =
      platoonId;
  }

  if (categoryId) {
    conditions.push(
      "s.category_id = :categoryId"
    );

    params.categoryId =
      categoryId;
  }

  if (branchId) {
    conditions.push(
      "s.branch_id = :branchId"
    );

    params.branchId =
      branchId;
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          ar.*,
          ${effectiveAttendanceStatus} AS attendance_status,
          CASE WHEN ar.subject_type='TRAINEE' THEN COALESCE(NULLIF(t.zkteco_emp_code,''),t.employee_id)
            ELSE COALESCE(NULLIF(s.zkteco_emp_code,''),s.employee_id) END AS employee_id,

          COALESCE(
            NULLIF(
              CONCAT_WS(
                ' ',
                t.first_name,
                t.last_name
              ),
              ''
            ),

            NULLIF(
              CONCAT_WS(
                ' ',
                s.first_name,
                s.last_name
              ),
              ''
            ),

            ar.employee_id
          )
            AS subject_name,

          c.course_name,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          p.platoon_number,

          sc.category_name,

          sb.branch_name

        FROM attendance_records ar

        LEFT JOIN trainees t
          ON
            ar.subject_type =
            'TRAINEE'

          AND
            t.id =
            ar.subject_id

        LEFT JOIN courses c
          ON
            c.id =
            t.course_id

        LEFT JOIN platoons p
          ON
            p.id =
            t.platoon_id

        LEFT JOIN staff s
          ON
            ar.subject_type =
            'STAFF'

          AND
            s.id =
            ar.subject_id

        LEFT JOIN staff_categories sc
          ON
            sc.id =
            s.category_id

        LEFT JOIN staff_branches sb
          ON
            sb.id =
            s.branch_id

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          ar.subject_type,

          ar.employee_id,

          CASE
            WHEN
              ar.session_type =
              'MORNING'
              THEN 1

            ELSE 2
          END
      `,
      params
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

async function getSummary(
  attendanceDate,
  subjectType = null
) {
  const conditions = [
    "ar.attendance_date = :attendanceDate",

    `
      (
        ar.subject_type <> 'TRAINEE'

        OR
        (
          t.id IS NOT NULL

          AND
          c.start_date IS NOT NULL

          AND
          c.end_date IS NOT NULL

          AND
          ar.attendance_date
          BETWEEN
            c.start_date
          AND
            c.end_date
        )
      )
    `,
  ];

  const params = {
    attendanceDate,
  };

  if (subjectType) {
    conditions.push(
      "ar.subject_type = :subjectType"
    );

    params.subjectType =
      subjectType;
  }

  const where =
    conditions.join(
      " AND "
    );

  const commonFrom = `
    FROM attendance_records ar

    LEFT JOIN trainees t
      ON
        ar.subject_type = 'TRAINEE'

      AND
        t.id = ar.subject_id

    LEFT JOIN courses c
      ON c.id = t.course_id
  `;

  const [
    overallResult,
    sessionResult,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(
              DISTINCT CONCAT(
                ar.subject_type,
                ':',
                ar.subject_id
              )
            )
              AS total_subjects,

            COUNT(*)
              AS total_session_records,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'PRESENT'
              ),
              0
            ) AS present,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'ABSENT'
              ),
              0
            ) AS absent,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'EXEMPT'
              ),
              0
            ) AS exempt,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'NO_TIMETABLE'
              ),
              0
            ) AS no_timetable,
            SUM(${effectiveAttendanceStatus}='PENDING') AS pending,

            COALESCE(
              SUM(
                ar.timing_status =
                'EARLY'
              ),
              0
            ) AS early,

            COALESCE(
              SUM(
                ar.timing_status =
                'IN_TIME'
              ),
              0
            ) AS in_time,

            COALESCE(
              SUM(
                ar.timing_status =
                'LATE'
              ),
              0
            ) AS late,

            COALESCE(
              SUM(
                ar.has_manual_absence =
                1
              ),
              0
            ) AS manual_absence

          ${commonFrom}

          WHERE
            ${where}
        `,
        params
      ),

      pool.query(
        `
          SELECT
            ar.session_type,

            COUNT(*)
              AS total,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'PRESENT'
              ),
              0
            ) AS present,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'ABSENT'
              ),
              0
            ) AS absent,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'EXEMPT'
              ),
              0
            ) AS exempt,

            COALESCE(
              SUM(
                ${effectiveAttendanceStatus} =
                'NO_TIMETABLE'
              ),
              0
            ) AS no_timetable,
            SUM(${effectiveAttendanceStatus}='PENDING') AS pending,

            COALESCE(
              SUM(
                ar.timing_status =
                'EARLY'
              ),
              0
            ) AS early,

            COALESCE(
              SUM(
                ar.timing_status =
                'IN_TIME'
              ),
              0
            ) AS in_time,

            COALESCE(
              SUM(
                ar.timing_status =
                'LATE'
              ),
              0
            ) AS late,

            COALESCE(
              SUM(
                ar.has_manual_absence =
                1
              ),
              0
            ) AS manual_absence

          ${commonFrom}

          WHERE
            ${where}

          GROUP BY
            ar.session_type

          ORDER BY
            CASE
              WHEN
                ar.session_type =
                'MORNING'
                THEN 1

              ELSE 2
            END
        `,
        params
      ),
    ]);

  const overall =
    overallResult[0][0] ||
    {};

  return {
    total_subjects:
      Number(
        overall.total_subjects ||
        0
      ),

    total_session_records:
      Number(
        overall.total_session_records ||
        0
      ),

    present:
      Number(
        overall.present ||
        0
      ),

    absent:
      Number(
        overall.absent ||
        0
      ),

    exempt:
      Number(
        overall.exempt ||
        0
      ),

    no_timetable:
      Number(
        overall.no_timetable ||
        0
      ),

    early:
      Number(
        overall.early ||
        0
      ),

    in_time:
      Number(
        overall.in_time ||
        0
      ),

    late:
      Number(
        overall.late ||
        0
      ),

    manual_absence:
      Number(
        overall.manual_absence ||
        0
      ),

    pending: Number(overall.pending || 0),
    sessions:
      sessionResult[0].map(
        (row) => ({
          ...row,

          total:
            Number(
              row.total ||
              0
            ),

          present:
            Number(
              row.present ||
              0
            ),

          absent:
            Number(
              row.absent ||
              0
            ),

          exempt:
            Number(
              row.exempt ||
              0
            ),

          no_timetable:
            Number(
              row.no_timetable ||
              0
            ),

          early:
            Number(
              row.early ||
              0
            ),

          in_time:
            Number(
              row.in_time ||
              0
            ),

          late:
            Number(
              row.late ||
              0
            ),

          manual_absence:
            Number(
              row.manual_absence ||
              0
            ),
        })
      ),
  };
}

module.exports = {
  getSubjects,

  getDutyRosterStaffSubjectIds,

  getTimetableAssignments,

  getPunchesBulk,

  getExceptionData,

  saveAttendanceBulk,

  removeStaleAttendanceRecords,

  getAttendanceRecords,

  getSummary,
};