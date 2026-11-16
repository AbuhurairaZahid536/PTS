const { pool } = require("../config/db");
const {
  getOpenAbsences,
} = require("./absenceEpisode.model");

const LEGACY_STAFF_COURSE_PATTERNS = [
  "admin%",
  "dhobi khana%",
  "%washing branch%",
  "class 4 staff%",
  "line staff%",
  "drill instructor%",
  "drill staff%",
  "law instructor%",
  "menial staff%",
  "ministerial staff%",
  "security staff%",
  "band staff%",
  "cl staff%",
  "weapon staff%",
];

function legacyStaffCourseExclusionSql(alias = "c", indent = "              ") {
  const nameSql = `LOWER(TRIM(COALESCE(${alias}.course_name, '')))`;

  return LEGACY_STAFF_COURSE_PATTERNS.map(
    (pattern) => `${nameSql} NOT LIKE '${String(pattern).replace(/'/g, "''")}'`,
  ).join(`\n${indent}AND\n${indent}`);
}

function activeStaffIdentityExclusionSql(traineeAlias = "t") {
  return `
    NOT EXISTS
    (
      SELECT 1

      FROM staff staff_identity

      WHERE
        staff_identity.is_deleted = 0

        AND
        TRIM(
          CAST(
            staff_identity.employee_id
            AS CHAR
          )
        ) =
        TRIM(
          CAST(
            ${traineeAlias}.employee_id
            AS CHAR
          )
        )
    )
  `;
}

/*
|--------------------------------------------------------------------------
| SAFE LOOKUP
|--------------------------------------------------------------------------
*/

async function safeLookup(name, sql, params = {}) {
  try {
    const [rows] = await pool.query(sql, params);

    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error(`[REPORT FILTERS] ${name} lookup failed:`, error.message);

    return [];
  }
}

/*
|--------------------------------------------------------------------------
| FILTER LOOKUPS
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Course / Platoon filtering legacy is_active par depend nahi karegi.
| Historical completed Courses bhi Reports mein available rahenge.
|--------------------------------------------------------------------------
*/

async function getAttendanceReportFilters() {
  const [courses, platoons, categories, branches] = await Promise.all([
    /*
      |--------------------------------------------------------------------------
      | COURSES
      |--------------------------------------------------------------------------
      */

    safeLookup(
      "Courses",
      `
          SELECT
            c.id,

            c.course_name,
            c.course_code,

            c.start_date,
            c.end_date,

            CASE
              WHEN
                c.start_date IS NULL
                OR c.end_date IS NULL
                THEN 'DATE_NOT_SET'

              WHEN
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
                THEN 'UPCOMING'

              WHEN
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                BETWEEN
                  c.start_date
                AND
                  c.end_date
                THEN 'ACTIVE'

              ELSE 'COMPLETED'
            END AS course_status

          FROM courses c

          WHERE EXISTS
          (
            SELECT 1

            FROM trainees t

            WHERE
              t.course_id = c.id

              AND t.is_deleted = 0

              AND t.is_staff_exempt = 0

              AND
              ${legacyStaffCourseExclusionSql("c")}

              AND
              ${activeStaffIdentityExclusionSql("t")}
          )

          ORDER BY
            CASE
              WHEN
                c.start_date IS NOT NULL
                AND c.end_date IS NOT NULL
                AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                    BETWEEN c.start_date
                    AND c.end_date
                THEN 1

              WHEN
                c.start_date IS NOT NULL
                AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
                THEN 2

              WHEN
                c.end_date IS NOT NULL
                AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) > c.end_date
                THEN 3

              ELSE 4
            END,

            c.start_date DESC,

            c.course_name ASC
        `,
    ),

    /*
      |--------------------------------------------------------------------------
      | PLATOONS
      |--------------------------------------------------------------------------
      */

    safeLookup(
      "Platoons",
      `
          SELECT
            p.id,

            p.course_id,

            p.platoon_number,
            p.platoon_name

          FROM platoons p

          WHERE EXISTS
          (
            SELECT 1

            FROM trainees t

            LEFT JOIN courses c2
              ON c2.id = t.course_id

            WHERE
              t.platoon_id = p.id

              AND t.is_deleted = 0

              AND t.is_staff_exempt = 0

              AND
              ${legacyStaffCourseExclusionSql("c2")}

              AND
              ${activeStaffIdentityExclusionSql("t")}
          )

          ORDER BY
            p.course_id ASC,

            p.platoon_number ASC,

            p.platoon_name ASC
        `,
    ),

    /*
      |--------------------------------------------------------------------------
      | STAFF CATEGORIES
      |--------------------------------------------------------------------------
      */

    safeLookup(
      "Staff Categories",
      `
          SELECT
            id,
            category_name

          FROM staff_categories

          ORDER BY
            category_name ASC
        `,
    ),

    /*
      |--------------------------------------------------------------------------
      | STAFF BRANCHES
      |--------------------------------------------------------------------------
      */

    safeLookup(
      "Staff Branches",
      `
          SELECT
  id,
  branch_name

FROM staff_branches
          ORDER BY
            branch_name ASC
        `,
    ),
  ]);

  return {
    courses,
    platoons,
    categories,
    branches,
  };
}

/*
|--------------------------------------------------------------------------
| CONDITIONS
|--------------------------------------------------------------------------
*/

