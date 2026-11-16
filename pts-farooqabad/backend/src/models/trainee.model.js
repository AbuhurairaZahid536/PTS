const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| COURSE STATUS SQL
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
| TRAINEE LIFECYCLE SQL
|--------------------------------------------------------------------------
|
| Course dates are the source of truth.
|--------------------------------------------------------------------------
*/

const TRAINEE_LIFECYCLE_SQL = `
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
| LIST TRAINEES
|--------------------------------------------------------------------------
*/

async function getTrainees({
  search = "",
  courseId = null,
  platoonId = null,
  status = null,
  courseStatus = null,
  page = 1,
  pageSize = 25,
}) {
  const offset =
    (page - 1) *
    pageSize;

  const conditions = [
    "t.is_deleted = 0",
    "t.is_staff_exempt = 0",
  ];

  const params = {};

  if (
    search &&
    String(search).trim()
  ) {
    conditions.push(`
      (
        t.employee_id LIKE :search
        OR t.belt_no LIKE :search
        OR t.first_name LIKE :search
        OR t.last_name LIKE :search
        OR t.father_name LIKE :search
        OR t.cnic LIKE :search
        OR CONCAT_WS(
          ' ',
          t.first_name,
          t.last_name
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
      Number(courseId);
  }

  if (platoonId) {
    conditions.push(
      "t.platoon_id = :platoonId"
    );

    params.platoonId =
      Number(platoonId);
  }

  /*
  |--------------------------------------------------------------------------
  | RECORD / OPERATIONAL STATUS
  |--------------------------------------------------------------------------
  |
  | Existing field preserved.
  |
  | Course ACTIVE/UPCOMING/COMPLETED is separate.
  |--------------------------------------------------------------------------
  */

  if (status) {
    conditions.push(
      "t.status = :status"
    );

    params.status =
      String(status)
        .trim()
        .toUpperCase();
  }

  /*
  |--------------------------------------------------------------------------
  | COURSE LIFECYCLE FILTER
  |--------------------------------------------------------------------------
  */

  if (courseStatus) {
    const normalized =
      String(courseStatus)
        .trim()
        .toUpperCase();

    if (
      normalized ===
      "DATE_NOT_SET"
    ) {
      conditions.push(`
        (
          c.start_date IS NULL
          OR c.end_date IS NULL
        )
      `);
    } else if (
      normalized ===
      "UPCOMING"
    ) {
      conditions.push(`
        c.start_date IS NOT NULL
        AND c.end_date IS NOT NULL
        AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) < c.start_date
      `);
    } else if (
      normalized ===
      "ACTIVE"
    ) {
      conditions.push(`
        c.start_date IS NOT NULL
        AND c.end_date IS NOT NULL
        AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
            BETWEEN c.start_date
            AND c.end_date
      `);
    } else if (
      normalized ===
      "COMPLETED"
    ) {
      conditions.push(`
        c.start_date IS NOT NULL
        AND c.end_date IS NOT NULL
        AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) > c.end_date
      `);
    }
  }

  const whereClause = `
    WHERE
      ${conditions.join(
        " AND "
      )}
  `;

  const [
    countRows,
  ] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM trainees t

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        ${whereClause}
      `,
      params
    );

  const total =
    Number(
      countRows[0]?.total ||
      0
    );

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.id,
          t.employee_id,
          t.belt_no,

          t.first_name,
          t.last_name,
          t.father_name,

          t.cnic,
          t.phone,
          t.email,
          t.address,

          t.course_id,

          c.course_name,
          c.course_code,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          ${COURSE_STATUS_SQL}
            AS course_status,

          ${TRAINEE_LIFECYCLE_SQL}
            AS trainee_lifecycle_status,

          t.platoon_id,
          p.platoon_number,
          p.platoon_name,

          t.position,

          t.joining_date,

          /*
          |--------------------------------------------------------------------------
          | Legacy fields retained only for compatibility/history.
          | They no longer control lifecycle/attendance.
          |--------------------------------------------------------------------------
          */

          t.training_start_date,
          t.training_end_date,

          t.status,

          t.photo_path,

          t.zkteco_emp_id,
          t.zkteco_emp_code,
          t.zkteco_synced,
          t.zkteco_last_sync,

          t.remarks,

          t.created_at,
          t.updated_at

        FROM trainees t

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        ${whereClause}

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

          t.id DESC

        LIMIT :limit
        OFFSET :offset
      `,
      {
        ...params,

        limit:
          Number(pageSize),

        offset:
          Number(offset),
      }
    );

  return {
    rows,

    pagination: {
      page,
      pageSize,
      total,

      totalPages:
        Math.ceil(
          total /
          pageSize
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| GET SINGLE
|--------------------------------------------------------------------------
*/

async function getTraineeById(
  id
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.*,

          c.course_name,
          c.course_code,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          ${COURSE_STATUS_SQL}
            AS course_status,

          ${TRAINEE_LIFECYCLE_SQL}
            AS trainee_lifecycle_status,

          p.platoon_number,
          p.platoon_name

        FROM trainees t

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        WHERE
          t.id = :id

          AND
          t.is_deleted = 0

        LIMIT 1
      `,
      {
        id:
          Number(id),
      }
    );

  return (
    rows[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| SAME COURSE + EMPLOYEE ID
|--------------------------------------------------------------------------
*/

async function findTraineeByCourseAndEmployee({
  courseId = null,
  employeeId,
  excludeId = null,
  includeDeleted = true,
}) {
  const cleanEmployeeId =
    String(
      employeeId ||
      ""
    ).trim();

  if (
    !cleanEmployeeId
  ) {
    return null;
  }

  const conditions = [
    `
      TRIM(
        t.employee_id
      ) = :employeeId
    `,
  ];

  const params = {
    employeeId:
      cleanEmployeeId,
  };

  if (courseId) {
    conditions.push(
      "t.course_id = :courseId"
    );

    params.courseId =
      Number(courseId);
  } else {
    conditions.push(
      "t.course_id IS NULL"
    );
  }

  if (excludeId) {
    conditions.push(
      "t.id <> :excludeId"
    );

    params.excludeId =
      Number(excludeId);
  }

  if (
    !includeDeleted
  ) {
    conditions.push(
      "t.is_deleted = 0"
    );
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.*,

          c.course_name,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          ${COURSE_STATUS_SQL}
            AS course_status,

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
          t.id DESC

        LIMIT 1
      `,
      params
    );

  return (
    rows[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| CURRENT TRAINEE FOR EMPLOYEE ID
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Latest ID is NO LONGER the authority.
|
| Current owner = the trainee whose Course is ACTIVE TODAY.
|--------------------------------------------------------------------------
*/

async function getCurrentTraineeByEmployeeId(
  employeeId
) {
  const cleanEmployeeId =
    String(
      employeeId ||
      ""
    ).trim();

  if (
    !cleanEmployeeId
  ) {
    return null;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.*,

          c.course_name,
          c.course_code,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          'ACTIVE'
            AS course_status,

          p.platoon_number,
          p.platoon_name

        FROM trainees t

        JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        WHERE
          TRIM(
            t.employee_id
          ) =
          :employeeId

          AND
          t.is_deleted = 0

          AND
          t.is_staff_exempt = 0

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

        ORDER BY
          c.start_date DESC,
          t.id DESC

        LIMIT 1
      `,
      {
        employeeId:
          cleanEmployeeId,
      }
    );

  return (
    rows[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| TRAINEE AT REFERENCE DATE
|--------------------------------------------------------------------------
|
| Used later by Leave / historical resolution.
|--------------------------------------------------------------------------
*/

async function getTraineeByEmployeeIdAtDate({
  employeeId,
  referenceDate,
}) {
  const cleanEmployeeId =
    String(
      employeeId ||
      ""
    ).trim();

  const cleanDate =
    String(
      referenceDate ||
      ""
    ).trim();

  if (
    !cleanEmployeeId ||
    !cleanDate
  ) {
    return {
      match:
        null,

      ambiguous:
        false,

      matches:
        [],
    };
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.*,

          c.course_name,
          c.course_code,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          p.platoon_number,
          p.platoon_name

        FROM trainees t

        JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        WHERE
          TRIM(
            t.employee_id
          ) =
          :employeeId

          AND
          t.is_deleted = 0

          AND
          t.is_staff_exempt = 0

          AND
          c.start_date IS NOT NULL

          AND
          c.end_date IS NOT NULL

          AND
          :referenceDate
          BETWEEN
            c.start_date
          AND
            c.end_date

        ORDER BY
          c.start_date DESC,
          t.id DESC
      `,
      {
        employeeId:
          cleanEmployeeId,

        referenceDate:
          cleanDate,
      }
    );

  return {
    match:
      rows.length === 1
        ? rows[0]
        : null,

    ambiguous:
      rows.length > 1,

    matches:
      rows,
  };
}

/*
|--------------------------------------------------------------------------
| EMPLOYEE COURSE HISTORY
|--------------------------------------------------------------------------
*/

async function getTraineeHistoryByEmployeeId(
  employeeId
) {
  const cleanEmployeeId =
    String(
      employeeId ||
      ""
    ).trim();

  if (
    !cleanEmployeeId
  ) {
    return [];
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.id,
          t.employee_id,

          t.first_name,
          t.last_name,

          t.course_id,
          c.course_name,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          ${COURSE_STATUS_SQL}
            AS course_status,

          t.platoon_id,
          p.platoon_number,

          t.status,

          t.zkteco_emp_id,
          t.zkteco_emp_code,
          t.zkteco_synced,

          t.created_at,
          t.updated_at

        FROM trainees t

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        WHERE
          TRIM(
            t.employee_id
          ) =
          :employeeId

        ORDER BY
          c.start_date DESC,
          t.id DESC
      `,
      {
        employeeId:
          cleanEmployeeId,
      }
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| RELEASE OLD ZK MAPPINGS
|--------------------------------------------------------------------------
*/

async function releasePreviousZkMappings(
  employeeId,
  currentTraineeId
) {
  await pool.query(
    `
      UPDATE trainees

      SET
        zkteco_emp_id = NULL,

        zkteco_emp_code = NULL,

        zkteco_synced = 0

      WHERE
        TRIM(
          employee_id
        ) =
        :employeeId

        AND
        id <>
        :currentTraineeId
    `,
    {
      employeeId:
        String(
          employeeId
        ).trim(),

      currentTraineeId:
        Number(
          currentTraineeId
        ),
    }
  );
}

/*
|--------------------------------------------------------------------------
| GET COURSE
|--------------------------------------------------------------------------
*/

async function getCourseById(
  courseId
) {
  const [
    rows,
  ] =
    await pool.query(
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
        courseId:
          Number(courseId),
      }
    );

  return (
    rows[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| GET PLATOON
|--------------------------------------------------------------------------
*/

async function getPlatoonById(
  platoonId
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT *

        FROM platoons

        WHERE
          id =
          :platoonId

        LIMIT 1
      `,
      {
        platoonId:
          Number(platoonId),
      }
    );

  return (
    rows[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function createTrainee(
  data
) {
  const [
    result,
  ] =
    await pool.query(
      `
        INSERT INTO trainees
        (
          employee_id,
          belt_no,

          first_name,
          last_name,
          father_name,

          cnic,
          phone,
          email,
          address,

          course_id,
          platoon_id,

          position,

          joining_date,

          /*
          |--------------------------------------------------------------------------
          | Legacy trainee training dates retained for DB compatibility.
          | Course dates control lifecycle.
          |--------------------------------------------------------------------------
          */

          training_start_date,
          training_end_date,

          status,

          remarks
        )

        VALUES
        (
          :employee_id,
          :belt_no,

          :first_name,
          :last_name,
          :father_name,

          :cnic,
          :phone,
          :email,
          :address,

          :course_id,
          :platoon_id,

          :position,

          :joining_date,

          :training_start_date,
          :training_end_date,

          :status,

          :remarks
        )
      `,
      {
        ...data,

        status:
          data.status ||
          "ACTIVE",
      }
    );

  return getTraineeById(
    result.insertId
  );
}

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function updateTrainee(
  id,
  data
) {
  await pool.query(
    `
      UPDATE trainees

      SET
        belt_no =
          :belt_no,

        first_name =
          :first_name,

        last_name =
          :last_name,

        father_name =
          :father_name,

        cnic =
          :cnic,

        phone =
          :phone,

        email =
          :email,

        address =
          :address,

        course_id =
          :course_id,

        platoon_id =
          :platoon_id,

        position =
          :position,

        joining_date =
          :joining_date,

        training_start_date =
          :training_start_date,

        training_end_date =
          :training_end_date,

        status =
          :status,

        remarks =
          :remarks

      WHERE
        id =
        :id

        AND
        is_deleted = 0
    `,
    {
      id:
        Number(id),

      ...data,
    }
  );

  return getTraineeById(
    id
  );
}

/*
|--------------------------------------------------------------------------
| RESTORE
|--------------------------------------------------------------------------
*/

async function restoreTrainee(
  id
) {
  await pool.query(
    `
      UPDATE trainees

      SET
        is_deleted = 0,

        is_staff_exempt = 0,

        deleted_at = NULL,

        deleted_by = NULL

      WHERE
        id = :id
    `,
    {
      id:
        Number(id),
    }
  );
}

/*
|--------------------------------------------------------------------------
| SOFT DELETE
|--------------------------------------------------------------------------
*/

async function softDeleteTrainee(
  id,
  deletedBy = null
) {
  const [
    result,
  ] =
    await pool.query(
      `
        UPDATE trainees

        SET
          is_deleted = 1,

          deleted_at =
            NOW(),

          deleted_by =
            :deletedBy

        WHERE
          id = :id

          AND
          is_deleted = 0
      `,
      {
        id:
          Number(id),

        deletedBy,
      }
    );

  return (
    result.affectedRows >
    0
  );
}

/*
|--------------------------------------------------------------------------
| DELETE INFO
|--------------------------------------------------------------------------
*/

async function getTraineeDeleteInfo(
  id
) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,

          employee_id,

          first_name,
          last_name,

          course_id,

          zkteco_emp_id,
          zkteco_emp_code,
          zkteco_synced,

          is_deleted

        FROM trainees

        WHERE
          id =
          :id

        LIMIT 1
      `,
      {
        id:
          Number(id),
      }
    );

  return (
    rows[0] ||
    null
  );
}

module.exports = {
  getTrainees,

  getTraineeById,

  findTraineeByCourseAndEmployee,

  getCurrentTraineeByEmployeeId,

  getTraineeByEmployeeIdAtDate,

  getTraineeHistoryByEmployeeId,

  releasePreviousZkMappings,

  getCourseById,

  getPlatoonById,

  createTrainee,

  updateTrainee,

  restoreTrainee,

  softDeleteTrainee,

  getTraineeDeleteInfo,
};