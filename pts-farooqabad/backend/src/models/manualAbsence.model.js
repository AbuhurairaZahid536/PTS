const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const CONFIG = {
  TRAINEE: {
    table:
      "trainee_manual_absence",

    idColumn:
      "trainee_id",
  },

  STAFF: {
    table:
      "staff_manual_absence",

    idColumn:
      "staff_id",
  },
};

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

  return CONFIG[type]
    ? type
    : null;
}

function getConfig(
  subjectType
) {
  const type =
    normalizeSubjectType(
      subjectType
    );

  if (!type) {
    throw new Error(
      "Invalid subject type."
    );
  }

  return {
    subjectType:
      type,

    ...CONFIG[type],
  };
}

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

  return text || null;
}

function pad(
  value
) {
  return String(
    value
  ).padStart(
    2,
    "0"
  );
}

function dateOnly(
  value
) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return [
      value.getFullYear(),
      "-",
      pad(
        value.getMonth() +
          1
      ),
      "-",
      pad(
        value.getDate()
      ),
    ].join("");
  }

  return String(
    value
  ).substring(
    0,
    10
  );
}

/*
|--------------------------------------------------------------------------
| SUBJECT BY ID
|--------------------------------------------------------------------------
*/

async function getSubjectById(
  subjectType,
  subjectId
) {
  const type =
    normalizeSubjectType(
      subjectType
    );

  if (!type) {
    return null;
  }

  if (
    type ===
    "TRAINEE"
  ) {
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
            t.father_name,

            t.course_id,
            t.platoon_id,

            t.status,

            c.course_name,
            c.course_code,

            c.start_date
              AS course_start_date,

            c.end_date
              AS course_end_date,

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
            END
              AS course_status,

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
            t.id =
              :subjectId

            AND
            t.is_deleted = 0

            AND
            t.is_staff_exempt = 0

          LIMIT 1
        `,
        {
          subjectId:
            Number(
              subjectId
            ),
        }
      );

    return (
      rows[0] ||
      null
    );
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          s.id,
          s.employee_id,

          s.first_name,
          s.last_name,
          s.father_name,

          s.category_id,
          s.branch_id,

          s.designation,
          s.status,

          sc.category_name,
          sb.branch_name

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        WHERE
          s.id =
            :subjectId

          AND
          s.is_deleted = 0

        LIMIT 1
      `,
      {
        subjectId:
          Number(
            subjectId
          ),
      }
    );

  return (
    rows[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| SUBJECTS BY EMPLOYEE ID
|--------------------------------------------------------------------------
|
| Future Excel Import / automatic resolution ke liye.
|--------------------------------------------------------------------------
*/

async function getSubjectsByEmployeeId(
  subjectType,
  employeeId
) {
  const type =
    normalizeSubjectType(
      subjectType
    );

  const cleanEmployeeId =
    cleanText(
      employeeId
    );

  if (
    !type ||
    !cleanEmployeeId
  ) {
    return [];
  }

  if (
    type ===
    "TRAINEE"
  ) {
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
            t.platoon_id,

            c.course_name,

            c.start_date
              AS course_start_date,

            c.end_date
              AS course_end_date,

            p.platoon_number

          FROM trainees t

          LEFT JOIN courses c
            ON c.id =
               t.course_id

          LEFT JOIN platoons p
            ON p.id =
               t.platoon_id

          WHERE
            TRIM(
              CAST(
                t.employee_id
                AS CHAR
              )
            ) =
            :employeeId

            AND
            t.is_deleted = 0

            AND
            t.is_staff_exempt = 0

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

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          s.id,
          s.employee_id,

          s.first_name,
          s.last_name,

          s.category_id,
          s.branch_id,

          sc.category_name,
          sb.branch_name

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        WHERE
          TRIM(
            CAST(
              s.employee_id
              AS CHAR
            )
          ) =
          :employeeId

          AND
          s.is_deleted = 0

        ORDER BY
          s.id DESC
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
| DATE-AWARE SUBJECT RESOLVER
|--------------------------------------------------------------------------
|
| Future bulk Excel import ke liye:
|
| TRAINEE:
| Employee ID + absence date + Course date range
|
| STAFF:
| Employee ID + optional Category/Branch
|--------------------------------------------------------------------------
*/

async function resolveSubjectForManualAbsence({
  subjectType,
  employeeId,
  referenceDate,

  courseName = null,
  platoonNumber = null,

  categoryName = null,
  branchName = null,
}) {
  const type =
    normalizeSubjectType(
      subjectType
    );

  const cleanEmployeeId =
    cleanText(
      employeeId
    );

  if (
    !type ||
    !cleanEmployeeId
  ) {
    return {
      status:
        "NOT_FOUND",

      subject:
        null,

      matches:
        [],

      message:
        "Employee ID / Cap No. is required.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | TRAINEE
  |--------------------------------------------------------------------------
  */

  if (
    type ===
    "TRAINEE"
  ) {
    const eventDate =
      dateOnly(
        referenceDate
      );

    if (!eventDate) {
      return {
        status:
          "INVALID_DATE",

        subject:
          null,

        matches:
          [],

        message:
          "Absence date is required.",
      };
    }

    const conditions = [
      `
        TRIM(
          CAST(
            t.employee_id
            AS CHAR
          )
        ) =
        :employeeId
      `,

      "t.is_deleted = 0",

      "t.is_staff_exempt = 0",
    ];

    const params = {
      employeeId:
        cleanEmployeeId,
    };

    if (
      cleanText(
        courseName
      )
    ) {
      conditions.push(`
        LOWER(
          TRIM(
            c.course_name
          )
        ) =
        LOWER(
          TRIM(
            :courseName
          )
        )
      `);

      params.courseName =
        cleanText(
          courseName
        );
    }

    if (
      cleanText(
        platoonNumber
      )
    ) {
      conditions.push(`
        TRIM(
          CAST(
            p.platoon_number
            AS CHAR
          )
        ) =
        :platoonNumber
      `);

      params.platoonNumber =
        cleanText(
          platoonNumber
        );
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
            t.platoon_id,

            c.course_name,

            c.start_date
              AS course_start_date,

            c.end_date
              AS course_end_date,

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
            c.start_date DESC,
            t.id DESC
        `,
        params
      );

    if (
      !rows.length
    ) {
      return {
        status:
          "NOT_FOUND",

        subject:
          null,

        matches:
          [],

        message:
          "Trainee Employee ID / Cap No. not found.",
      };
    }

    const matches =
      rows.filter(
        (
          item
        ) => {
          const start =
            dateOnly(
              item.course_start_date
            );

          const end =
            dateOnly(
              item.course_end_date
            );

          return (
            start &&
            end &&
            eventDate >=
              start &&
            eventDate <=
              end
          );
        }
      );

    if (
      matches.length ===
      1
    ) {
      return {
        status:
          "MATCHED",

        subject:
          matches[0],

        matches,

        message:
          null,
      };
    }

    if (
      matches.length >
      1
    ) {
      return {
        status:
          "AMBIGUOUS",

        subject:
          null,

        matches,

        message:
          "Same Employee ID / Cap No. has multiple Courses covering this date.",
      };
    }

    const missingDates =
      rows.some(
        (
          item
        ) =>
          !item.course_start_date ||
          !item.course_end_date
      );

    if (
      missingDates
    ) {
      return {
        status:
          "COURSE_DATE_NOT_SET",

        subject:
          null,

        matches:
          rows,

        message:
          "Matching trainee Course exists but Course Start/End Date is not set.",
      };
    }

    return {
      status:
        "NO_ACTIVE_COURSE",

      subject:
        null,

      matches:
        rows,

      message:
        `No Course assignment for Employee ID / Cap No. ${cleanEmployeeId} covers ${eventDate}.`,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF
  |--------------------------------------------------------------------------
  */

  const conditions = [
    `
      TRIM(
        CAST(
          s.employee_id
          AS CHAR
        )
      ) =
      :employeeId
    `,

    "s.is_deleted = 0",
  ];

  const params = {
    employeeId:
      cleanEmployeeId,
  };

  if (
    cleanText(
      categoryName
    )
  ) {
    conditions.push(`
      LOWER(
        TRIM(
          sc.category_name
        )
      ) =
      LOWER(
        TRIM(
          :categoryName
        )
      )
    `);

    params.categoryName =
      cleanText(
        categoryName
      );
  }

  if (
    cleanText(
      branchName
    )
  ) {
    conditions.push(`
      LOWER(
        TRIM(
          sb.branch_name
        )
      ) =
      LOWER(
        TRIM(
          :branchName
        )
      )
    `);

    params.branchName =
      cleanText(
        branchName
      );
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          s.id,
          s.employee_id,

          s.first_name,
          s.last_name,

          s.category_id,
          s.branch_id,

          sc.category_name,
          sb.branch_name

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          s.id DESC
      `,
      params
    );

  if (
    rows.length ===
    1
  ) {
    return {
      status:
        "MATCHED",

      subject:
        rows[0],

      matches:
        rows,

      message:
        null,
    };
  }

  if (
    rows.length >
    1
  ) {
    return {
      status:
        "AMBIGUOUS",

      subject:
        null,

      matches:
        rows,

      message:
        "Same Employee ID has multiple Staff records. Category / Branch context is required.",
    };
  }

  return {
    status:
      "NOT_FOUND",

    subject:
      null,

    matches:
      [],

    message:
      "PTS Staff Employee ID not found.",
  };
}

/*
|--------------------------------------------------------------------------
| VALIDATE ABSENCE PERIOD AGAINST COURSE
|--------------------------------------------------------------------------
*/

async function validateSubjectPeriod({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
}) {
  const type =
    normalizeSubjectType(
      subjectType
    );

  if (!type) {
    return {
      valid:
        false,

      subject:
        null,

      message:
        "Invalid subject type.",
    };
  }

  const subject =
    await getSubjectById(
      type,
      subjectId
    );

  if (!subject) {
    return {
      valid:
        false,

      subject:
        null,

      message:
        type ===
        "TRAINEE"
          ? "Trainee not found."
          : "PTS Staff member not found.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF
  |--------------------------------------------------------------------------
  */

  if (
    type ===
    "STAFF"
  ) {
    return {
      valid:
        true,

      subject,

      message:
        null,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | TRAINEE
  |--------------------------------------------------------------------------
  */

  const courseStart =
    dateOnly(
      subject.course_start_date
    );

  const courseEnd =
    dateOnly(
      subject.course_end_date
    );

  if (
    !courseStart ||
    !courseEnd
  ) {
    return {
      valid:
        false,

      subject,

      message:
        "Selected trainee Course Start/End Date is not set.",
    };
  }

  const absenceStart =
    dateOnly(
      startDatetime
    );

  const absenceEnd =
    dateOnly(
      endDatetime
    );

  if (
    !absenceStart ||
    !absenceEnd
  ) {
    return {
      valid:
        false,

      subject,

      message:
        "Valid Manual Absence Start and End Date/Time are required.",
    };
  }

  if (
    absenceStart <
      courseStart ||
    absenceStart >
      courseEnd
  ) {
    return {
      valid:
        false,

      subject,

      message:
        `Manual Absence Start Date must fall within Course period ${courseStart} to ${courseEnd}.`,
    };
  }

  if (
    absenceEnd <
      courseStart ||
    absenceEnd >
      courseEnd
  ) {
    return {
      valid:
        false,

      subject,

      message:
        `Manual Absence End Date must fall within Course period ${courseStart} to ${courseEnd}.`,
    };
  }

  return {
    valid:
      true,

    subject,

    message:
      null,
  };
}

/*
|--------------------------------------------------------------------------
| SINGLE RECORD
|--------------------------------------------------------------------------
*/

async function getById(
  subjectType,
  id
) {
  const config =
    getConfig(
      subjectType
    );

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          m.*,

          marker.full_name
            AS marked_by_name,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name,

          canceller.full_name
            AS cancelled_by_name

        FROM ${config.table} m

        LEFT JOIN users marker
          ON marker.id =
             m.marked_by

        LEFT JOIN users creator
          ON creator.id =
             m.created_by

        LEFT JOIN users updater
          ON updater.id =
             m.updated_by

        LEFT JOIN users canceller
          ON canceller.id =
             m.cancelled_by

        WHERE
          m.id =
          :id

        LIMIT 1
      `,
      {
        id:
          Number(
            id
          ),
      }
    );

  if (
    !rows.length
  ) {
    return null;
  }

  return {
    ...rows[0],

    subject_type:
      config.subjectType,

    subject_id:
      rows[0][
        config.idColumn
      ],
  };
}

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function createRecord({
  subjectType,
  subjectId,

  category,
  programClass,

  startDatetime,
  endDatetime,

  reason,
  referenceNo,
  remarks,

  userId,
}) {
  const config =
    getConfig(
      subjectType
    );

  const [
    result,
  ] =
    await pool.query(
      `
        INSERT INTO ${config.table}
        (
          ${config.idColumn},

          program_class,
          absence_category,

          record_status,

          start_datetime,
          end_datetime,

          reason,
          reference_no,

          marked_by,
          marked_datetime,

          remarks,

          created_by,
          updated_by
        )

        VALUES
        (
          :subjectId,

          :programClass,
          :category,

          'ACTIVE',

          :startDatetime,
          :endDatetime,

          :reason,
          :referenceNo,

          :userId,
          NOW(),

          :remarks,

          :userId,
          :userId
        )
      `,
      {
        subjectId,

        programClass:
          programClass ||
          null,

        category,

        startDatetime,
        endDatetime,

        reason:
          reason ||
          null,

        referenceNo:
          referenceNo ||
          null,

        remarks:
          remarks ||
          null,

        userId,
      }
    );

  return getById(
    subjectType,
    result.insertId
  );
}

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function updateRecord({
  subjectType,
  id,

  category,
  programClass,

  startDatetime,
  endDatetime,

  reason,
  referenceNo,
  remarks,

  updatedBy,
}) {
  const config =
    getConfig(
      subjectType
    );

  const [
    result,
  ] =
    await pool.query(
      `
        UPDATE ${config.table}

        SET
          program_class =
            :programClass,

          absence_category =
            :category,

          start_datetime =
            :startDatetime,

          end_datetime =
            :endDatetime,

          reason =
            :reason,

          reference_no =
            :referenceNo,

          remarks =
            :remarks,

          updated_by =
            :updatedBy

        WHERE
          id =
          :id

          AND
          record_status =
          'ACTIVE'
      `,
      {
        id,

        programClass:
          programClass ||
          null,

        category,

        startDatetime,
        endDatetime,

        reason:
          reason ||
          null,

        referenceNo:
          referenceNo ||
          null,

        remarks:
          remarks ||
          null,

        updatedBy,
      }
    );

  if (
    !result.affectedRows
  ) {
    return null;
  }

  return getById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancelRecord({
  subjectType,
  id,

  cancelledBy,
  cancellationReason,
}) {
  const config =
    getConfig(
      subjectType
    );

  const [
    result,
  ] =
    await pool.query(
      `
        UPDATE ${config.table}

        SET
          record_status =
            'CANCELLED',

          cancelled_by =
            :cancelledBy,

          cancelled_at =
            NOW(),

          cancellation_reason =
            :cancellationReason,

          updated_by =
            :cancelledBy

        WHERE
          id =
          :id

          AND
          record_status =
          'ACTIVE'
      `,
      {
        id,

        cancelledBy,

        cancellationReason:
          cancellationReason ||
          null,
      }
    );

  if (
    !result.affectedRows
  ) {
    return null;
  }

  return getById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| TRAINEE LIST
|--------------------------------------------------------------------------
*/

async function traineeList(
  options
) {
  const conditions = [
    "t.is_deleted = 0",

    "t.is_staff_exempt = 0",
  ];

  const params = {};

  if (
    options.search
  ) {
    conditions.push(`
      (
        t.employee_id LIKE :search

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
        m.program_class LIKE :search

        OR
        m.reason LIKE :search
      )
    `);

    params.search =
      `%${options.search}%`;
  }

  if (
    options.category
  ) {
    conditions.push(
      "m.absence_category = :category"
    );

    params.category =
      options.category;
  }

  if (
    options.status
  ) {
    conditions.push(
      "m.record_status = :status"
    );

    params.status =
      options.status;
  }

  if (
    options.dateFrom
  ) {
    conditions.push(
      "m.end_datetime >= :dateFrom"
    );

    params.dateFrom =
      `${options.dateFrom} 00:00:00`;
  }

  if (
    options.dateTo
  ) {
    conditions.push(
      "m.start_datetime <= :dateTo"
    );

    params.dateTo =
      `${options.dateTo} 23:59:59`;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          m.*,

          'TRAINEE'
            AS subject_type,

          t.id
            AS subject_id,

          t.employee_id,

          CONCAT_WS(
            ' ',
            t.first_name,
            t.last_name
          )
            AS subject_name,

          t.father_name,

          c.course_name,

          c.start_date
            AS course_start_date,

          c.end_date
            AS course_end_date,

          CASE
            WHEN
              c.start_date IS NULL
              OR c.end_date IS NULL
              THEN 'DATE_NOT_SET'

            WHEN
              DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00')) <
              c.start_date
              THEN 'UPCOMING'

            WHEN
              DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'))
              BETWEEN
                c.start_date
              AND
                c.end_date
              THEN 'ACTIVE'

            ELSE 'COMPLETED'
          END
            AS course_status,

          p.platoon_number,

          NULL
            AS category_name,

          NULL
            AS branch_name,

          u.full_name
            AS marked_by_name,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name,

          canceller.full_name
            AS cancelled_by_name

        FROM trainee_manual_absence m

        JOIN trainees t
          ON t.id =
             m.trainee_id

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        LEFT JOIN users u
          ON u.id =
             m.marked_by

        LEFT JOIN users creator
          ON creator.id =
             m.created_by

        LEFT JOIN users updater
          ON updater.id =
             m.updated_by

        LEFT JOIN users canceller
          ON canceller.id =
             m.cancelled_by

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          m.start_datetime DESC,
          m.id DESC
      `,
      params
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| STAFF LIST
|--------------------------------------------------------------------------
*/

async function staffList(
  options
) {
  const conditions = [
    "s.is_deleted = 0",
  ];

  const params = {};

  if (
    options.search
  ) {
    conditions.push(`
      (
        s.employee_id LIKE :search

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

        OR
        m.program_class LIKE :search

        OR
        m.reason LIKE :search
      )
    `);

    params.search =
      `%${options.search}%`;
  }

  if (
    options.category
  ) {
    conditions.push(
      "m.absence_category = :category"
    );

    params.category =
      options.category;
  }

  if (
    options.status
  ) {
    conditions.push(
      "m.record_status = :status"
    );

    params.status =
      options.status;
  }

  if (
    options.dateFrom
  ) {
    conditions.push(
      "m.end_datetime >= :dateFrom"
    );

    params.dateFrom =
      `${options.dateFrom} 00:00:00`;
  }

  if (
    options.dateTo
  ) {
    conditions.push(
      "m.start_datetime <= :dateTo"
    );

    params.dateTo =
      `${options.dateTo} 23:59:59`;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          m.*,

          'STAFF'
            AS subject_type,

          s.id
            AS subject_id,

          s.employee_id,

          CONCAT_WS(
            ' ',
            s.first_name,
            s.last_name
          )
            AS subject_name,

          s.father_name,

          NULL
            AS course_name,

          NULL
            AS course_start_date,

          NULL
            AS course_end_date,

          NULL
            AS course_status,

          NULL
            AS platoon_number,

          sc.category_name,
          sb.branch_name,

          u.full_name
            AS marked_by_name,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name,

          canceller.full_name
            AS cancelled_by_name

        FROM staff_manual_absence m

        JOIN staff s
          ON s.id =
             m.staff_id

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        LEFT JOIN users u
          ON u.id =
             m.marked_by

        LEFT JOIN users creator
          ON creator.id =
             m.created_by

        LEFT JOIN users updater
          ON updater.id =
             m.updated_by

        LEFT JOIN users canceller
          ON canceller.id =
             m.cancelled_by

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          m.start_datetime DESC,
          m.id DESC
      `,
      params
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| COMBINED LIST
|--------------------------------------------------------------------------
*/

async function getRecords({
  subjectType,
  search = "",
  category = null,
  status = null,
  dateFrom = null,
  dateTo = null,
}) {
  const options = {
    search,
    category,
    status,
    dateFrom,
    dateTo,
  };

  if (
    subjectType ===
    "TRAINEE"
  ) {
    return traineeList(
      options
    );
  }

  if (
    subjectType ===
    "STAFF"
  ) {
    return staffList(
      options
    );
  }

  const [
    trainees,
    staff,
  ] =
    await Promise.all([
      traineeList(
        options
      ),

      staffList(
        options
      ),
    ]);

  return [
    ...trainees,
    ...staff,
  ].sort(
    (
      a,
      b
    ) =>
      new Date(
        b.start_datetime
      ) -
      new Date(
        a.start_datetime
      )
  );
}

module.exports = {
  normalizeSubjectType,

  getSubjectById,

  getSubjectsByEmployeeId,

  resolveSubjectForManualAbsence,

  validateSubjectPeriod,

  getById,

  createRecord,

  updateRecord,

  cancelRecord,

  getRecords,
};