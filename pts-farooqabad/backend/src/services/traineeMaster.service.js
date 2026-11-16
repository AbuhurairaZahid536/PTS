const {
  pool,
} = require("../config/db");


/*
|--------------------------------------------------------------------------
| NON-TRAINEE / PTS STAFF COURSE NAMES
|--------------------------------------------------------------------------
|
| Ye legacy course-like records PTS Staff se related hain.
|
| Inka Trainee Course / Platoon hierarchy mein koi role nahi.
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

function cleanText(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(
      value
    ).trim();

  return (
    text ||
    null
  );
}


function normalizeName(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .replace(
      /\s+/g,
      " "
    )
    .toLowerCase();
}


function isNonTraineeCourseName(
  value
) {
  const normalized =
    normalizeName(
      value
    );

  return NON_TRAINEE_COURSES.some(
    (
      item
    ) =>
      normalizeName(
        item
      ) ===
      normalized
  );
}


function assertTraineeCourse(
  course
) {
  if (
    !course
  ) {
    return;
  }

  if (
    isNonTraineeCourseName(
      course.course_name
    )
  ) {
    throw new Error(
      `"${course.course_name}" belongs to PTS Staff and cannot be used in Trainee Management.`
    );
  }
}


/*
|--------------------------------------------------------------------------
| GET COURSE BY ID
|--------------------------------------------------------------------------
*/

async function getCourseById(
  courseId
) {
  const id =
    Number(
      courseId
    );

  if (
    !Number.isInteger(
      id
    ) ||
    id <=
      0
  ) {
    return null;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          *

        FROM courses

        WHERE
          id =
            :courseId

        LIMIT 1
      `,
      {
        courseId:
          id,
      }
    );

  return (
    rows[0] ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| FIND / CREATE TRAINEE COURSE
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Course without dates is intentionally allowed.
|
| Auto-created Course:
|
| start_date = NULL
| end_date   = NULL
| is_active  = 0   (legacy compatibility only)
|
| Actual lifecycle is calculated from Course dates.
|
|--------------------------------------------------------------------------
*/

async function resolveCourse({
  courseId =
    null,

  courseName =
    null,

  createIfMissing =
    true,
}) {
  /*
  |--------------------------------------------------------------------------
  | RESOLVE BY ID
  |--------------------------------------------------------------------------
  */

  if (
    courseId
  ) {
    const course =
      await getCourseById(
        courseId
      );

    if (
      course
    ) {
      assertTraineeCourse(
        course
      );

      return {
        course,

        created:
          false,
      };
    }
  }


  /*
  |--------------------------------------------------------------------------
  | RESOLVE BY NAME
  |--------------------------------------------------------------------------
  */

  const cleanName =
    cleanText(
      courseName
    );

  if (
    !cleanName
  ) {
    return {
      course:
        null,

      created:
        false,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | BLOCK STAFF CATEGORY NAMES BEFORE LOOKUP / CREATE
  |--------------------------------------------------------------------------
  */

  if (
    isNonTraineeCourseName(
      cleanName
    )
  ) {
    throw new Error(
      `"${cleanName}" belongs to PTS Staff and cannot be used as a Trainee Course.`
    );
  }


  const [
    existingRows,
  ] =
    await pool.query(
      `
        SELECT
          *

        FROM courses

        WHERE
          LOWER(
            TRIM(
              course_name
            )
          )
          =
          LOWER(
            TRIM(
              :courseName
            )
          )

        LIMIT 1
      `,
      {
        courseName:
          cleanName,
      }
    );


  if (
    existingRows.length
  ) {
    const course =
      existingRows[0];

    assertTraineeCourse(
      course
    );

    return {
      course,

      created:
        false,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | NOT ALLOWED TO CREATE
  |--------------------------------------------------------------------------
  */

  if (
    !createIfMissing
  ) {
    return {
      course:
        null,

      created:
        false,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | AUTO-CREATE DATE-LESS TRAINEE COURSE
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | Dates intentionally NULL.
  | Course will remain DATE_NOT_SET until dates are entered later.
  |
  |--------------------------------------------------------------------------
  */

  const [
    result,
  ] =
    await pool.query(
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
          NULL,
          NULL,
          NULL,
          0
        )
      `,
      {
        courseName:
          cleanName,
      }
    );


  const course =
    await getCourseById(
      result.insertId
    );


  if (
    !course
  ) {
    throw new Error(
      "Course was created but could not be loaded."
    );
  }


  assertTraineeCourse(
    course
  );


  return {
    course,

    created:
      true,
  };
}


/*
|--------------------------------------------------------------------------
| VERIFY TRAINEE COURSE FOR PLATOON
|--------------------------------------------------------------------------
*/