function buildConditions({
  attendanceDate,
  subjectType,
  sessionType,

  search = "",

  attendanceStatus = null,
  timingStatus = null,

  courseId = null,
  platoonId = null,

  categoryId = null,
  branchId = null,
}) {
  const conditions = [
    "ar.attendance_date = :attendanceDate",

    "ar.subject_type = :subjectType",

    "ar.session_type = :sessionType",
  ];

  const params = {
    attendanceDate,
    subjectType,
    sessionType,
  };

  /*
  |--------------------------------------------------------------------------
  | COURSE DATE SOURCE OF TRUTH
  |--------------------------------------------------------------------------
  |
  | Historical report uses report/attendance date.
  |
  | Example:
  |
  | Course:
  | 01-Sep-2026 -> 30-Nov-2026
  |
  | 15-Oct-2026 report:
  | trainee included.
  |
  | 01-Dec-2026 report:
  | trainee excluded.
  |
  | Current date ka is calculation se koi relation nahi.
  |--------------------------------------------------------------------------
  */

  if (subjectType === "TRAINEE") {
    conditions.push("t.id IS NOT NULL");

    conditions.push("c.id IS NOT NULL");

    conditions.push("c.start_date IS NOT NULL");

    conditions.push("c.end_date IS NOT NULL");

    conditions.push("ar.attendance_date BETWEEN c.start_date AND c.end_date");

    conditions.push("COALESCE(t.is_staff_exempt, 0) = 0");

    conditions.push(legacyStaffCourseExclusionSql("c", "      "));

    conditions.push(activeStaffIdentityExclusionSql("t"));
  }

  /*
  |--------------------------------------------------------------------------
  | SEARCH
  |--------------------------------------------------------------------------
  */

  const normalizedSearch = String(search || "").trim();

  if (normalizedSearch) {
    conditions.push(`
      (
        ar.employee_id LIKE :search

        OR t.first_name LIKE :search

        OR t.last_name LIKE :search

        OR CONCAT_WS(
          ' ',
          t.first_name,
          t.last_name
        ) LIKE :search

        OR s.first_name LIKE :search

        OR s.last_name LIKE :search

        OR CONCAT_WS(
          ' ',
          s.first_name,
          s.last_name
        ) LIKE :search

        OR c.course_name LIKE :search

        OR sc.category_name LIKE :search

        OR sb.branch_name LIKE :search
      )
    `);

    params.search = `%${normalizedSearch}%`;
  }

  /*
  |--------------------------------------------------------------------------
  | ATTENDANCE STATUS
  |--------------------------------------------------------------------------
  */

  if (attendanceStatus) {
    conditions.push("ar.attendance_status = :attendanceStatus");

    params.attendanceStatus = attendanceStatus;
  }

  /*
  |--------------------------------------------------------------------------
  | TIMING STATUS
  |--------------------------------------------------------------------------
  */

  if (timingStatus) {
    conditions.push("ar.timing_status = :timingStatus");

    params.timingStatus = timingStatus;
  }

  /*
  |--------------------------------------------------------------------------
  | TRAINEE FILTERS
  |--------------------------------------------------------------------------
  */

  if (subjectType === "TRAINEE" && courseId) {
    conditions.push("t.course_id = :courseId");

    params.courseId = Number(courseId);
  }

  if (subjectType === "TRAINEE" && platoonId) {
    conditions.push("t.platoon_id = :platoonId");

    params.platoonId = Number(platoonId);
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF FILTERS
  |--------------------------------------------------------------------------
  */

  if (subjectType === "STAFF" && categoryId) {
    conditions.push("s.category_id = :categoryId");

    params.categoryId = Number(categoryId);
  }

  if (subjectType === "STAFF" && branchId) {
    conditions.push("s.branch_id = :branchId");

    params.branchId = Number(branchId);
  }

  return {
    conditions,
    params,
  };
}

/*
|--------------------------------------------------------------------------
| COMMON FROM / JOINS
|--------------------------------------------------------------------------
*/

const ATTENDANCE_FROM = `
  FROM attendance_records ar

  LEFT JOIN trainees t
    ON ar.subject_type = 'TRAINEE'
    AND t.id = ar.subject_id

  LEFT JOIN courses c
    ON c.id = t.course_id

  LEFT JOIN platoons p
    ON p.id = t.platoon_id

  LEFT JOIN staff s
    ON ar.subject_type = 'STAFF'
    AND s.id = ar.subject_id

  LEFT JOIN staff_categories sc
    ON sc.id = s.category_id

  LEFT JOIN staff_branches sb
    ON sb.id = s.branch_id

  LEFT JOIN zkteco_transactions zt
    ON zt.id = ar.transaction_id
`;

/*
|--------------------------------------------------------------------------
| COMMON SELECT
|--------------------------------------------------------------------------
*/

const ATTENDANCE_SELECT = `
  SELECT
    ar.id,

    ar.attendance_date,

    ar.subject_type,

    ar.subject_id,

    ar.employee_id,

    s.belt_no AS belt_no,

    ar.session_type,

    ar.selected_punch,

    ar.transaction_id,

    COALESCE(
      zt.punch_state_display,
      zt.punch_state
    ) AS punch_state,

    zt.punch_state
      AS punch_state_code,

    ar.attendance_status,

    ar.timing_status,

    ar.timing_minutes,

    ar.exemption_type,

    ar.exemption_description,

    ar.has_manual_absence,

    ar.manual_absence_data,

    ar.timetable_name,

    ar.window_start,

    ar.window_end,

    ar.early_window_start,

    ar.late_window_end,

    ar.processed_at,

    TRIM(
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
    ) AS subject_name,

    /*
    |--------------------------------------------------------------------------
    | TRAINEE CONTEXT
    |--------------------------------------------------------------------------
    */

    t.course_id,

    c.course_name,

    c.course_code,

    c.start_date
      AS course_start_date,

    c.end_date
      AS course_end_date,

    CASE
      WHEN
        ar.subject_type <> 'TRAINEE'
        THEN NULL

      WHEN
        c.start_date IS NULL
        OR c.end_date IS NULL
        THEN 'DATE_NOT_SET'

      WHEN
        ar.attendance_date < c.start_date
        THEN 'BEFORE_COURSE'

      WHEN
        ar.attendance_date > c.end_date
        THEN 'AFTER_COURSE'

      ELSE 'ACTIVE_ON_REPORT_DATE'
    END
      AS course_status_on_report_date,

    t.platoon_id,

    p.platoon_number,

    p.platoon_name,

    /*
    |--------------------------------------------------------------------------
    | STAFF CONTEXT
    |--------------------------------------------------------------------------
    */

    s.category_id,

    sc.category_name,

    s.branch_id,

    sb.branch_name,

    s.designation,

    s.designation
      AS staff_rank

  ${ATTENDANCE_FROM}
`;

/*
|--------------------------------------------------------------------------
| REPORT
|--------------------------------------------------------------------------
*/

async function getAttendanceReport({
  attendanceDate,
  subjectType,
  sessionType,

  search = "",

  attendanceStatus = null,
  timingStatus = null,

  courseId = null,
  platoonId = null,

  categoryId = null,
  branchId = null,

  page = 1,
  pageSize = 50,
}) {
  const normalizedPage = Math.max(1, Number(page) || 1);

  const normalizedPageSize = Math.min(500, Math.max(1, Number(pageSize) || 50));

  const offset = (normalizedPage - 1) * normalizedPageSize;

  const { conditions, params } = buildConditions({
    attendanceDate,
    subjectType,
    sessionType,

    search,

    attendanceStatus,
    timingStatus,

    courseId,
    platoonId,

    categoryId,
    branchId,
  });

  const whereClause = conditions.join(" AND ");

  const [rowsResult, countResult, summaryResult] = await Promise.all([
    /*
      |--------------------------------------------------------------------------
      | ROWS
      |--------------------------------------------------------------------------
      */

    pool.query(
      `
          ${ATTENDANCE_SELECT}

          WHERE
            ${whereClause}

          ORDER BY
            CASE
              WHEN ar.employee_id REGEXP '^[0-9]+$'
                THEN 0
              ELSE 1
            END,

            CAST(
              ar.employee_id
              AS UNSIGNED
            ) ASC,

            ar.employee_id ASC,

            ar.id ASC

          LIMIT ${normalizedPageSize}
          OFFSET ${offset}
        `,
      params,
    ),

    /*
      |--------------------------------------------------------------------------
      | COUNT
      |--------------------------------------------------------------------------
      */

    pool.query(
      `
          SELECT
            COUNT(*)
              AS total

          ${ATTENDANCE_FROM}

          WHERE
            ${whereClause}
        `,
      params,
    ),

    /*
      |--------------------------------------------------------------------------
      | SUMMARY
      |--------------------------------------------------------------------------
      */

    pool.query(
      `
          SELECT
            COUNT(*)
              AS total,

            COALESCE(
              SUM(
                ar.attendance_status =
                'PRESENT'
              ),
              0
            ) AS present,

            COALESCE(
              SUM(
                ar.attendance_status =
                'ABSENT'
              ),
              0
            ) AS absent,

            COALESCE(
              SUM(
                ar.attendance_status =
                'EXEMPT'
              ),
              0
            ) AS exempt,

            COALESCE(
              SUM(
                ar.attendance_status =
                'NO_TIMETABLE'
              ),
              0
            ) AS no_timetable,

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
                'EARLY'
              ),
              0
            ) AS early,

            COALESCE(
              SUM(
                ar.timing_status =
                'LATE'
              ),
              0
            ) AS late,

            COALESCE(
              SUM(
                ar.timing_status =
                'NO_PUNCH'
              ),
              0
            ) AS no_punch,

            COALESCE(
              SUM(
                ar.has_manual_absence =
                1
              ),
              0
            ) AS manual_absence

          ${ATTENDANCE_FROM}

          WHERE
            ${whereClause}
        `,
      params,
    ),
  ]);

  const summaryRow = summaryResult[0]?.[0] || {};

  const total = Number(countResult[0]?.[0]?.total || 0);

  return {
    rows: rowsResult[0] || [],

    pagination: {
      page: normalizedPage,

      pageSize: normalizedPageSize,

      total,

      totalPages: total > 0 ? Math.ceil(total / normalizedPageSize) : 0,
    },

    summary: {
      total: Number(summaryRow.total || 0),

      present: Number(summaryRow.present || 0),

      absent: Number(summaryRow.absent || 0),

      exempt: Number(summaryRow.exempt || 0),

      no_timetable: Number(summaryRow.no_timetable || 0),

      in_time: Number(summaryRow.in_time || 0),

      early: Number(summaryRow.early || 0),

      late: Number(summaryRow.late || 0),

      no_punch: Number(summaryRow.no_punch || 0),

      manual_absence: Number(summaryRow.manual_absence || 0),
    },
  };
}

/*
|--------------------------------------------------------------------------
| DASHBOARD ALL ROWS
|--------------------------------------------------------------------------
|
| Dashboard ko paginated HTTP calls ki zaroorat nahi. This helper reuses the
| same report joins / filters but returns the complete selected session in one
| database query. It is intentionally internal-data only: no pagination, no
| count query and no summary query.
|
|--------------------------------------------------------------------------
*/

async function getAttendanceReportAllRows({
  attendanceDate,
  subjectType,
  sessionType,

  search = "",

  attendanceStatus = null,
  timingStatus = null,

  courseId = null,
  platoonId = null,

  categoryId = null,
  branchId = null,
}) {
  const { conditions, params } = buildConditions({
    attendanceDate,
    subjectType,
    sessionType,

    search,

    attendanceStatus,
    timingStatus,

    courseId,
    platoonId,

    categoryId,
    branchId,
  });

  const whereClause = conditions.join(" AND ");

  const [rows] = await pool.query(
    `
        ${ATTENDANCE_SELECT}

        WHERE
          ${whereClause}

        ORDER BY
          CASE
            WHEN ar.employee_id REGEXP '^[0-9]+$'
              THEN 0
            ELSE 1
          END,

          CAST(
            ar.employee_id
            AS UNSIGNED
          ) ASC,

          ar.employee_id ASC,

          ar.id ASC
      `,
    params,
  );

  return Array.isArray(rows) ? rows : [];
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

async function getAttendanceReportExport(filters) {
  const pageSize = 500;

  const firstPage = await getAttendanceReport({
    ...filters,

    page: 1,

    pageSize,
  });

  const allRows = [...(firstPage.rows || [])];

  const totalPages = Number(firstPage.pagination?.totalPages) || 0;

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await getAttendanceReport({
      ...filters,

      page,

      pageSize,
    });

    allRows.push(...(result.rows || []));
  }

  return allRows;
}

/*
|--------------------------------------------------------------------------
| LONG WEEKEND / DEPARTURE REPORT
|--------------------------------------------------------------------------
*/

function buildLongWeekendConditions({
  attendanceDate,
  search = "",
  attendanceStatus = null,
  courseId = null,
  platoonId = null,
}) {
  const conditions = ["DATE(wda.departure_date) = :attendanceDate"];

  const params = {
    attendanceDate,
  };

  const cleanSearch = String(search || "")
    .trim()
    .slice(0, 150);

  if (cleanSearch) {
    conditions.push(`
      (
        t.employee_id LIKE :search
        OR t.first_name LIKE :search
        OR t.last_name LIKE :search
        OR CONCAT_WS(
             ' ',
             t.first_name,
             t.last_name
           ) LIKE :search
        OR aw.weekend_name LIKE :search
      )
    `);

    params.search = `%${cleanSearch}%`;
  }

  if (attendanceStatus) {
    conditions.push("wda.attendance_status = :attendanceStatus");

    params.attendanceStatus = String(attendanceStatus).trim().toUpperCase();
  }

  if (courseId) {
    conditions.push("t.course_id = :courseId");

    params.courseId = Number(courseId);
  }

  if (platoonId) {
    conditions.push("t.platoon_id = :platoonId");

    params.platoonId = Number(platoonId);
  }

  return {
    conditions,
    params,
  };
}

const LONG_WEEKEND_FROM = `
  FROM weekend_departure_attendance wda

  INNER JOIN attendance_weekends aw
    ON aw.id =
       wda.weekend_id

  INNER JOIN trainees t
    ON t.id =
       wda.trainee_id

  LEFT JOIN courses c
    ON c.id =
       t.course_id

  LEFT JOIN platoons p
    ON p.id =
       t.platoon_id
`;

const LONG_WEEKEND_SELECT = `
  SELECT
    wda.id,

    DATE(
      wda.departure_date
    )
      AS attendance_date,

    'TRAINEE'
      AS subject_type,

    t.id
      AS subject_id,

    t.employee_id,

    TRIM(
      CONCAT_WS(
        ' ',
        t.first_name,
        t.last_name
      )
    )
      AS subject_name,

    t.course_id,
    c.course_name,
    c.course_code,

    t.platoon_id,
    p.platoon_number,
    p.platoon_name,

    wda.weekend_id,
    aw.weekend_name,

    aw.start_datetime
      AS weekend_start_datetime,

    aw.end_datetime
      AS weekend_end_datetime,

    wda.departure_date,

    wda.window_start,
    wda.window_end,

    wda.punch_transaction_id
      AS transaction_id,

    wda.punch_time
      AS selected_punch,

    wda.punch_time,

    'DEPARTURE'
      AS punch_state,

    wda.attendance_status,

    NULL
      AS timing_status,

    NULL
      AS timing_minutes,

    CASE
      WHEN
        wda.attendance_status =
          'DETAINED'
      THEN
        'WEEKEND_DETAIN'
      ELSE
        NULL
    END
      AS exemption_type,

    CASE
      WHEN
        wda.attendance_status =
          'DETAINED'
      THEN
        'Weekend Detain'
      ELSE
        NULL
    END
      AS exemption_description,

    0
      AS has_manual_absence,

    NULL
      AS manual_absence_data,

    NULL
      AS timetable_name,

    wda.window_start,
    wda.window_end,

    wda.calculated_at
      AS processed_at

  ${LONG_WEEKEND_FROM}
`;

async function getLongWeekendReport({
  attendanceDate,
  search = "",
  attendanceStatus = null,
  courseId = null,
  platoonId = null,
  page = 1,
  pageSize = 50,
}) {
  const normalizedPage = Math.max(1, Number(page) || 1);

  const normalizedPageSize = Math.min(500, Math.max(1, Number(pageSize) || 50));

  const offset = (normalizedPage - 1) * normalizedPageSize;

  const { conditions, params } = buildLongWeekendConditions({
    attendanceDate,
    search,
    attendanceStatus,
    courseId,
    platoonId,
  });

  const whereClause = conditions.join(" AND ");

  const [rowsResult, countResult, summaryResult] = await Promise.all([
    pool.query(
      `
          ${LONG_WEEKEND_SELECT}

          WHERE
            ${whereClause}

          ORDER BY
            CASE
              WHEN t.employee_id
                   REGEXP '^[0-9]+$'
                THEN 0
              ELSE 1
            END,

            CAST(
              t.employee_id
              AS UNSIGNED
            ) ASC,

            t.employee_id ASC,

            wda.id ASC

          LIMIT ${normalizedPageSize}
          OFFSET ${offset}
        `,
      params,
    ),

    pool.query(
      `
          SELECT
            COUNT(*)
              AS total

          ${LONG_WEEKEND_FROM}

          WHERE
            ${whereClause}
        `,
      params,
    ),

    pool.query(
      `
          SELECT
            COUNT(*)
              AS total,

            SUM(
              wda.attendance_status =
                'PRESENT'
            )
              AS present,

            SUM(
              wda.attendance_status =
                'ABSENT'
            )
              AS absent,

            SUM(
              wda.attendance_status =
                'DETAINED'
            )
              AS detained

          ${LONG_WEEKEND_FROM}

          WHERE
            ${whereClause}
        `,
      params,
    ),
  ]);

  const rows = rowsResult[0] || [];

  const total = Number(countResult[0]?.[0]?.total || 0);

  const summaryRow = summaryResult[0]?.[0] || {};

  return {
    rows,

    pagination: {
      page: normalizedPage,

      pageSize: normalizedPageSize,

      total,

      totalPages: total > 0 ? Math.ceil(total / normalizedPageSize) : 0,
    },

    summary: {
      total: Number(summaryRow.total || 0),

      present: Number(summaryRow.present || 0),

      absent: Number(summaryRow.absent || 0),

      exempt: Number(summaryRow.detained || 0),

      detained: Number(summaryRow.detained || 0),

      no_timetable: 0,

      in_time: 0,

      early: 0,

      late: 0,

      manual_absence: 0,
    },
  };
}

async function getLongWeekendReportExport(filters) {
  const pageSize = 500;

  const firstPage = await getLongWeekendReport({
    ...filters,

    page: 1,

    pageSize,
  });

  const allRows = [...(firstPage.rows || [])];

  const totalPages = Number(firstPage.pagination?.totalPages) || 0;

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await getLongWeekendReport({
      ...filters,

      page,

      pageSize,
    });

    allRows.push(...(result.rows || []));
  }

  return allRows;
}


