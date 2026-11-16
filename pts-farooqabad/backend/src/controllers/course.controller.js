const { pool } = require("../config/db");

const { logRequestAudit } = require("../services/audit.service");

const {
  queueCourseLifecycleReconcile,
} = require("../jobs/courseLifecycle.job");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid Course Date.");
    }

    return [
      value.getFullYear(),

      pad(value.getMonth() + 1),

      pad(value.getDate()),
    ].join("-");
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }

  return text;
}

function createHttpError(statusCode, message, details = null) {
  const error = new Error(message);

  error.statusCode = statusCode;

  error.details = details;

  return error;
}

/*
|--------------------------------------------------------------------------
| COURSE DATE VALIDATION
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Course WITHOUT dates is allowed.
|
| Valid:
|   start = NULL
|   end   = NULL
|
| Valid:
|   start = 2026-09-01
|   end   = 2026-12-01
|
| Invalid:
|   only one date supplied
|
|--------------------------------------------------------------------------
*/

function validateCourseDates(startDate, endDate) {
  const start = normalizeDate(startDate);

  const end = normalizeDate(endDate);

  if ((start && !end) || (!start && end)) {
    throw new Error(
      "Both Course Start Date and End Date are required when Course dates are being set.",
    );
  }

  if (start && end && end < start) {
    throw new Error(
      "Course End Date cannot be earlier than Course Start Date.",
    );
  }

  return {
    startDate: start,

    endDate: end,
  };
}

/*
|--------------------------------------------------------------------------
| COURSE STATUS SQL
|--------------------------------------------------------------------------
|
| Course lifecycle source of truth = Course Dates
|
| DATE_NOT_SET
| UPCOMING
| ACTIVE
| COMPLETED
|
|--------------------------------------------------------------------------
*/

const COURSE_STATUS_SQL = `
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
      BETWEEN c.start_date
      AND c.end_date
      THEN 'ACTIVE'

    WHEN
      DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) > c.end_date
      THEN 'COMPLETED'

    ELSE 'DATE_NOT_SET'
  END
`;

/*
|--------------------------------------------------------------------------
| AUDIT HELPERS
|--------------------------------------------------------------------------
*/

function buildCourseAuditState(course) {
  if (!course) {
    return null;
  }

  return {
    course_name: course.course_name || null,

    course_code: course.course_code || null,

    start_date: normalizeDate(course.start_date),

    end_date: normalizeDate(course.end_date),

    course_status: course.course_status || null,

    legacy_is_active: Boolean(
      Number(course.is_active ?? course.legacy_is_active ?? 0),
    ),

    zkbiotime_department_id: course.zkbiotime_department_id || null,

    zkbiotime_dept_code: course.zkbiotime_dept_code || null,
  };
}

function buildEmptyCourseAuditState() {
  return {
    course_name: null,

    course_code: null,

    start_date: null,

    end_date: null,

    course_status: null,

    legacy_is_active: null,

    zkbiotime_department_id: null,

    zkbiotime_dept_code: null,
  };
}

async function writeCourseAudit({
  req,

  action,

  courseId,

  description,

  oldData = null,

  newData = null,
}) {
  return logRequestAudit(req, {
    action,

    module: "COURSE",

    recordId: courseId,

    description,

    oldData: oldData
      ? buildCourseAuditState(oldData)
      : buildEmptyCourseAuditState(),

    newData: newData ? buildCourseAuditState(newData) : null,
  });
}

/*
|--------------------------------------------------------------------------
| FIND COURSE BY NAME
|--------------------------------------------------------------------------
*/

