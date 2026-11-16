const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| SUBJECT CONFIGURATION
|--------------------------------------------------------------------------
*/

const SUBJECT_CONFIG = {
  TRAINEE: {
    table:
      "trainee_outdoor",

    subjectIdColumn:
      "trainee_id",
  },

  STAFF: {
    table:
      "staff_outdoor",

    subjectIdColumn:
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

  return SUBJECT_CONFIG[
    type
  ]
    ? type
    : null;
}

function getConfig(
  subjectType
) {
  const normalized =
    normalizeSubjectType(
      subjectType
    );

  if (!normalized) {
    throw new Error(
      "Invalid subject type."
    );
  }

  return {
    subjectType:
      normalized,

    ...SUBJECT_CONFIG[
      normalized
    ],
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
  const normalized =
    normalizeSubjectType(
      subjectType
    );

  if (!normalized) {
    return null;
  }

  if (
    normalized ===
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
| Future Excel Import / automatic resolution ke liye reusable.
|--------------------------------------------------------------------------
*/

async function getSubjectsByEmployeeId(
  subjectType,
  employeeId
) {
  const normalized =
    normalizeSubjectType(
      subjectType
    );

  const cleanEmployeeId =
    cleanText(
      employeeId
    );

  if (
    !normalized ||
    !cleanEmployeeId
  ) {
    return [];
  }

  if (
    normalized ===
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
| DATE-AWARE SUBJECT RESOLUTION
|--------------------------------------------------------------------------
|
| Future bulk import ke liye.
|--------------------------------------------------------------------------
*/

async function resolveSubjectForOutdoor({
  subjectType,
  employeeId,
  referenceDate,

  courseName = null,
  platoonNumber = null,

  categoryName = null,
  branchName = null,
}) {
  const normalized =
    normalizeSubjectType(
      subjectType
    );

  const cleanEmployeeId =
    cleanText(
      employeeId
    );

  if (
    !normalized ||
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

  if (
    normalized ===
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
          "Outdoor date is required.",
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
| VALIDATE SINGLE PERIOD AGAINST TRAINEE COURSE
|--------------------------------------------------------------------------
*/

async function validateSubjectPeriod({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
  periodLabel = "Period",
}) {
  const normalized =
    normalizeSubjectType(
      subjectType
    );

  if (!normalized) {
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
      normalized,
      subjectId
    );

  if (!subject) {
    return {
      valid:
        false,

      subject:
        null,

      message:
        normalized ===
        "TRAINEE"
          ? "Trainee not found."
          : "PTS Staff member not found.",
    };
  }

  if (
    normalized ===
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

  const periodStart =
    dateOnly(
      startDatetime
    );

  const periodEnd =
    dateOnly(
      endDatetime
    );

  if (
    !periodStart ||
    !periodEnd
  ) {
    return {
      valid:
        false,

      subject,

      message:
        `${periodLabel}: valid Start and End Date/Time are required.`,
    };
  }

  if (
    periodStart <
      courseStart ||
    periodStart >
      courseEnd
  ) {
    return {
      valid:
        false,

      subject,

      message:
        `${periodLabel} Start Date must fall within Course period ${courseStart} to ${courseEnd}.`,
    };
  }

  if (
    periodEnd <
      courseStart ||
    periodEnd >
      courseEnd
  ) {
    return {
      valid:
        false,

      subject,

      message:
        `${periodLabel} End Date must fall within Course period ${courseStart} to ${courseEnd}.`,
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
| VALIDATE ALL OUTDOOR / REST PERIODS
|--------------------------------------------------------------------------
*/

async function validateOutdoorCoursePeriods({
  subjectType,
  subjectId,

  startDatetime,
  endDatetime,

  medicalRest = false,
  medicalRestStartDatetime = null,
  medicalRestEndDatetime = null,

  homeRest = false,
  homeRestStartDatetime = null,
  homeRestEndDatetime = null,
}) {
  const outdoorCheck =
    await validateSubjectPeriod({
      subjectType,
      subjectId,

      startDatetime,
      endDatetime,

      periodLabel:
        "Outdoor",
    });

  if (
    !outdoorCheck.valid
  ) {
    return outdoorCheck;
  }

  if (
    medicalRest
  ) {
    const medicalCheck =
      await validateSubjectPeriod({
        subjectType,
        subjectId,

        startDatetime:
          medicalRestStartDatetime,

        endDatetime:
          medicalRestEndDatetime,

        periodLabel:
          "Medical Rest",
      });

    if (
      !medicalCheck.valid
    ) {
      return medicalCheck;
    }
  }

  if (
    homeRest
  ) {
    const homeCheck =
      await validateSubjectPeriod({
        subjectType,
        subjectId,

        startDatetime:
          homeRestStartDatetime,

        endDatetime:
          homeRestEndDatetime,

        periodLabel:
          "Home Rest",
      });

    if (
      !homeCheck.valid
    ) {
      return homeCheck;
    }
  }

  return {
    valid:
      true,

    subject:
      outdoorCheck.subject,

    message:
      null,
  };
}

/*
|--------------------------------------------------------------------------
| SINGLE RECORD
|--------------------------------------------------------------------------
*/

async function getOutdoorById(
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
          o.*,

          o.medical_rest_start
            AS medical_rest_start_datetime,

          o.medical_rest_end
            AS medical_rest_end_datetime,

          o.home_rest_start
            AS home_rest_start_datetime,

          o.home_rest_end
            AS home_rest_end_datetime,

          authorizer.full_name
            AS authorized_by_name,

          creator.full_name
            AS created_by_name,

          updater.full_name
            AS updated_by_name,

          canceller.full_name
            AS cancelled_by_name

        FROM ${config.table} o

        LEFT JOIN users authorizer
          ON authorizer.id =
             o.authorized_by

        LEFT JOIN users creator
          ON creator.id =
             o.created_by

        LEFT JOIN users updater
          ON updater.id =
             o.updated_by

        LEFT JOIN users canceller
          ON canceller.id =
             o.cancelled_by

        WHERE
          o.id =
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
        config.subjectIdColumn
      ],
  };
}

/*
|--------------------------------------------------------------------------
| OVERLAP
|--------------------------------------------------------------------------
*/

async function hasOutdoorOverlap({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
  excludeId = null,
}) {
  const config =
    getConfig(
      subjectType
    );

  const params = {
    subjectId,
    startDatetime,
    endDatetime,
  };

  let excludeSql =
    "";

  if (
    excludeId
  ) {
    excludeSql =
      "AND id <> :excludeId";

    params.excludeId =
      excludeId;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id

        FROM ${config.table}

        WHERE
          ${config.subjectIdColumn}
          =
          :subjectId

          AND
          workflow_status =
          'ACTIVE'

          AND
          start_datetime <=
          :endDatetime

          AND
          (
            end_datetime IS NULL

            OR
            end_datetime >=
            :startDatetime
          )

          ${excludeSql}

        LIMIT 1
      `,
      params
    );

  return (
    rows.length >
    0
  );
}

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function createOutdoor({
  subjectType,
  subjectId,

  outdoorPurpose,
  location,

  startDatetime,
  endDatetime,

  referenceNo,

  doctorName,
  doctorCheckedDatetime,
  doctorRecommendation,

  medicalRest,
  medicalRestStartDatetime,
  medicalRestEndDatetime,

  homeRest,
  homeRestStartDatetime,
  homeRestEndDatetime,

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
          ${config.subjectIdColumn},

          outdoor_purpose,
          reference_no,
          location,

          start_datetime,
          end_datetime,

          workflow_status,

          doctor_name,
          doctor_checked_datetime,
          doctor_recommendation,

          medical_rest,
          medical_rest_start,
          medical_rest_end,

          home_rest,
          home_rest_start,
          home_rest_end,

          authorized_by,
          authorization_datetime,

          remarks,

          created_by,
          updated_by
        )

        VALUES
        (
          :subjectId,

          :outdoorPurpose,
          :referenceNo,
          :location,

          :startDatetime,
          :endDatetime,

          'ACTIVE',

          :doctorName,
          :doctorCheckedDatetime,
          :doctorRecommendation,

          :medicalRest,
          :medicalRestStartDatetime,
          :medicalRestEndDatetime,

          :homeRest,
          :homeRestStartDatetime,
          :homeRestEndDatetime,

          :userId,
          NOW(),

          :remarks,

          :userId,
          :userId
        )
      `,
      {
        subjectId,

        outdoorPurpose,

        referenceNo:
          referenceNo ||
          null,

        location:
          location ||
          null,

        startDatetime,

        endDatetime:
          endDatetime ||
          null,

        doctorName:
          doctorName ||
          null,

        doctorCheckedDatetime:
          doctorCheckedDatetime ||
          null,

        doctorRecommendation:
          doctorRecommendation ||
          null,

        medicalRest:
          medicalRest
            ? 1
            : 0,

        medicalRestStartDatetime:
          medicalRest
            ? medicalRestStartDatetime
            : null,

        medicalRestEndDatetime:
          medicalRest
            ? medicalRestEndDatetime
            : null,

        homeRest:
          homeRest
            ? 1
            : 0,

        homeRestStartDatetime:
          homeRest
            ? homeRestStartDatetime
            : null,

        homeRestEndDatetime:
          homeRest
            ? homeRestEndDatetime
            : null,

        remarks:
          remarks ||
          null,

        userId,
      }
    );

  return getOutdoorById(
    subjectType,
    result.insertId
  );
}

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function updateOutdoor({
  subjectType,
  id,

  outdoorPurpose,
  location,

  startDatetime,
  endDatetime,

  referenceNo,

  doctorName,
  doctorCheckedDatetime,
  doctorRecommendation,

  medicalRest,
  medicalRestStartDatetime,
  medicalRestEndDatetime,

  homeRest,
  homeRestStartDatetime,
  homeRestEndDatetime,

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
          outdoor_purpose =
            :outdoorPurpose,

          reference_no =
            :referenceNo,

          location =
            :location,

          start_datetime =
            :startDatetime,

          end_datetime =
            :endDatetime,

          doctor_name =
            :doctorName,

          doctor_checked_datetime =
            :doctorCheckedDatetime,

          doctor_recommendation =
            :doctorRecommendation,

          medical_rest =
            :medicalRest,

          medical_rest_start =
            :medicalRestStartDatetime,

          medical_rest_end =
            :medicalRestEndDatetime,

          home_rest =
            :homeRest,

          home_rest_start =
            :homeRestStartDatetime,

          home_rest_end =
            :homeRestEndDatetime,

          remarks =
            :remarks,

          updated_by =
            :updatedBy

        WHERE
          id =
          :id

          AND
          workflow_status =
          'ACTIVE'
      `,
      {
        id,

        outdoorPurpose,

        referenceNo:
          referenceNo ||
          null,

        location:
          location ||
          null,

        startDatetime,

        endDatetime:
          endDatetime ||
          null,

        doctorName:
          doctorName ||
          null,

        doctorCheckedDatetime:
          doctorCheckedDatetime ||
          null,

        doctorRecommendation:
          doctorRecommendation ||
          null,

        medicalRest:
          medicalRest
            ? 1
            : 0,

        medicalRestStartDatetime:
          medicalRest
            ? medicalRestStartDatetime
            : null,

        medicalRestEndDatetime:
          medicalRest
            ? medicalRestEndDatetime
            : null,

        homeRest:
          homeRest
            ? 1
            : 0,

        homeRestStartDatetime:
          homeRest
            ? homeRestStartDatetime
            : null,

        homeRestEndDatetime:
          homeRest
            ? homeRestEndDatetime
            : null,

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

  return getOutdoorById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancelOutdoor({
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
          workflow_status =
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
          workflow_status =
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

  return getOutdoorById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| COMPLETE
|--------------------------------------------------------------------------
*/

async function completeOutdoor({
  subjectType,
  id,
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
          workflow_status =
            'COMPLETED',

          updated_by =
            :updatedBy

        WHERE
          id =
          :id

          AND
          workflow_status =
          'ACTIVE'
      `,
      {
        id,
        updatedBy,
      }
    );

  if (
    !result.affectedRows
  ) {
    return null;
  }

  return getOutdoorById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| TRAINEE LIST
|--------------------------------------------------------------------------
*/

async function getTraineeOutdoor({
  search = "",
  status = null,
  dateFrom = null,
  dateTo = null,
  homeRestOnly = false,
  medicalRestOnly = false,
}) {
  const conditions = [
    "t.is_deleted = 0",

    "t.is_staff_exempt = 0",
  ];

  const params = {};

  if (
    search
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
        o.outdoor_purpose LIKE :search

        OR
        o.location LIKE :search
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (
    status
  ) {
    conditions.push(
      "o.workflow_status = :status"
    );

    params.status =
      status;
  }

  if (
    dateFrom
  ) {
    conditions.push(`
      (
        o.end_datetime IS NULL

        OR
        o.end_datetime >=
        :dateFrom
      )
    `);

    params.dateFrom =
      `${dateFrom} 00:00:00`;
  }

  if (
    dateTo
  ) {
    conditions.push(
      "o.start_datetime <= :dateTo"
    );

    params.dateTo =
      `${dateTo} 23:59:59`;
  }

  if (
    homeRestOnly
  ) {
    conditions.push(
      "o.home_rest = 1"
    );
  }

  if (
    medicalRestOnly
  ) {
    conditions.push(
      "o.medical_rest = 1"
    );
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          o.id,

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

          o.outdoor_purpose,
          o.location,

          o.start_datetime,
          o.end_datetime,

          o.workflow_status,
          o.reference_no,

          o.doctor_name,
          o.doctor_checked_datetime,
          o.doctor_recommendation,

          o.medical_rest,

          o.medical_rest_start
            AS medical_rest_start_datetime,

          o.medical_rest_end
            AS medical_rest_end_datetime,

          o.home_rest,

          o.home_rest_start
            AS home_rest_start_datetime,

          o.home_rest_end
            AS home_rest_end_datetime,

          o.authorized_by,

          authorizer.full_name
            AS authorized_by_name,

          o.authorization_datetime,

          o.remarks,

          o.cancelled_by,

          canceller.full_name
            AS cancelled_by_name,

          o.cancelled_at,
          o.cancellation_reason,

          o.created_by,

          creator.full_name
            AS created_by_name,

          o.created_at,
          o.updated_at

        FROM trainee_outdoor o

        JOIN trainees t
          ON t.id =
             o.trainee_id

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        LEFT JOIN users authorizer
          ON authorizer.id =
             o.authorized_by

        LEFT JOIN users creator
          ON creator.id =
             o.created_by

        LEFT JOIN users canceller
          ON canceller.id =
             o.cancelled_by

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          o.start_datetime DESC,
          o.id DESC
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

async function getStaffOutdoor({
  search = "",
  status = null,
  dateFrom = null,
  dateTo = null,
  homeRestOnly = false,
  medicalRestOnly = false,
}) {
  const conditions = [
    "s.is_deleted = 0",
  ];

  const params = {};

  if (
    search
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
        o.outdoor_purpose LIKE :search

        OR
        o.location LIKE :search
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (
    status
  ) {
    conditions.push(
      "o.workflow_status = :status"
    );

    params.status =
      status;
  }

  if (
    dateFrom
  ) {
    conditions.push(`
      (
        o.end_datetime IS NULL

        OR
        o.end_datetime >=
        :dateFrom
      )
    `);

    params.dateFrom =
      `${dateFrom} 00:00:00`;
  }

  if (
    dateTo
  ) {
    conditions.push(
      "o.start_datetime <= :dateTo"
    );

    params.dateTo =
      `${dateTo} 23:59:59`;
  }

  if (
    homeRestOnly
  ) {
    conditions.push(
      "o.home_rest = 1"
    );
  }

  if (
    medicalRestOnly
  ) {
    conditions.push(
      "o.medical_rest = 1"
    );
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          o.id,

          'STAFF'
            AS subject_type,

          s.id
            AS subject_id,

          s.employee_id,

          s.belt_no,

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

          o.outdoor_purpose,
          o.location,

          o.start_datetime,
          o.end_datetime,

          o.workflow_status,
          o.reference_no,

          o.doctor_name,
          o.doctor_checked_datetime,
          o.doctor_recommendation,

          o.medical_rest,

          o.medical_rest_start
            AS medical_rest_start_datetime,

          o.medical_rest_end
            AS medical_rest_end_datetime,

          o.home_rest,

          o.home_rest_start
            AS home_rest_start_datetime,

          o.home_rest_end
            AS home_rest_end_datetime,

          o.authorized_by,

          authorizer.full_name
            AS authorized_by_name,

          o.authorization_datetime,

          o.remarks,

          o.cancelled_by,

          canceller.full_name
            AS cancelled_by_name,

          o.cancelled_at,
          o.cancellation_reason,

          o.created_by,

          creator.full_name
            AS created_by_name,

          o.created_at,
          o.updated_at

        FROM staff_outdoor o

        JOIN staff s
          ON s.id =
             o.staff_id

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        LEFT JOIN users authorizer
          ON authorizer.id =
             o.authorized_by

        LEFT JOIN users creator
          ON creator.id =
             o.created_by

        LEFT JOIN users canceller
          ON canceller.id =
             o.cancelled_by

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          o.start_datetime DESC,
          o.id DESC
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

async function getOutdoorRecords({
  subjectType = null,
  search = "",
  status = null,
  dateFrom = null,
  dateTo = null,
  homeRestOnly = false,
  medicalRestOnly = false,
}) {
  const options = {
    search,
    status,
    dateFrom,
    dateTo,
    homeRestOnly,
    medicalRestOnly,
  };

  if (
    subjectType ===
    "TRAINEE"
  ) {
    return getTraineeOutdoor(
      options
    );
  }

  if (
    subjectType ===
    "STAFF"
  ) {
    return getStaffOutdoor(
      options
    );
  }

  const [
    trainees,
    staff,
  ] =
    await Promise.all([
      getTraineeOutdoor(
        options
      ),

      getStaffOutdoor(
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

  resolveSubjectForOutdoor,

  validateSubjectPeriod,

  validateOutdoorCoursePeriods,

  getOutdoorById,

  getOutdoorRecords,

  hasOutdoorOverlap,

  createOutdoor,

  updateOutdoor,

  cancelOutdoor,

  completeOutdoor,
};