/*
|--------------------------------------------------------------------------
| CONTINUOUS ABSENCE REPORT
|--------------------------------------------------------------------------
|
| One row = one continuous absence episode.
|
| OPEN:
|   No biometric return punch yet.
|   Period keeps increasing.
|
| RETURNED:
|   Genuine biometric return punch received.
|   Period remains permanently frozen.
|
| Date From / Date To use interval-overlap logic:
|
|   absence started before report end
|   AND
|   return is null OR return happened after report start
|
| This means a person absent across several days remains visible for every
| report period that overlaps that absence.
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

function buildContinuousAbsenceConditions({
  dateFrom,
  dateTo,

  subjectType = null,
  status = null,

  search = "",

  courseId = null,
  platoonId = null,

  categoryId = null,
  branchId = null,
}) {
  const conditions = [
    /*
    | Continuous Absence reports expose only OPEN / genuine biometric RETURNED
    | episodes. Administrative Repatriate closures are filtered separately
    | below and remain hidden from counts, rows and exports.
    */
    "ae.status IN ('OPEN', 'RETURNED')",

    /* Current ACTIVE Repatriate is never a Continuous Absence case. */
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
    | Hide administrative operational closures from Continuous Absence history.
    | Leave / Home Rest / OSD / Repatriate can end an OPEN episode without a
    | biometric return transaction. Genuine biometric RETURNED episodes always
    | carry return_transaction_id and remain available in Returned history.
    */
    `
      NOT
      (
        ae.status = 'RETURNED'
        AND ae.return_transaction_id IS NULL
      )
    `,

    `
      ae.absent_from <
      DATE_ADD(
        CAST(:dateTo AS DATE),
        INTERVAL 1 DAY
      )
    `,

    `
      (
        ae.return_punch_at IS NULL

        OR

        ae.return_punch_at >=
          CAST(:dateFrom AS DATE)
      )
    `,

    /*
    | Never report orphan continuous-absence history for a Portal identity that
    | has been permanently/soft deleted. This keeps Report Open counts aligned
    | with the live Dashboard roster.
    */
    `
      (
        (
          ae.subject_type = 'TRAINEE'
          AND t.id IS NOT NULL
          AND t.is_deleted = 0
        )

        OR

        (
          ae.subject_type = 'STAFF'
          AND s.id IS NOT NULL
          AND s.is_deleted = 0
        )
      )
    `,
  ];

  const params = {
    dateFrom,
    dateTo,
  };


  if (subjectType) {
    conditions.push(
      "ae.subject_type = :subjectType"
    );

    params.subjectType =
      String(
        subjectType
      )
        .trim()
        .toUpperCase();
  }


  if (status) {
    conditions.push(
      "ae.status = :status"
    );

    params.status =
      String(
        status
      )
        .trim()
        .toUpperCase();
  }


  const cleanSearch =
    String(
      search ||
      ""
    )
      .trim()
      .slice(
        0,
        150
      );


  if (cleanSearch) {
    conditions.push(`
      (
        ae.employee_id LIKE :search

        OR t.first_name LIKE :search
        OR t.last_name LIKE :search

        OR CONCAT_WS(
             ' ',
             t.first_name,
             t.last_name
           ) LIKE :search

        OR s.first_name LIKE :search
        OR s.last_name LIKE :search

        OR CONCAT_WS(
             ' ',
             s.first_name,
             s.last_name
           ) LIKE :search

        OR c.course_name LIKE :search
        OR p.platoon_number LIKE :search
        OR p.platoon_name LIKE :search

        OR sc.category_name LIKE :search
        OR sb.branch_name LIKE :search
      )
    `);

    params.search =
      `%${cleanSearch}%`;
  }


  if (courseId) {
    conditions.push(
      `
        ae.subject_type = 'TRAINEE'

        AND

        t.course_id = :courseId
      `
    );

    params.courseId =
      Number(
        courseId
      );
  }


  if (platoonId) {
    conditions.push(
      `
        ae.subject_type = 'TRAINEE'

        AND

        t.platoon_id = :platoonId
      `
    );

    params.platoonId =
      Number(
        platoonId
      );
  }


  if (categoryId) {
    conditions.push(
      `
        ae.subject_type = 'STAFF'

        AND

        s.category_id = :categoryId
      `
    );

    params.categoryId =
      Number(
        categoryId
      );
  }


  if (branchId) {
    conditions.push(
      `
        ae.subject_type = 'STAFF'

        AND

        s.branch_id = :branchId
      `
    );

    params.branchId =
      Number(
        branchId
      );
  }


  return {
    conditions,
    params,
  };
}