async function findCourseByName(courseName, excludeId = null) {
  const cleanName = cleanText(courseName);

  if (!cleanName) {
    return null;
  }

  const params = {
    courseName: cleanName,
  };

  let excludeSql = "";

  if (excludeId) {
    excludeSql = "AND id <> :excludeId";

    params.excludeId = Number(excludeId);
  }

  const [rows] = await pool.query(
    `
        SELECT
          *

        FROM courses

        WHERE
          LOWER(
            TRIM(course_name)
          ) =
          LOWER(
            TRIM(:courseName)
          )

          ${excludeSql}

        LIMIT 1
      `,
    params,
  );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| GET COURSE
|--------------------------------------------------------------------------
*/

async function getCourseById(courseId) {
  const [rows] = await pool.query(
    `
        SELECT
          c.*,

          ${COURSE_STATUS_SQL}
            AS course_status

        FROM courses c

        WHERE
          c.id =
            :courseId

        LIMIT 1
      `,
    {
      courseId: Number(courseId),
    },
  );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| COURSE TEMPORAL HISTORY
|--------------------------------------------------------------------------
|
| This protects existing Course-linked temporal history when Course dates
| are edited.
|
| Protected modules:
|
| - Attendance
| - Leave / Emergency Leave
| - OSD / Short Permission
| - Outdoor
| - Medical Rest
| - Home Rest
| - Manual Absence
| - Training Drop / Rejoin
|
| Cancelled / rejected administrative records do not constrain Course dates.
|
|--------------------------------------------------------------------------
*/

async function getCourseTemporalHistory(courseId) {
  const [rows] = await pool.query(
    `
        SELECT
          history.source,

          COUNT(*)
            AS record_count,

          MIN(
            history.start_date
          )
            AS earliest_date,

          MAX(
            COALESCE(
              history.end_date,
              history.start_date
            )
          )
            AS latest_date

        FROM
        (
          /*
          |--------------------------------------------------------------------------
          | ATTENDANCE
          |--------------------------------------------------------------------------
          */

          SELECT
            'ATTENDANCE'
              AS source,

            ar.attendance_date
              AS start_date,

            ar.attendance_date
              AS end_date

          FROM attendance_records ar

          JOIN trainees t
            ON
              ar.subject_type =
              'TRAINEE'

            AND
              t.id =
              ar.subject_id

          WHERE
            t.course_id =
              :courseId


          UNION ALL


          /*
          |--------------------------------------------------------------------------
          | LEAVE / EMERGENCY LEAVE
          |--------------------------------------------------------------------------
          */

          SELECT
            'LEAVE'
              AS source,

            DATE(
              l.start_datetime
            )
              AS start_date,

            DATE(
              l.end_datetime
            )
              AS end_date

          FROM trainee_leaves l

          JOIN trainees t
            ON
              t.id =
              l.trainee_id

          WHERE
            t.course_id =
              :courseId

            AND
            COALESCE(
              UPPER(
                TRIM(
                  l.workflow_status
                )
              ),
              ''
            )
            NOT IN
            (
              'CANCELLED',
              'REJECTED'
            )


          UNION ALL


          /*
          |--------------------------------------------------------------------------
          | OSD / SHORT PERMISSION
          |--------------------------------------------------------------------------
          */

          SELECT
            'OSD_PERMISSION'
              AS source,

            DATE(
              o.start_datetime
            )
              AS start_date,

            DATE(
              o.end_datetime
            )
              AS end_date

          FROM trainee_osd o

          JOIN trainees t
            ON
              t.id =
              o.trainee_id

          WHERE
            t.course_id =
              :courseId

            AND
            COALESCE(
              UPPER(
                TRIM(
                  o.workflow_status
                )
              ),
              ''
            ) <>
            'CANCELLED'


          UNION ALL


          /*
          |--------------------------------------------------------------------------
          | OUTDOOR
          |--------------------------------------------------------------------------
          */

          SELECT
            'OUTDOOR'
              AS source,

            DATE(
              ou.start_datetime
            )
              AS start_date,

            DATE(
              ou.end_datetime
            )
              AS end_date

          FROM trainee_outdoor ou

          JOIN trainees t
            ON
              t.id =
              ou.trainee_id

          WHERE
            t.course_id =
              :courseId

            AND
            COALESCE(
              UPPER(
                TRIM(
                  ou.workflow_status
                )
              ),
              ''
            ) <>
            'CANCELLED'

            AND
            ou.start_datetime
              IS NOT NULL

            AND
            ou.end_datetime
              IS NOT NULL


          UNION ALL


          /*
          |--------------------------------------------------------------------------
          | MEDICAL REST
          |--------------------------------------------------------------------------
          */

          SELECT
            'MEDICAL_REST'
              AS source,

            DATE(
              ou.medical_rest_start
            )
              AS start_date,

            DATE(
              ou.medical_rest_end
            )
              AS end_date

          FROM trainee_outdoor ou

          JOIN trainees t
            ON
              t.id =
              ou.trainee_id

          WHERE
            t.course_id =
              :courseId

            AND
            COALESCE(
              UPPER(
                TRIM(
                  ou.workflow_status
                )
              ),
              ''
            ) <>
            'CANCELLED'

            AND
            ou.medical_rest =
              1

            AND
            ou.medical_rest_start
              IS NOT NULL

            AND
            ou.medical_rest_end
              IS NOT NULL


          UNION ALL


          /*
          |--------------------------------------------------------------------------
          | HOME REST
          |--------------------------------------------------------------------------
          */

          SELECT
            'HOME_REST'
              AS source,

            DATE(
              ou.home_rest_start
            )
              AS start_date,

            DATE(
              ou.home_rest_end
            )
              AS end_date

          FROM trainee_outdoor ou

          JOIN trainees t
            ON
              t.id =
              ou.trainee_id

          WHERE
            t.course_id =
              :courseId

            AND
            COALESCE(
              UPPER(
                TRIM(
                  ou.workflow_status
                )
              ),
              ''
            ) <>
            'CANCELLED'

            AND
            ou.home_rest =
              1

            AND
            ou.home_rest_start
              IS NOT NULL

            AND
            ou.home_rest_end
              IS NOT NULL


          UNION ALL


          /*
          |--------------------------------------------------------------------------
          | MANUAL ABSENCE
          |--------------------------------------------------------------------------
          */

          SELECT
            'MANUAL_ABSENCE'
              AS source,

            DATE(
              ma.start_datetime
            )
              AS start_date,

            DATE(
              ma.end_datetime
            )
              AS end_date

          FROM trainee_manual_absence ma

          JOIN trainees t
            ON
              t.id =
              ma.trainee_id

          WHERE
            t.course_id =
              :courseId

            AND
            COALESCE(
              UPPER(
                TRIM(
                  ma.record_status
                )
              ),
              ''
            ) <>
            'CANCELLED'


          UNION ALL


          /*
          |--------------------------------------------------------------------------
          | TRAINING DROP / REJOIN
          |--------------------------------------------------------------------------
          */

          SELECT
            'TRAINING_DROP'
              AS source,

            DATE(
              td.drop_datetime
            )
              AS start_date,

            DATE(
              COALESCE(
                td.rejoin_datetime,
                td.drop_datetime
              )
            )
              AS end_date

          FROM trainee_training_drop td

          JOIN trainees t
            ON
              t.id =
              td.trainee_id

          WHERE
            t.course_id =
              :courseId

            AND
            COALESCE(
              UPPER(
                TRIM(
                  td.drop_status
                )
              ),
              ''
            ) <>
            'CANCELLED'
        )
          AS history

        WHERE
          history.start_date
            IS NOT NULL

        GROUP BY
          history.source

        ORDER BY
          history.source ASC
      `,
    {
      courseId: Number(courseId),
    },
  );

  const sources = rows.map((row) => ({
    source: row.source,

    record_count: Number(row.record_count || 0),

    earliest_date: normalizeDate(row.earliest_date),

    latest_date: normalizeDate(row.latest_date),
  }));

  let earliestDate = null;

  let latestDate = null;

  let totalRecords = 0;

  for (const source of sources) {
    totalRecords += source.record_count;

    if (
      source.earliest_date &&
      (!earliestDate || source.earliest_date < earliestDate)
    ) {
      earliestDate = source.earliest_date;
    }

    if (
      source.latest_date &&
      (!latestDate || source.latest_date > latestDate)
    ) {
      latestDate = source.latest_date;
    }
  }

  return {
    has_history: totalRecords > 0,

    total_records: totalRecords,

    earliest_date: earliestDate,

    latest_date: latestDate,

    sources,
  };
}

/*
|--------------------------------------------------------------------------
| PROTECT TEMPORAL HISTORY
|--------------------------------------------------------------------------
|
| Safe examples:
|
| Old Course:
|   01-Sep -> 30-Nov
|
| Existing History:
|   10-Sep -> 20-Nov
|
| New Course:
|   05-Sep -> 25-Nov
|   ALLOWED
|
| New Course:
|   15-Sep -> 25-Nov
|   BLOCKED because 10-Sep history would be outside Course range.
|
|--------------------------------------------------------------------------
*/

async function assertCourseDateChangePreservesHistory({
  courseId,

  startDate,

  endDate,
}) {
  const history = await getCourseTemporalHistory(courseId);

  if (!history.has_history) {
    return history;
  }

  /*
  |--------------------------------------------------------------------------
  | CANNOT CLEAR DATES WHEN TEMPORAL HISTORY EXISTS
  |--------------------------------------------------------------------------
  */

  if (!startDate || !endDate) {
    throw createHttpError(
      409,

      `Course dates cannot be cleared because linked historical records already exist from ${history.earliest_date} to ${history.latest_date}.`,

      {
        history,
      },
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PROPOSED RANGE MUST CONTAIN ALL EXISTING HISTORY
  |--------------------------------------------------------------------------
  */

  const startsTooLate =
    history.earliest_date && history.earliest_date < startDate;

  const endsTooEarly = history.latest_date && history.latest_date > endDate;

  if (startsTooLate || endsTooEarly) {
    throw createHttpError(
      409,

      `Course dates cannot exclude existing linked history. Existing records span ${history.earliest_date} to ${history.latest_date}, while the proposed Course range is ${startDate} to ${endDate}.`,

      {
        proposed_course_range: {
          start_date: startDate,

          end_date: endDate,
        },

        history,
      },
    );
  }

  return history;
}

/*
|--------------------------------------------------------------------------
| CREATE COURSE RECORD
|--------------------------------------------------------------------------
|
| Used by manual Course creation AND automatic trainee master resolution.
|
| Date-less Course remains supported.
|
|--------------------------------------------------------------------------
*/

async function createCourseRecord({
  courseName,

  courseCode = null,

  startDate = null,

  endDate = null,
}) {
  const cleanName = cleanText(courseName);

  if (!cleanName) {
    throw new Error("Course Name is required.");
  }

  const dates = validateCourseDates(startDate, endDate);

  const existing = await findCourseByName(cleanName);

  if (existing) {
    return {
      course: await getCourseById(existing.id),

      created: false,
    };
  }

  const [result] = await pool.query(
    `
        INSERT INTO courses
        (
          course_name,
          course_code,
          start_date,
          end_date,
          is_active
        )

        VALUES
        (
          :courseName,
          :courseCode,
          :startDate,
          :endDate,

          CASE
            WHEN
              :startDateActive
                IS NOT NULL

              AND
              :endDateActive
                IS NOT NULL

              AND
              DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
              BETWEEN
                :startDateActive2
              AND
                :endDateActive2

              THEN 1

            ELSE 0
          END
        )
      `,
    {
      courseName: cleanName,

      courseCode: cleanText(courseCode),

      startDate: dates.startDate,

      endDate: dates.endDate,

      startDateActive: dates.startDate,

      endDateActive: dates.endDate,

      startDateActive2: dates.startDate,

      endDateActive2: dates.endDate,
    },
  );

  const course = await getCourseById(result.insertId);

  return {
    course,

    created: true,
  };
}

/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function listCourses(req, res, next) {
  try {
    const [rows] = await pool.query(
      `
          SELECT
            c.id,

            c.course_name,
            c.course_code,

            c.start_date,
            c.end_date,

            ${COURSE_STATUS_SQL}
              AS course_status,

            c.is_active
              AS legacy_is_active,

            c.zkbiotime_department_id,
            c.zkbiotime_dept_code,

            COUNT(
              DISTINCT
              CASE
                WHEN
                  t.is_deleted = 0

                  AND
                  t.is_staff_exempt = 0

                THEN
                  t.id
              END
            )
              AS trainee_count,

            COUNT(
              DISTINCT
              CASE
                WHEN
                  t.is_deleted = 0

                  AND
                  t.is_staff_exempt = 0

                  AND
                  COALESCE(
                    t.status,
                    'ACTIVE'
                  ) <>
                  'TRAINING_DROP'

                  AND
                  c.start_date
                    IS NOT NULL

                  AND
                  c.end_date
                    IS NOT NULL

                  AND
                  DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                  BETWEEN
                    c.start_date
                  AND
                    c.end_date

                THEN
                  t.id
              END
            )
              AS active_trainees,

            COUNT(
              DISTINCT
              CASE
                WHEN
                  t.is_deleted = 0

                  AND
                  t.is_staff_exempt = 0

                  AND
                  t.status =
                  'TRAINING_DROP'

                THEN
                  t.id
              END
            )
              AS dropped_trainees,

            COUNT(
              DISTINCT
              p.id
            )
              AS platoon_count

          FROM courses c

          LEFT JOIN trainees t
            ON
              t.course_id =
              c.id

          LEFT JOIN platoons p
            ON
              p.course_id =
              c.id

          GROUP BY
            c.id,
            c.course_name,
            c.course_code,
            c.start_date,
            c.end_date,
            c.is_active,
            c.zkbiotime_department_id,
            c.zkbiotime_dept_code

          ORDER BY
            CASE
              WHEN
                c.start_date
                  IS NOT NULL

                AND
                c.end_date
                  IS NOT NULL

                AND
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                BETWEEN
                  c.start_date
                AND
                  c.end_date

                THEN 1

              WHEN
                c.start_date
                  IS NOT NULL

                AND
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) <
                c.start_date

                THEN 2

              WHEN
                c.end_date
                  IS NOT NULL

                AND
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) >
                c.end_date

                THEN 3

              ELSE 4
            END,

            c.start_date DESC,

            c.course_name ASC
        `,
    );

    return res.json({
      success: true,

      data: rows.map((row) => ({
        ...row,

        trainee_count: Number(row.trainee_count || 0),

        active_trainees: Number(row.active_trainees || 0),

        dropped_trainees: Number(row.dropped_trainees || 0),

        platoon_count: Number(row.platoon_count || 0),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function addCourse(req, res, next) {
  try {
    const courseName = cleanText(req.body.course_name);

    if (!courseName) {
      return res.status(400).json({
        success: false,

        message: "Course Name is required.",
      });
    }

    const result = await createCourseRecord({
      courseName,

      courseCode: req.body.course_code,

      startDate: req.body.start_date,

      endDate: req.body.end_date,
    });

    if (!result.created) {
      return res.status(409).json({
        success: false,

        message: "This Course already exists.",

        data: result.course,
      });
    }

    await writeCourseAudit({
      req,

      action: "CREATE",

      courseId: result.course.id,

      description: `Course ${result.course.course_name} created.`,

      oldData: null,

      newData: result.course,
    });

    /*
|--------------------------------------------------------------------------
| ZK LIFECYCLE TRIGGER
|--------------------------------------------------------------------------
|
| Background mein chalega.
| HTTP request ko trainees sync hone tak wait nahi karna.
|--------------------------------------------------------------------------
*/

    queueCourseLifecycleReconcile(result.course.id);

    return res.status(201).json({
      success: true,

      message: "Course created successfully.",

      data: result.course,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,

        message: error.message,

        ...(error.details
          ? {
              details: error.details,
            }
          : {}),
      });
    }

    if (error.message?.includes("Course") || error.message?.includes("Date")) {
      return res.status(400).json({
        success: false,

        message: error.message,
      });
    }

    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function updateCourse(req, res, next) {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({
        success: false,

        message: "Invalid Course ID.",
      });
    }

    const existingCourse = await getCourseById(courseId);

    if (!existingCourse) {
      return res.status(404).json({
        success: false,

        message: "Course not found.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | NAME
    |--------------------------------------------------------------------------
    */

    const courseName = Object.prototype.hasOwnProperty.call(
      req.body,
      "course_name",
    )
      ? cleanText(req.body.course_name)
      : existingCourse.course_name;

    if (!courseName) {
      return res.status(400).json({
        success: false,

        message: "Course Name is required.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DATES
    |--------------------------------------------------------------------------
    |
    | Omitted field = preserve current value.
    |
    | Both NULL = clear Course dates, but only when there is no protected
    | temporal history.
    |
    |--------------------------------------------------------------------------
    */

    const hasStart = Object.prototype.hasOwnProperty.call(
      req.body,
      "start_date",
    );

    const hasEnd = Object.prototype.hasOwnProperty.call(req.body, "end_date");

    const startInput = hasStart
      ? req.body.start_date
      : existingCourse.start_date;

    const endInput = hasEnd ? req.body.end_date : existingCourse.end_date;

    const dates = validateCourseDates(startInput, endInput);

    const oldStartDate = normalizeDate(existingCourse.start_date);

    const oldEndDate = normalizeDate(existingCourse.end_date);

    const courseDatesChanged =
      oldStartDate !== dates.startDate || oldEndDate !== dates.endDate;

    /*
    |--------------------------------------------------------------------------
    | HISTORY PROTECTION
    |--------------------------------------------------------------------------
    |
    | Only run this query when Course dates are actually changing.
    |
    | Name / Code-only edits remain fast and unaffected.
    |
    |--------------------------------------------------------------------------
    */

    if (courseDatesChanged) {
      await assertCourseDateChangePreservesHistory({
        courseId,

        startDate: dates.startDate,

        endDate: dates.endDate,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DUPLICATE NAME
    |--------------------------------------------------------------------------
    */

    const duplicate = await findCourseByName(courseName, courseId);

    if (duplicate) {
      return res.status(409).json({
        success: false,

        message: "Another Course with this name already exists.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | COURSE CODE
    |--------------------------------------------------------------------------
    */

    const courseCode = Object.prototype.hasOwnProperty.call(
      req.body,
      "course_code",
    )
      ? cleanText(req.body.course_code)
      : existingCourse.course_code;

    /*
    |--------------------------------------------------------------------------
    | UPDATE
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        UPDATE courses

        SET
          course_name =
            :courseName,

          course_code =
            :courseCode,

          start_date =
            :startDate,

          end_date =
            :endDate,

          /*
          |--------------------------------------------------------------------------
          | Legacy compatibility only
          |--------------------------------------------------------------------------
          |
          | Course lifecycle source of truth remains start_date + end_date.
          |
          |--------------------------------------------------------------------------
          */

          is_active =
            CASE
              WHEN
                :startDateActive
                  IS NOT NULL

                AND
                :endDateActive
                  IS NOT NULL

                AND
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                BETWEEN
                  :startDateActive2
                AND
                  :endDateActive2

                THEN 1

              ELSE 0
            END

        WHERE
          id =
            :courseId
      `,
      {
        courseId,

        courseName,

        courseCode,

        startDate: dates.startDate,

        endDate: dates.endDate,

        startDateActive: dates.startDate,

        endDateActive: dates.endDate,

        startDateActive2: dates.startDate,

        endDateActive2: dates.endDate,
      },
    );

    const updatedCourse = await getCourseById(courseId);

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await writeCourseAudit({
      req,

      action: "UPDATE",

      courseId,

      description: `Course ${updatedCourse.course_name} updated.`,

      oldData: existingCourse,

      newData: updatedCourse,
    });

    /*
|--------------------------------------------------------------------------
| ZK LIFECYCLE TRIGGER
|--------------------------------------------------------------------------
|
| Name / Dates update hote hi relevant Course automatically reconcile hoga.
|--------------------------------------------------------------------------
*/

    queueCourseLifecycleReconcile(courseId);

    return res.json({
      success: true,

      message: "Course updated successfully.",

      data: updatedCourse,
    });
  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | HISTORY CONFLICT / BUSINESS CONFLICT
    |--------------------------------------------------------------------------
    */

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,

        message: error.message,

        ...(error.details
          ? {
              details: error.details,
            }
          : {}),
      });
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATION
    |--------------------------------------------------------------------------
    */

    if (error.message?.includes("Course") || error.message?.includes("Date")) {
      return res.status(400).json({
        success: false,

        message: error.message,
      });
    }

    return next(error);
  }
}

module.exports = {
  listCourses,

  addCourse,

  updateCourse,

  findCourseByName,

  createCourseRecord,

  getCourseById,

  getCourseTemporalHistory,
};
