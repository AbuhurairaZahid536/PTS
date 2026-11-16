const { pool } = require("../config/db");

const { logRequestAudit } = require("../services/audit.service");

const {
  queueCourseLifecycleReconcile,
} = require("../jobs/courseLifecycle.job");

/*
|--------------------------------------------------------------------------
| NON-TRAINEE / STAFF COURSE NAMES
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Ye historical / legacy course-like records PTS Staff ke liye use hue thay.
| Ye Trainee Management ke Course / Platoon system ka hissa nahi hain.
|
| Inko delete nahi kiya ja raha.
| Sirf Trainee Platoon APIs se completely isolate kiya ja raha hai.
|
|--------------------------------------------------------------------------
*/

const NON_TRAINEE_COURSES = [
  "Admin",
  "Dhobi Khana",
  "Class 4 Staff",
  "Line Staff",
  "Drill Instructors",
  "Law Instructor",
  "Menial Staff",
  "Ministerial Staff",
];

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

function normalizeCourseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isNonTraineeCourseName(value) {
  const normalized = normalizeCourseName(value);

  return NON_TRAINEE_COURSES.some(
    (item) => normalizeCourseName(item) === normalized,
  );
}

/*
|--------------------------------------------------------------------------
| GET TRAINEE COURSE
|--------------------------------------------------------------------------
*/

async function getTraineeCourseById(courseId) {
  const [rows] = await pool.query(
    `
        SELECT
          id,
          course_name,
          course_code,
          start_date,
          end_date

        FROM courses

        WHERE
          id =
            :courseId

        LIMIT 1
      `,
    {
      courseId: Number(courseId),
    },
  );

  const course = rows[0] || null;

  if (!course) {
    return null;
  }

  if (isNonTraineeCourseName(course.course_name)) {
    return null;
  }

  return course;
}

/*
|--------------------------------------------------------------------------
| GET PLATOON
|--------------------------------------------------------------------------
*/

async function getPlatoonById(platoonId) {
  const [rows] = await pool.query(
    `
        SELECT
          p.*,

          c.course_name,
          c.course_code,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          CASE
            WHEN
              c.start_date IS NULL
              OR
              c.end_date IS NULL

              THEN
                'DATE_NOT_SET'

            WHEN
              DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) <
              c.start_date

              THEN
                'UPCOMING'

            WHEN
              DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
              BETWEEN
                c.start_date
              AND
                c.end_date

              THEN
                'ACTIVE'

            ELSE
              'COMPLETED'
          END
            AS course_status

        FROM platoons p

        JOIN courses c
          ON
            c.id =
            p.course_id

        WHERE
          p.id =
            :platoonId

        LIMIT 1
      `,
    {
      platoonId: Number(platoonId),
    },
  );

  const platoon = rows[0] || null;

  if (!platoon) {
    return null;
  }

  if (isNonTraineeCourseName(platoon.course_name)) {
    return null;
  }

  return platoon;
}

/*
|--------------------------------------------------------------------------
| AUDIT
|--------------------------------------------------------------------------
*/

function buildPlatoonAuditState(platoon) {
  if (!platoon) {
    return null;
  }

  return {
    course_id: platoon.course_id || null,

    course_name: platoon.course_name || null,

    platoon_number: platoon.platoon_number ?? null,

    platoon_name: platoon.platoon_name || null,

    is_active: Boolean(Number(platoon.is_active ?? 0)),

    zkbiotime_position_id: platoon.zkbiotime_position_id || null,

    zkbiotime_position_code: platoon.zkbiotime_position_code || null,
  };
}

function buildEmptyPlatoonAuditState() {
  return {
    course_id: null,

    course_name: null,

    platoon_number: null,

    platoon_name: null,

    is_active: null,

    zkbiotime_position_id: null,

    zkbiotime_position_code: null,
  };
}

async function writePlatoonAudit({
  req,

  action,

  platoonId,

  description,

  oldData = null,

  newData = null,
}) {
  return logRequestAudit(req, {
    action,

    module: "PLATOON",

    recordId: platoonId,

    description,

    oldData: oldData
      ? buildPlatoonAuditState(oldData)
      : buildEmptyPlatoonAuditState(),

    newData: newData ? buildPlatoonAuditState(newData) : null,
  });
}