const CONTINUOUS_ABSENCE_FROM = `
  FROM absence_episodes ae

  LEFT JOIN trainees t
    ON ae.subject_type = 'TRAINEE'
    AND t.id = ae.subject_id

  LEFT JOIN courses c
    ON c.id = t.course_id

  LEFT JOIN platoons p
    ON p.id = t.platoon_id

  LEFT JOIN staff s
    ON ae.subject_type = 'STAFF'
    AND s.id = ae.subject_id

  LEFT JOIN staff_categories sc
    ON sc.id = s.category_id

  LEFT JOIN staff_branches sb
    ON sb.id = s.branch_id
`;


const CONTINUOUS_ABSENCE_SELECT = `
  SELECT
    ae.id,

    ae.subject_type,
    ae.subject_id,
    ae.employee_id,

    s.belt_no AS belt_no,

    CASE

      WHEN
        ae.subject_type =
          'TRAINEE'

      THEN
        NULLIF(
          TRIM(
            CONCAT_WS(
              ' ',
              t.first_name,
              t.last_name
            )
          ),
          ''
        )

      ELSE
        NULLIF(
          TRIM(
            CONCAT_WS(
              ' ',
              s.first_name,
              s.last_name
            )
          ),
          ''
        )

    END
      AS subject_name,


    t.course_id,
    c.course_name,
    c.course_code,

    t.platoon_id,
    p.platoon_number,
    p.platoon_name,


    s.category_id,
    sc.category_name,

    s.branch_id,
    sb.branch_name,


    ae.absent_from,

    ae.return_punch_at,

    ae.return_transaction_id,

    ae.status,

    ae.missed_session_count,


    ae.start_source_type,
    ae.start_session_type,

    ae.start_context_type,
    ae.start_context_id,
    ae.start_context_name,


    ae.last_missed_at,
    ae.last_source_type,
    ae.last_session_type,


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
      AS period_seconds,


    ae.created_at,
    ae.updated_at

  ${CONTINUOUS_ABSENCE_FROM}
`;


