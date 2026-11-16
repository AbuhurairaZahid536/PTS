const { pool } = require("../config/db");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function dateOnly(value) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        value.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const text =
    String(value).trim();

  const isoMatch =
    text.match(
      /^(\d{4}-\d{2}-\d{2})/
    );

  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  const year =
    parsed.getFullYear();

  const month =
    String(
      parsed.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      parsed.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value > 0
        )
    ),
  ];
}

/*
|--------------------------------------------------------------------------
| COURSE DETAILS
|--------------------------------------------------------------------------
*/

async function getCoursesByIds(ids) {
  const courseIds =
    normalizeIds(ids);

  if (!courseIds.length) {
    return [];
  }

  const placeholders =
    courseIds
      .map(() => "?")
      .join(",");

  const [rows] =
    await pool.query(
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

        WHERE
          c.id IN (${placeholders})

        ORDER BY
          c.course_name ASC
      `,
      courseIds
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| VALIDATE TIMETABLE / COURSE INTERSECTION
|--------------------------------------------------------------------------
|
| DATE_NOT_SET Course ko assignment allow rahegi.
| Course dates baad mein enter hone par runtime automatically dates follow karega.
|--------------------------------------------------------------------------
*/

async function validateCourseAssignments({
  courseIds = [],
  effectiveFrom = null,
  effectiveTo = null,
}) {
  const normalizedIds =
    normalizeIds(courseIds);

  if (!normalizedIds.length) {
    return {
      valid: true,
      courses: [],
      message: null,
    };
  }

  const courses =
    await getCoursesByIds(
      normalizedIds
    );

  if (
    courses.length !==
    normalizedIds.length
  ) {
    return {
      valid: false,
      courses,
      message:
        "One or more selected Courses could not be found.",
    };
  }

  for (const course of courses) {
    /*
    |--------------------------------------------------------------------------
    | New auto-created Course without dates remains assignable.
    |--------------------------------------------------------------------------
    */

    if (
      !course.start_date ||
      !course.end_date
    ) {
      continue;
    }

    const courseStart =
      dateOnly(
        course.start_date
      );

    const courseEnd =
      dateOnly(
        course.end_date
      );

    const timetableStart =
      dateOnly(
        effectiveFrom
      );

    const timetableEnd =
      dateOnly(
        effectiveTo
      );

    if (
      !courseStart ||
      !courseEnd
    ) {
      continue;
    }

    /*
    |--------------------------------------------------------------------------
    | No intersection:
    |
    | Timetable starts after Course ends
    | OR
    | Timetable ends before Course starts
    |--------------------------------------------------------------------------
    */

    if (
      timetableStart &&
      timetableStart > courseEnd
    ) {
      return {
        valid: false,
        courses,
        message:
          `Timetable Effective From (${timetableStart}) is after ${course.course_name} Course End Date (${courseEnd}).`,
      };
    }

    if (
      timetableEnd &&
      timetableEnd < courseStart
    ) {
      return {
        valid: false,
        courses,
        message:
          `Timetable Effective To (${timetableEnd}) is before ${course.course_name} Course Start Date (${courseStart}).`,
      };
    }
  }

  return {
    valid: true,
    courses,
    message: null,
  };
}

/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function getTimetables() {
  const [rows] =
    await pool.query(
      `
        SELECT
          tt.*,

          COUNT(
            DISTINCT
            tca.course_id
          ) AS course_count,

          COUNT(
            DISTINCT
            tsa.category_id
          ) AS staff_category_count,

          COUNT(
            DISTINCT
            CASE
              WHEN
                c.start_date IS NOT NULL
                AND c.end_date IS NOT NULL
                AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                  BETWEEN
                    c.start_date
                  AND
                    c.end_date

              THEN
                tca.course_id

              ELSE NULL
            END
          ) AS current_course_count,

          CASE
            WHEN
              tt.is_active = 0
              THEN 'INACTIVE'

            WHEN
              tt.effective_from IS NOT NULL
              AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < tt.effective_from
              THEN 'UPCOMING'

            WHEN
              tt.effective_to IS NOT NULL
              AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) > tt.effective_to
              THEN 'EXPIRED'

            ELSE 'ACTIVE'
          END AS rule_status

        FROM attendance_timetable_rules tt

        LEFT JOIN timetable_course_assignments tca
          ON tca.timetable_id = tt.id

        LEFT JOIN courses c
          ON c.id = tca.course_id

        LEFT JOIN timetable_staff_assignments tsa
          ON tsa.timetable_id = tt.id

        GROUP BY
          tt.id

        ORDER BY
          tt.is_active DESC,
          tt.id DESC
      `
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| SINGLE
|--------------------------------------------------------------------------
*/

async function getTimetableById(id) {
  const [rows] =
    await pool.query(
      `
        SELECT
          tt.*,

          CASE
            WHEN
              tt.is_active = 0
              THEN 'INACTIVE'

            WHEN
              tt.effective_from IS NOT NULL
              AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < tt.effective_from
              THEN 'UPCOMING'

            WHEN
              tt.effective_to IS NOT NULL
              AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) > tt.effective_to
              THEN 'EXPIRED'

            ELSE 'ACTIVE'
          END AS rule_status

        FROM attendance_timetable_rules tt

        WHERE
          tt.id = :id

        LIMIT 1
      `,
      { id }
    );

  if (!rows.length) {
    return null;
  }

  const timetable =
    rows[0];

  /*
  |--------------------------------------------------------------------------
  | ASSIGNED COURSES
  |--------------------------------------------------------------------------
  */

  const [courses] =
    await pool.query(
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

        FROM timetable_course_assignments a

        JOIN courses c
          ON c.id = a.course_id

        WHERE
          a.timetable_id = :id

        ORDER BY
          c.course_name
      `,
      { id }
    );

  /*
  |--------------------------------------------------------------------------
  | ASSIGNED STAFF CATEGORIES
  |--------------------------------------------------------------------------
  */

  const [staffCategories] =
    await pool.query(
      `
        SELECT
          sc.id,
          sc.category_name

        FROM timetable_staff_assignments a

        JOIN staff_categories sc
          ON sc.id = a.category_id

        WHERE
          a.timetable_id = :id

        ORDER BY
          sc.category_name
      `,
      { id }
    );

  return {
    ...timetable,

    courses,

    staff_categories:
      staffCategories,
  };
}

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function createTimetable(
  data,
  userId = null
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const courseIds =
      normalizeIds(
        data.course_ids
      );

    const categoryIds =
      normalizeIds(
        data.staff_category_ids
      );

    const [result] =
      await connection.query(
        `
          INSERT INTO attendance_timetable_rules
          (
            timetable_name,

            morning_start,
            morning_end,

            morning_early_minutes,
            morning_late_grace_minutes,

            evening_start,
            evening_end,

            evening_early_minutes,
            evening_late_grace_minutes,

            effective_from,
            effective_to,

            is_active,

            created_by
          )

          VALUES
          (
            :timetable_name,

            :morning_start,
            :morning_end,

            :morning_early_minutes,
            :morning_late_grace_minutes,

            :evening_start,
            :evening_end,

            :evening_early_minutes,
            :evening_late_grace_minutes,

            :effective_from,
            :effective_to,

            :is_active,

            :created_by
          )
        `,
        {
          timetable_name:
            data.timetable_name,

          morning_start:
            data.morning_start,

          morning_end:
            data.morning_end,

          morning_early_minutes:
            Number(
              data.morning_early_minutes ||
              0
            ),

          morning_late_grace_minutes:
            Number(
              data.morning_late_grace_minutes ||
              0
            ),

          evening_start:
            data.evening_start,

          evening_end:
            data.evening_end,

          evening_early_minutes:
            Number(
              data.evening_early_minutes ||
              0
            ),

          evening_late_grace_minutes:
            Number(
              data.evening_late_grace_minutes ||
              0
            ),

          effective_from:
            data.effective_from ||
            null,

          effective_to:
            data.effective_to ||
            null,

          is_active:
            data.is_active === false
              ? 0
              : 1,

          created_by:
            userId,
        }
      );

    const timetableId =
      result.insertId;

    /*
    |--------------------------------------------------------------------------
    | COURSE ASSIGNMENTS
    |--------------------------------------------------------------------------
    */

    for (
      const courseId of
      courseIds
    ) {
      await connection.query(
        `
          INSERT IGNORE INTO timetable_course_assignments
          (
            timetable_id,
            course_id
          )

          VALUES
          (?, ?)
        `,
        [
          timetableId,
          courseId,
        ]
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STAFF ASSIGNMENTS
    |--------------------------------------------------------------------------
    */

    for (
      const categoryId of
      categoryIds
    ) {
      await connection.query(
        `
          INSERT IGNORE INTO timetable_staff_assignments
          (
            timetable_id,
            category_id
          )

          VALUES
          (?, ?)
        `,
        [
          timetableId,
          categoryId,
        ]
      );
    }

    await connection.commit();

    return getTimetableById(
      timetableId
    );
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function updateTimetable(
  id,
  data
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const courseIds =
      normalizeIds(
        data.course_ids
      );

    const categoryIds =
      normalizeIds(
        data.staff_category_ids
      );

    const [result] =
      await connection.query(
        `
          UPDATE attendance_timetable_rules

          SET
            timetable_name =
              :timetable_name,

            morning_start =
              :morning_start,

            morning_end =
              :morning_end,

            morning_early_minutes =
              :morning_early_minutes,

            morning_late_grace_minutes =
              :morning_late_grace_minutes,

            evening_start =
              :evening_start,

            evening_end =
              :evening_end,

            evening_early_minutes =
              :evening_early_minutes,

            evening_late_grace_minutes =
              :evening_late_grace_minutes,

            effective_from =
              :effective_from,

            effective_to =
              :effective_to,

            is_active =
              :is_active

          WHERE
            id = :id
        `,
        {
          id,

          timetable_name:
            data.timetable_name,

          morning_start:
            data.morning_start,

          morning_end:
            data.morning_end,

          morning_early_minutes:
            Number(
              data.morning_early_minutes ||
              0
            ),

          morning_late_grace_minutes:
            Number(
              data.morning_late_grace_minutes ||
              0
            ),

          evening_start:
            data.evening_start,

          evening_end:
            data.evening_end,

          evening_early_minutes:
            Number(
              data.evening_early_minutes ||
              0
            ),

          evening_late_grace_minutes:
            Number(
              data.evening_late_grace_minutes ||
              0
            ),

          effective_from:
            data.effective_from ||
            null,

          effective_to:
            data.effective_to ||
            null,

          is_active:
            data.is_active === false
              ? 0
              : 1,
        }
      );

    if (!result.affectedRows) {
      await connection.rollback();

      return null;
    }

    /*
    |--------------------------------------------------------------------------
    | RESET COURSE ASSIGNMENTS
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE
        FROM timetable_course_assignments

        WHERE
          timetable_id = ?
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | RESET STAFF ASSIGNMENTS
    |--------------------------------------------------------------------------
    */

    await connection.query(
      `
        DELETE
        FROM timetable_staff_assignments

        WHERE
          timetable_id = ?
      `,
      [id]
    );

    for (
      const courseId of
      courseIds
    ) {
      await connection.query(
        `
          INSERT IGNORE INTO timetable_course_assignments
          (
            timetable_id,
            course_id
          )

          VALUES
          (?, ?)
        `,
        [
          id,
          courseId,
        ]
      );
    }

    for (
      const categoryId of
      categoryIds
    ) {
      await connection.query(
        `
          INSERT IGNORE INTO timetable_staff_assignments
          (
            timetable_id,
            category_id
          )

          VALUES
          (?, ?)
        `,
        [
          id,
          categoryId,
        ]
      );
    }

    await connection.commit();

    return getTimetableById(
      id
    );
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

async function deleteTimetable(id) {
  const [result] =
    await pool.query(
      `
        DELETE
        FROM attendance_timetable_rules

        WHERE
          id = :id
      `,
      { id }
    );

  return (
    result.affectedRows >
    0
  );
}

module.exports = {
  getTimetables,

  getTimetableById,

  getCoursesByIds,

  validateCourseAssignments,

  createTimetable,

  updateTimetable,

  deleteTimetable,
};