async function requireTraineeCourse(
  courseId
) {
  const course =
    await getCourseById(
      courseId
    );

  if (
    !course
  ) {
    throw new Error(
      "Selected Course does not exist."
    );
  }

  assertTraineeCourse(
    course
  );

  return course;
}


/*
|--------------------------------------------------------------------------
| GET PLATOON BY ID + COURSE
|--------------------------------------------------------------------------
*/

async function getPlatoonByIdAndCourse(
  platoonId,
  courseId
) {
  const normalizedPlatoonId =
    Number(
      platoonId
    );

  const normalizedCourseId =
    Number(
      courseId
    );

  if (
    !Number.isInteger(
      normalizedPlatoonId
    ) ||
    normalizedPlatoonId <=
      0 ||
    !Number.isInteger(
      normalizedCourseId
    ) ||
    normalizedCourseId <=
      0
  ) {
    return null;
  }


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          p.*,

          c.course_name

        FROM platoons p

        JOIN courses c
          ON
            c.id =
            p.course_id

        WHERE
          p.id =
            :platoonId

          AND

          p.course_id =
            :courseId

        LIMIT 1
      `,
      {
        platoonId:
          normalizedPlatoonId,

        courseId:
          normalizedCourseId,
      }
    );


  const platoon =
    rows[0] ||
    null;


  if (
    platoon
  ) {
    assertTraineeCourse({
      course_name:
        platoon.course_name,
    });
  }


  return platoon;
}


/*
|--------------------------------------------------------------------------
| FIND / CREATE TRAINEE PLATOON
|--------------------------------------------------------------------------
|
| Platoon sirf genuine Trainee Course ke against resolve/create ho sakta hai.
|
|--------------------------------------------------------------------------
*/

async function resolvePlatoon({
  courseId,

  platoonId =
    null,

  platoonNumber =
    null,

  platoonName =
    null,

  createIfMissing =
    true,
}) {
  const normalizedCourseId =
    Number(
      courseId
    );


  /*
  |--------------------------------------------------------------------------
  | COURSE REQUIRED
  |--------------------------------------------------------------------------
  */

  if (
    !Number.isInteger(
      normalizedCourseId
    ) ||
    normalizedCourseId <=
      0
  ) {
    return {
      platoon:
        null,

      created:
        false,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | HARD COURSE VALIDATION
  |--------------------------------------------------------------------------
  |
  | Prevents Staff Category / Branch from entering Platoon hierarchy.
  |
  |--------------------------------------------------------------------------
  */

  await requireTraineeCourse(
    normalizedCourseId
  );


  /*
  |--------------------------------------------------------------------------
  | RESOLVE BY PLATOON ID
  |--------------------------------------------------------------------------
  */

  if (
    platoonId
  ) {
    const platoon =
      await getPlatoonByIdAndCourse(
        platoonId,
        normalizedCourseId
      );


    if (
      platoon
    ) {
      return {
        platoon,

        created:
          false,
      };
    }
  }


  /*
  |--------------------------------------------------------------------------
  | RESOLVE BY NUMBER
  |--------------------------------------------------------------------------
  */

  const cleanNumber =
    cleanText(
      platoonNumber
    );


  if (
    !cleanNumber
  ) {
    return {
      platoon:
        null,

      created:
        false,
    };
  }


  const [
    existingRows,
  ] =
    await pool.query(
      `
        SELECT
          p.*,

          c.course_name

        FROM platoons p

        JOIN courses c
          ON
            c.id =
            p.course_id

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
        courseId:
          normalizedCourseId,

        platoonNumber:
          cleanNumber,
      }
    );


  if (
    existingRows.length
  ) {
    const platoon =
      existingRows[0];

    assertTraineeCourse({
      course_name:
        platoon.course_name,
    });

    return {
      platoon,

      created:
        false,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | DO NOT CREATE
  |--------------------------------------------------------------------------
  */

  if (
    !createIfMissing
  ) {
    return {
      platoon:
        null,

      created:
        false,
    };
  }


  /*
  |--------------------------------------------------------------------------
  | CREATE TRAINEE PLATOON
  |--------------------------------------------------------------------------
  */

  const [
    result,
  ] =
    await pool.query(
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
        courseId:
          normalizedCourseId,

        platoonNumber:
          cleanNumber,

        platoonName:
          cleanText(
            platoonName
          ),
      }
    );


  const platoon =
    await getPlatoonByIdAndCourse(
      result.insertId,
      normalizedCourseId
    );


  if (
    !platoon
  ) {
    throw new Error(
      "Platoon was created but could not be loaded."
    );
  }


  return {
    platoon,

    created:
      true,
  };
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  resolveCourse,

  resolvePlatoon,
};