async function getContinuousAbsenceReport({
  dateFrom,
  dateTo,

  subjectType = null,
  status = null,

  search = "",

  courseId = null,
  platoonId = null,

  categoryId = null,
  branchId = null,

  page = 1,
  pageSize = 50,
}) {
  await closeOpenAbsencesForActiveRepatriates();

  const normalizedPage =
    Math.max(
      1,
      Number(
        page
      ) ||
      1
    );


  const normalizedPageSize =
    Math.min(
      500,

      Math.max(
        1,

        Number(
          pageSize
        ) ||
        50
      )
    );


  const offset =
    (
      normalizedPage -
      1
    ) *
    normalizedPageSize;


  const {
    conditions,
    params,
  } =
    buildContinuousAbsenceConditions({
      dateFrom,
      dateTo,

      subjectType,
      status,

      search,

      courseId,
      platoonId,

      categoryId,
      branchId,
    });

  /*
  |--------------------------------------------------------------------------
  | CURRENT-DATE OPEN = SAME CANONICAL SOURCE AS DASHBOARD
  |--------------------------------------------------------------------------
  |
  | getOpenAbsences() is the single LIVE actionable-absence source. It removes
  | people who are currently sanctioned under Leave/Home Rest, OSD/Permission,
  | valid Long Weekend, or Staff Duty Rest, while preserving episode history.
  |
  | If the requested report period includes PTS today, every OPEN row/count in
  | this report must be restricted to that exact live source. RETURNED history
  | remains untouched. This prevents Dashboard Absent and Report Open/Ongoing
  | from drifting apart again.
  |--------------------------------------------------------------------------
  */

  const ptsToday =
    new Date(
      Date.now() +
        5 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);

  const normalizedDateFrom =
    String(dateFrom || "")
      .trim()
      .slice(0, 10);

  const normalizedDateTo =
    String(dateTo || "")
      .trim()
      .slice(0, 10);

  const normalizedStatus =
    status
      ? String(status)
          .trim()
          .toUpperCase()
      : null;

  const includesPtsToday =
    /^\d{4}-\d{2}-\d{2}$/.test(
      normalizedDateFrom
    ) &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      normalizedDateTo
    ) &&
    normalizedDateFrom <=
      ptsToday &&
    normalizedDateTo >=
      ptsToday;

  if (
    includesPtsToday &&
    normalizedStatus !==
      "RETURNED"
  ) {
    const liveOpenRows =
      await getOpenAbsences({
        subjectType:
          subjectType ||
          null,
      });

    const liveOpenIds =
      [
        ...new Set(
          (liveOpenRows || [])
            .map(
              (row) =>
                Number(row?.id)
            )
            .filter(
              (id) =>
                Number.isInteger(id) &&
                id > 0
            )
        ),
      ];

    if (liveOpenIds.length) {
      const placeholders =
        liveOpenIds.map(
          (_, index) => {
            const key =
              `liveOpenEpisodeId${index}`;

            params[key] =
              liveOpenIds[index];

            return `:${key}`;
          }
        );

      conditions.push(
        `(
          ae.status <> 'OPEN'
          OR ae.id IN (${placeholders.join(",")})
        )`
      );
    } else {
      conditions.push(
        "ae.status <> 'OPEN'"
      );
    }
  }


  const whereClause =
    conditions.join(
      " AND "
    );


  const [
    rowsResult,
    countResult,
    summaryResult,
  ] =
    await Promise.all([
      pool.query(
        `
          ${CONTINUOUS_ABSENCE_SELECT}

          WHERE
            ${whereClause}

          ORDER BY
            ae.absent_from DESC,

            ae.employee_id ASC,

            ae.id DESC

          LIMIT ${normalizedPageSize}
          OFFSET ${offset}
        `,
        params
      ),


      pool.query(
        `
          SELECT
            COUNT(*)
              AS total

          ${CONTINUOUS_ABSENCE_FROM}

          WHERE
            ${whereClause}
        `,
        params
      ),


      pool.query(
        `
          SELECT
            COUNT(*)
              AS total,

            COALESCE(
              SUM(
                ae.status =
                  'OPEN'
              ),
              0
            )
              AS open_count,

            COALESCE(
              SUM(
                ae.status =
                  'RETURNED'
              ),
              0
            )
              AS returned_count

          ${CONTINUOUS_ABSENCE_FROM}

          WHERE
            ${whereClause}
        `,
        params
      ),
    ]);


  const rows =
    rowsResult[0] ||
    [];


  const total =
    Number(
      countResult[0]?.[0]
        ?.total ||
      0
    );


  const summaryRow =
    summaryResult[0]?.[0] ||
    {};


  return {
    rows,

    pagination: {
      page:
        normalizedPage,

      pageSize:
        normalizedPageSize,

      total,

      totalPages:
        total > 0
          ? Math.ceil(
              total /
              normalizedPageSize
            )
          : 0,
    },

    summary: {
      total:
        Number(
          summaryRow.total ||
          0
        ),

      open:
        Number(
          summaryRow.open_count ||
          0
        ),

      returned:
        Number(
          summaryRow.returned_count ||
          0
        ),
    },
  };
}