/*
|--------------------------------------------------------------------------
| FIND PLATOON
|--------------------------------------------------------------------------
*/

async function findPlatoonByCourseAndNumber({
  courseId,

  platoonNumber,
}) {
  const cleanNumber = cleanText(platoonNumber);

  if (!courseId || !cleanNumber) {
    return null;
  }

  const course = await getTraineeCourseById(courseId);

  if (!course) {
    return null;
  }

  const [rows] = await pool.query(
    `
        SELECT
          p.*

        FROM platoons p

        WHERE
          p.course_id =
            :courseId

          AND

          TRIM(
            CAST(
              p.platoon_number
              AS CHAR
            )
          )
          =
          TRIM(
            :platoonNumber
          )

        LIMIT 1
      `,
    {
      courseId: Number(courseId),

      platoonNumber: cleanNumber,
    },
  );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| CREATE RECORD
|--------------------------------------------------------------------------
*/

async function createPlatoonRecord({
  courseId,

  platoonNumber,

  platoonName = null,
}) {
  const normalizedCourseId = Number(courseId);

  const cleanNumber = cleanText(platoonNumber);

  if (
    !Number.isInteger(normalizedCourseId) ||
    normalizedCourseId <= 0 ||
    !cleanNumber
  ) {
    throw new Error("Course and Platoon Number are required.");
  }

  const [courseRows] = await pool.query(
    `
        SELECT
          id,
          course_name,
          course_code,
          start_date,
          end_date

        FROM courses

        WHERE
          id =
            :courseId

        LIMIT 1
      `,
    {
      courseId: normalizedCourseId,
    },
  );

  const course = courseRows[0] || null;

  if (!course) {
    throw new Error("Selected Course does not exist.");
  }

  if (isNonTraineeCourseName(course.course_name)) {
    throw new Error(
      "Selected record belongs to PTS Staff and cannot be used as a Trainee Course or Platoon.",
    );
  }

  const existing = await findPlatoonByCourseAndNumber({
    courseId: normalizedCourseId,

    platoonNumber: cleanNumber,
  });

  if (existing) {
    return {
      platoon: await getPlatoonById(existing.id),

      created: false,
    };
  }

  const [result] = await pool.query(
    `
        INSERT INTO platoons
        (
          course_id,
          platoon_number,
          platoon_name,
          is_active
        )

        VALUES
        (
          :courseId,
          :platoonNumber,
          :platoonName,
          1
        )
      `,
    {
      courseId: normalizedCourseId,

      platoonNumber: cleanNumber,

      platoonName: cleanText(platoonName),
    },
  );

  const platoon = await getPlatoonById(result.insertId);

  return {
    platoon,

    created: true,
  };
}

/*
|--------------------------------------------------------------------------
| LIST PLATOONS
|--------------------------------------------------------------------------
*/

async function listPlatoons(req, res, next) {
  try {
    const courseId = req.query.course_id ? Number(req.query.course_id) : null;

    if (req.query.course_id && (!Number.isInteger(courseId) || courseId <= 0)) {
      return res.status(400).json({
        success: false,

        message: "Invalid Course ID.",
      });
    }

    if (courseId) {
      const [courseRows] = await pool.query(
        `
            SELECT
              id,
              course_name

            FROM courses

            WHERE
              id =
                :courseId

            LIMIT 1
          `,
        {
          courseId,
        },
      );

      const selectedCourse = courseRows[0] || null;

      if (!selectedCourse) {
        return res.json({
          success: true,

          data: [],
        });
      }

      if (isNonTraineeCourseName(selectedCourse.course_name)) {
        return res.json({
          success: true,

          data: [],
        });
      }
    }

    const params = {};

    const conditions = [];

    const excludedPlaceholders = NON_TRAINEE_COURSES.map(
      (_, index) => `:excludedCourse${index}`,
    );

    NON_TRAINEE_COURSES.forEach((courseName, index) => {
      params[`excludedCourse${index}`] = normalizeCourseName(courseName);
    });

    conditions.push(
      `
        LOWER(
          TRIM(
            c.course_name
          )
        )
        NOT IN
        (
          ${excludedPlaceholders.join(", ")}
        )
      `,
    );

    if (courseId) {
      conditions.push(
        `
          p.course_id =
            :courseId
        `,
      );

      params.courseId = courseId;
    }

    const whereClause = `
        WHERE
          ${conditions.join("\nAND\n")}
      `;

    const [rows] = await pool.query(
      `
          SELECT
            p.id,

            p.course_id,

            p.platoon_number,
            p.platoon_name,

            p.is_active,

            p.zkbiotime_position_id,
            p.zkbiotime_position_code,

            c.course_name,

            c.start_date
              AS course_start_date,

            c.end_date
              AS course_end_date,

            CASE
              WHEN
                c.start_date IS NULL
                OR
                c.end_date IS NULL

                THEN
                  'DATE_NOT_SET'

              WHEN
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) <
                c.start_date

                THEN
                  'UPCOMING'

              WHEN
                DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
                BETWEEN
                  c.start_date
                AND
                  c.end_date

                THEN
                  'ACTIVE'

              ELSE
                'COMPLETED'
            END
              AS course_status,

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
                  ) <> 'TRAINING_DROP'

                  AND

                  c.start_date IS NOT NULL

                  AND

                  c.end_date IS NOT NULL

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
              AS active_trainee_count

          FROM platoons p

          JOIN courses c
            ON
              c.id =
              p.course_id

          LEFT JOIN trainees t
            ON
              t.platoon_id =
              p.id

          ${whereClause}

          GROUP BY
            p.id,

            p.course_id,

            p.platoon_number,
            p.platoon_name,

            p.is_active,

            p.zkbiotime_position_id,
            p.zkbiotime_position_code,

            c.course_name,
            c.start_date,
            c.end_date

          ORDER BY
            c.course_name ASC,

            CAST(
              p.platoon_number
              AS UNSIGNED
            ) ASC,

            p.platoon_number ASC
        `,
      params,
    );

    return res.json({
      success: true,

      data: rows.map((row) => ({
        ...row,

        trainee_count: Number(row.trainee_count || 0),

        active_trainee_count: Number(row.active_trainee_count || 0),
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

async function addPlatoon(req, res, next) {
  try {
    const courseId = Number(req.body.course_id);

    const platoonNumber = cleanText(req.body.platoon_number);

    if (!Number.isInteger(courseId) || courseId <= 0 || !platoonNumber) {
      return res.status(400).json({
        success: false,

        message: "Course and Platoon Number are required.",
      });
    }

    const result = await createPlatoonRecord({
      courseId,

      platoonNumber,

      platoonName: req.body.platoon_name,
    });

    if (!result.created) {
      return res.status(409).json({
        success: false,

        message: "This Platoon already exists in selected Course.",

        data: result.platoon,
      });
    }

    await writePlatoonAudit({
      req,

      action: "CREATE",

      platoonId: result.platoon.id,

      description: `Platoon ${result.platoon.platoon_number} created in ${result.platoon.course_name}.`,

      oldData: null,

      newData: result.platoon,
    });

    /*
    |--------------------------------------------------------------------------
    | COURSE ZK LIFECYCLE TRIGGER
    |--------------------------------------------------------------------------
    |
    | ACTIVE:
    |   Position create/map in ZKBioTime.
    |
    | DATE_NOT_SET / UPCOMING:
    |   lifecycle NO_ACTION.
    |
    | COMPLETED:
    |   central safety rules apply.
    |
    | No Course / Platoon / Trainee is deleted here.
    |--------------------------------------------------------------------------
    */

    queueCourseLifecycleReconcile(courseId);

    return res.status(201).json({
      success: true,

      message: "Platoon created successfully.",

      data: result.platoon,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,

        message: "This Platoon already exists in selected Course.",
      });
    }

    if (
      error.message?.includes("Course") ||
      error.message?.includes("PTS Staff") ||
      error.message?.includes("Platoon")
    ) {
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
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  listPlatoons,

  addPlatoon,

  findPlatoonByCourseAndNumber,

  createPlatoonRecord,

  getPlatoonById,
};