async function getContinuousAbsenceReportExport(
  filters
) {
  const pageSize =
    500;


  const firstPage =
    await getContinuousAbsenceReport({
      ...filters,

      page:
        1,

      pageSize,
    });


  const allRows = [
    ...(
      firstPage.rows ||
      []
    ),
  ];


  const totalPages =
    Number(
      firstPage
        .pagination
        ?.totalPages
    ) ||
    0;


  for (
    let page = 2;

    page <=
      totalPages;

    page += 1
  ) {
    const result =
      await getContinuousAbsenceReport({
        ...filters,

        page,

        pageSize,
      });


    allRows.push(
      ...(
        result.rows ||
        []
      )
    );
  }


  return allRows;
}

/*
|--------------------------------------------------------------------------
| CUSTOM SHIFT DUTY REPORT
|--------------------------------------------------------------------------
|
| Historical safety:
| - Report reads only persisted custom_shift_attendance rows.
| - It does NOT recalculate an old date while viewing/exporting the report.
| - Group/Shift configuration becomes non-destructively editable once
|   attendance exists, so these joins remain stable for official history.
|
| One row = one Staff assignment for one Custom Shift attendance date.
|--------------------------------------------------------------------------
*/

function buildCustomShiftReportConditions({
  attendanceDate,
  search = "",
  attendanceStatus = null,
  groupId = null,
  shiftId = null,
  categoryId = null,
  branchId = null,
}) {
  const conditions = [
    "csa.attendance_date = :attendanceDate",
    "s.is_deleted = 0",
    CUSTOM_SHIFT_ACTIVE_VERSION_FILTER,
  ];

  const params = {
    attendanceDate,
  };

  const cleanSearch = String(search || "").trim().slice(0, 150);

  if (cleanSearch) {
    conditions.push(`
      (
        s.employee_id LIKE :search
        OR s.belt_no LIKE :search
        OR CONCAT_WS(' ', s.first_name, s.last_name) LIKE :search
        OR csg.group_name LIKE :search
        OR csd.shift_name LIKE :search
        OR csd.duty_point_name LIKE :search
      )
    `);

    params.search = `%${cleanSearch}%`;
  }

  if (attendanceStatus) {
    conditions.push("csa.attendance_status = :attendanceStatus");
    params.attendanceStatus = String(attendanceStatus).trim().toUpperCase();
  }

  if (groupId) {
    conditions.push("csa.group_id = :groupId");
    params.groupId = Number(groupId);
  }

  if (shiftId) {
    conditions.push("csa.shift_id = :shiftId");
    params.shiftId = Number(shiftId);
  }

  if (categoryId) {
    conditions.push("s.category_id = :categoryId");
    params.categoryId = Number(categoryId);
  }

  if (branchId) {
    conditions.push("s.branch_id = :branchId");
    params.branchId = Number(branchId);
  }

  return {
    conditions,
    params,
  };
}

/*
| Backdated edits preserve old rows and shift/assignment FKs for audit.
| If a newer active Custom Shift version has already calculated attendance
| for this Staff/day, suppress rows from superseded versions in ordinary
| totals and exports. Until then show the last saved historical row rather
| than inventing a zero count.
*/
const CUSTOM_SHIFT_ACTIVE_VERSION_FILTER = `
  NOT EXISTS (
    SELECT 1
    FROM custom_shift_attendance replacement
    INNER JOIN custom_shift_groups replacement_group
      ON replacement_group.id = replacement.group_id
    WHERE replacement.staff_id = csa.staff_id
      AND replacement.attendance_date = csa.attendance_date
      AND replacement.group_id <> csa.group_id
      AND replacement_group.is_active = 1
      AND replacement.attendance_date
          BETWEEN replacement_group.start_date AND replacement_group.end_date
      AND (
        csg.is_active = 0
        OR csa.attendance_date NOT BETWEEN csg.start_date AND csg.end_date
      )
  )
`;

const CUSTOM_SHIFT_REPORT_FROM = `
  FROM custom_shift_attendance csa

  INNER JOIN custom_shift_groups csg
    ON csg.id = csa.group_id

  INNER JOIN custom_shift_definitions csd
    ON csd.id = csa.shift_id

  LEFT JOIN custom_shift_assignments cassign
    ON cassign.id = csa.assignment_id

  INNER JOIN staff s
    ON s.id = csa.staff_id

  LEFT JOIN staff_categories sc
    ON sc.id = s.category_id

  LEFT JOIN staff_branches sb
    ON sb.id = s.branch_id
`;

const CUSTOM_SHIFT_REPORT_SELECT = `
  SELECT
    csa.id,

    DATE(csa.attendance_date) AS attendance_date,

    'STAFF' AS subject_type,
    s.id AS subject_id,
    s.id AS staff_id,

    s.employee_id,
    s.belt_no,

    TRIM(
      CONCAT_WS(
        ' ',
        s.first_name,
        s.last_name
      )
    ) AS subject_name,

    s.designation,

    s.category_id,
    sc.category_name,

    s.branch_id,
    sb.branch_name,

    csa.group_id,
    csg.group_name,

    csa.shift_id,
    csd.shift_name,
    csd.duty_point_name,

    csd.start_time,
    csd.end_time,

    cassign.effective_from,
    cassign.effective_to,

    csa.start_window_from,
    csa.start_window_to,
    csa.end_window_from,
    csa.end_window_to,

    csa.start_transaction_id,
    csa.start_punch_time,

    csa.end_transaction_id,
    csa.end_punch_time,

    csa.attendance_status,
    csa.checkout_status,

    csa.exemption_type,
    csa.exemption_record_id,
    csa.exemption_description,

    csa.calculated_at,
    csa.recalculated_at,
    csa.created_at,
    csa.updated_at

  ${CUSTOM_SHIFT_REPORT_FROM}
`;

async function getCustomShiftReportFilters(attendanceDate = null) {
  const params = {};

  if (attendanceDate) {
    params.attendanceDate = attendanceDate;
  }

  const [groups, shifts] = await Promise.all([
    safeLookup(
      "Custom Shift Report Groups",
      `
        SELECT DISTINCT
          csg.id,
          csg.group_name

        FROM custom_shift_attendance csa

        INNER JOIN custom_shift_groups csg
          ON csg.id = csa.group_id

        WHERE ${attendanceDate ? 'csa.attendance_date = :attendanceDate AND' : ''}
          ${CUSTOM_SHIFT_ACTIVE_VERSION_FILTER}

        ORDER BY csg.group_name ASC, csg.id ASC
      `,
      params,
    ),

    safeLookup(
      "Custom Shift Report Shifts",
      `
        SELECT DISTINCT
          csd.id,
          csd.group_id,
          csd.shift_name,
          csd.duty_point_name,
          csd.start_time,
          csd.end_time

        FROM custom_shift_attendance csa

        INNER JOIN custom_shift_definitions csd
          ON csd.id = csa.shift_id
        INNER JOIN custom_shift_groups csg
          ON csg.id = csa.group_id

        WHERE ${attendanceDate ? 'csa.attendance_date = :attendanceDate AND' : ''}
          ${CUSTOM_SHIFT_ACTIVE_VERSION_FILTER}

        ORDER BY
          csd.group_id ASC,
          csd.sort_order ASC,
          csd.id ASC
      `,
      params,
    ),
  ]);

  return {
    groups,
    shifts,
  };
}

async function getCustomShiftReport({
  attendanceDate,
  search = "",
  attendanceStatus = null,
  groupId = null,
  shiftId = null,
  categoryId = null,
  branchId = null,
  page = 1,
  pageSize = 50,
}) {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const normalizedPageSize = Math.min(500, Math.max(1, Number(pageSize) || 50));
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const { conditions, params } = buildCustomShiftReportConditions({
    attendanceDate,
    search,
    attendanceStatus,
    groupId,
    shiftId,
    categoryId,
    branchId,
  });

  const whereClause = conditions.join(" AND ");

  const [rowsResult, countResult, summaryResult] = await Promise.all([
    pool.query(
      `
        ${CUSTOM_SHIFT_REPORT_SELECT}

        WHERE ${whereClause}

        ORDER BY
          csg.group_name ASC,
          csd.sort_order ASC,
          csd.id ASC,
          CASE
            WHEN s.employee_id REGEXP '^[0-9]+$' THEN 0
            ELSE 1
          END,
          CAST(s.employee_id AS UNSIGNED) ASC,
          s.employee_id ASC,
          csa.id ASC

        LIMIT ${normalizedPageSize}
        OFFSET ${offset}
      `,
      params,
    ),

    pool.query(
      `
        SELECT COUNT(*) AS total

        ${CUSTOM_SHIFT_REPORT_FROM}

        WHERE ${whereClause}
      `,
      params,
    ),

    pool.query(
      `
        SELECT
          COUNT(*) AS total,

          SUM(csa.attendance_status = 'PRESENT') AS present,
          SUM(csa.attendance_status = 'ABSENT') AS absent,
          SUM(csa.attendance_status = 'EXEMPT') AS exempt,
          SUM(csa.attendance_status = 'PENDING') AS pending,

          SUM(csa.checkout_status = 'CHECKED_OUT') AS checked_out,
          SUM(csa.checkout_status = 'MISSING') AS missing_checkout,
          SUM(csa.checkout_status = 'PENDING') AS pending_checkout

        ${CUSTOM_SHIFT_REPORT_FROM}

        WHERE ${whereClause}
      `,
      params,
    ),
  ]);

  const rows = rowsResult[0] || [];
  const total = Number(countResult[0]?.[0]?.total || 0);
  const summaryRow = summaryResult[0]?.[0] || {};

  return {
    rows,

    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / normalizedPageSize) : 0,
    },

    summary: {
      total: Number(summaryRow.total || 0),
      present: Number(summaryRow.present || 0),
      absent: Number(summaryRow.absent || 0),
      exempt: Number(summaryRow.exempt || 0),
      pending: Number(summaryRow.pending || 0),
      checked_out: Number(summaryRow.checked_out || 0),
      missing_checkout: Number(summaryRow.missing_checkout || 0),
      pending_checkout: Number(summaryRow.pending_checkout || 0),
    },
  };
}

async function getCustomShiftReportExport(filters) {
  const pageSize = 500;

  const firstPage = await getCustomShiftReport({
    ...filters,
    page: 1,
    pageSize,
  });

  const allRows = [...(firstPage.rows || [])];
  const totalPages = Number(firstPage.pagination?.totalPages) || 0;

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await getCustomShiftReport({
      ...filters,
      page,
      pageSize,
    });

    allRows.push(...(result.rows || []));
  }

  return allRows;
}

module.exports = {
  getAttendanceReportFilters,

  getAttendanceReport,

  getAttendanceReportAllRows,

  getAttendanceReportExport,

  getLongWeekendReport,
  getLongWeekendReportExport,

  getContinuousAbsenceReport,
  getContinuousAbsenceReportExport,

  getCustomShiftReportFilters,
  getCustomShiftReport,
  getCustomShiftReportExport,
};
