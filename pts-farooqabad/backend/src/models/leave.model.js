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
    leaveTable:
      "trainee_leaves",

    subjectIdColumn:
      "trainee_id",
  },

  STAFF: {
    leaveTable:
      "staff_leaves",

    subjectIdColumn:
      "staff_id",
  },
};

function normalizeSubjectType(
  value
) {
  const subjectType =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();

  if (
    !Object.prototype.hasOwnProperty.call(
      SUBJECT_CONFIG,
      subjectType
    )
  ) {
    return null;
  }

  return subjectType;
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

function dateOnly(
  value
) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() +
        1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        value.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;
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
| ALL SUBJECT MATCHES BY EMPLOYEE ID
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
| LEGACY SINGLE SUBJECT LOOKUP
|--------------------------------------------------------------------------
|
| Safe behavior:
|
| exactly 1 match => return
| multiple matches => return null
|--------------------------------------------------------------------------
*/

async function getSubjectByEmployeeId(
  subjectType,
  employeeId
) {
  const rows =
    await getSubjectsByEmployeeId(
      subjectType,
      employeeId
    );

  if (
    rows.length !==
    1
  ) {
    return null;
  }

  return rows[0];
}

/*
|--------------------------------------------------------------------------
| RESOLVE SUBJECT FOR LEAVE
|--------------------------------------------------------------------------
|
| TRAINEE:
|
| Employee ID
| + reference date
| + Course dates
| + optional Course / Platoon
|
| STAFF:
|
| Employee ID
| + optional Category / Branch
|--------------------------------------------------------------------------
*/

async function resolveSubjectForLeave({
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

  /*
  |--------------------------------------------------------------------------
  | TRAINEE
  |--------------------------------------------------------------------------
  */

  if (
    normalized ===
    "TRAINEE"
  ) {
    const cleanDate =
      dateOnly(
        referenceDate
      );

    if (!cleanDate) {
      return {
        status:
          "INVALID_DATE",

        subject:
          null,

        matches:
          [],

        message:
          "Leave date is required for trainee resolution.",
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
      candidates,
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
      candidates.length ===
      0
    ) {
      return {
        status:
          "NOT_FOUND",

        subject:
          null,

        matches:
          [],

        message:
          "Trainee Employee ID / Cap No. not found with the supplied Course/Platoon context.",
      };
    }

    const datedMatches =
      candidates.filter(
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

          if (
            !start ||
            !end
          ) {
            return false;
          }

          return (
            cleanDate >=
              start &&
            cleanDate <=
              end
          );
        }
      );

    if (
      datedMatches.length ===
      1
    ) {
      return {
        status:
          "MATCHED",

        subject:
          datedMatches[0],

        matches:
          datedMatches,

        message:
          null,
      };
    }

    if (
      datedMatches.length >
      1
    ) {
      return {
        status:
          "AMBIGUOUS",

        subject:
          null,

        matches:
          datedMatches,

        message:
          "Same Employee ID / Cap No. has more than one Course active on the Leave date. Add Course/Platoon context or correct overlapping Course dates.",
      };
    }

    const missingDateCourses =
      candidates.filter(
        (
          item
        ) =>
          !item.course_start_date ||
          !item.course_end_date
      );

    if (
      missingDateCourses.length
    ) {
      return {
        status:
          "COURSE_DATE_NOT_SET",

        subject:
          null,

        matches:
          candidates,

        message:
          "Matching trainee Course exists but Course Start/End Date is not set. Set Course dates first.",
      };
    }

    return {
      status:
        "NO_ACTIVE_COURSE",

      subject:
        null,

      matches:
        candidates,

      message:
        `Employee ID / Cap No. ${cleanEmployeeId} exists, but no matching Course covers Leave date ${cleanDate}.`,
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
        "Same Employee ID has multiple Staff records. Add Staff Category and Branch context.",
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
      "PTS Staff Employee ID not found with the supplied Category/Branch context.",
  };
}

/*
|--------------------------------------------------------------------------
| VALIDATE SUBJECT AGAINST LEAVE PERIOD
|--------------------------------------------------------------------------
*/

async function validateSubjectLeavePeriod({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
}) {
  const normalized =
    normalizeSubjectType(
      subjectType
    );

  if (
    normalized !==
    "TRAINEE"
  ) {
    return {
      valid:
        true,

      message:
        null,

      subject:
        await getSubjectById(
          normalized,
          subjectId
        ),
    };
  }

  const subject =
    await getSubjectById(
      "TRAINEE",
      subjectId
    );

  if (!subject) {
    return {
      valid:
        false,

      message:
        "Trainee not found.",

      subject:
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

      message:
        "Selected trainee Course Start/End Date is not set.",

      subject,
    };
  }

  const leaveStart =
    dateOnly(
      startDatetime
    );

  const leaveEnd =
    dateOnly(
      endDatetime
    );

  if (
    leaveStart <
      courseStart ||
    leaveStart >
      courseEnd
  ) {
    return {
      valid:
        false,

      message:
        `Leave Start Date must fall within Course period ${courseStart} to ${courseEnd}.`,

      subject,
    };
  }

  if (
    leaveEnd <
      courseStart ||
    leaveEnd >
      courseEnd
  ) {
    return {
      valid:
        false,

      message:
        `Leave End Date must fall within Course period ${courseStart} to ${courseEnd}.`,

      subject,
    };
  }

  return {
    valid:
      true,

    message:
      null,

    subject,
  };
}

/*
|--------------------------------------------------------------------------
| SINGLE LEAVE
|--------------------------------------------------------------------------
*/

async function getLeaveById(
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
          l.*,

          creator.full_name
            AS created_by_name,

          submitter.full_name
            AS submitted_by_name,

          approver.full_name
            AS approved_by_name,

          rejector.full_name
            AS rejected_by_name,

          canceller.full_name
            AS cancelled_by_name

        FROM ${config.leaveTable} l

        LEFT JOIN users creator
          ON creator.id =
             l.created_by

        LEFT JOIN users submitter
          ON submitter.id =
             l.submitted_by

        LEFT JOIN users approver
          ON approver.id =
             l.approved_by

        LEFT JOIN users rejector
          ON rejector.id =
             l.rejected_by

        LEFT JOIN users canceller
          ON canceller.id =
             l.cancelled_by

        WHERE
          l.id =
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

async function hasLeaveOverlap({
  subjectType,
  subjectId,
  startDatetime,
  endDatetime,
  excludeLeaveId = null,
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
    excludeLeaveId
  ) {
    excludeSql =
      "AND id <> :excludeLeaveId";

    params.excludeLeaveId =
      excludeLeaveId;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id

        FROM ${config.leaveTable}

        WHERE
          ${config.subjectIdColumn}
          =
          :subjectId

          AND
          workflow_status
          IN
          (
            'PENDING',
            'APPROVED'
          )

          AND
          start_datetime <=
          :endDatetime

          AND
          end_datetime >=
          :startDatetime

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
| CREATE NORMAL
|--------------------------------------------------------------------------
*/

async function createNormalLeave({
  subjectType,
  subjectId,

  leaveType,
  reason,
  referenceNo,

  startDatetime,
  endDatetime,

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
        INSERT INTO ${config.leaveTable}
        (
          ${config.subjectIdColumn},

          leave_type,
          leave_category,
          workflow_status,

          reason,
          reference_no,

          start_datetime,
          end_datetime,

          biometric_exempt,

          approved_by,
          approval_datetime,

          remarks,

          created_by,
          updated_by
        )

        VALUES
        (
          :subjectId,

          :leaveType,
          'NORMAL',
          'APPROVED',

          :reason,
          :referenceNo,

          :startDatetime,
          :endDatetime,

          1,

          :userId,
          NOW(),

          :remarks,

          :userId,
          :userId
        )
      `,
      {
        subjectId,
        leaveType,

        reason:
          reason ||
          null,

        referenceNo:
          referenceNo ||
          null,

        startDatetime,
        endDatetime,

        remarks:
          remarks ||
          null,

        userId,
      }
    );

  return getLeaveById(
    subjectType,
    result.insertId
  );
}

/*
|--------------------------------------------------------------------------
| CREATE EMERGENCY
|--------------------------------------------------------------------------
*/

async function createEmergencyLeave({
  subjectType,
  subjectId,

  leaveType,
  reason,
  referenceNo,

  startDatetime,
  endDatetime,

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
        INSERT INTO ${config.leaveTable}
        (
          ${config.subjectIdColumn},

          leave_type,
          leave_category,
          workflow_status,

          reason,
          reference_no,

          start_datetime,
          end_datetime,

          biometric_exempt,

          submitted_by,
          submitted_at,

          remarks,

          created_by,
          updated_by
        )

        VALUES
        (
          :subjectId,

          :leaveType,
          'EMERGENCY',
          'PENDING',

          :reason,
          :referenceNo,

          :startDatetime,
          :endDatetime,

          0,

          :userId,
          NOW(),

          :remarks,

          :userId,
          :userId
        )
      `,
      {
        subjectId,
        leaveType,

        reason:
          reason ||
          null,

        referenceNo:
          referenceNo ||
          null,

        startDatetime,
        endDatetime,

        remarks:
          remarks ||
          null,

        userId,
      }
    );

  return getLeaveById(
    subjectType,
    result.insertId
  );
}

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function updateLeave({
  subjectType,
  id,

  leaveType,
  reason,
  referenceNo,

  startDatetime,
  endDatetime,

  remarks,
  updatedBy,
}) {
  const config =
    getConfig(
      subjectType
    );

  await pool.query(
    `
      UPDATE ${config.leaveTable}

      SET
        leave_type =
          :leaveType,

        reason =
          :reason,

        reference_no =
          :referenceNo,

        start_datetime =
          :startDatetime,

        end_datetime =
          :endDatetime,

        remarks =
          :remarks,

        updated_by =
          :updatedBy

      WHERE
        id =
        :id
    `,
    {
      id,

      leaveType,

      reason:
        reason ||
        null,

      referenceNo:
        referenceNo ||
        null,

      startDatetime,
      endDatetime,

      remarks:
        remarks ||
        null,

      updatedBy,
    }
  );

  return getLeaveById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| APPROVE
|--------------------------------------------------------------------------
*/

async function approveEmergencyLeave({
  subjectType,
  id,
  approvedBy,
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
        UPDATE ${config.leaveTable}

        SET
          workflow_status =
            'APPROVED',

          biometric_exempt =
            1,

          approved_by =
            :approvedBy,

          approval_datetime =
            NOW(),

          rejected_by =
            NULL,

          rejection_datetime =
            NULL,

          rejection_reason =
            NULL,

          updated_by =
            :approvedBy

        WHERE
          id =
          :id

          AND
          leave_category =
          'EMERGENCY'

          AND
          workflow_status =
          'PENDING'
      `,
      {
        id,
        approvedBy,
      }
    );

  if (
    result.affectedRows <
    1
  ) {
    return null;
  }

  return getLeaveById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| REJECT
|--------------------------------------------------------------------------
*/

async function rejectEmergencyLeave({
  subjectType,
  id,
  rejectedBy,
  rejectionReason,
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
        UPDATE ${config.leaveTable}

        SET
          workflow_status =
            'REJECTED',

          biometric_exempt =
            0,

          rejected_by =
            :rejectedBy,

          rejection_datetime =
            NOW(),

          rejection_reason =
            :rejectionReason,

          updated_by =
            :rejectedBy

        WHERE
          id =
          :id

          AND
          leave_category =
          'EMERGENCY'

          AND
          workflow_status =
          'PENDING'
      `,
      {
        id,
        rejectedBy,

        rejectionReason:
          rejectionReason ||
          null,
      }
    );

  if (
    result.affectedRows <
    1
  ) {
    return null;
  }

  return getLeaveById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

async function cancelLeave({
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
        UPDATE ${config.leaveTable}

        SET
          workflow_status =
            'CANCELLED',

          biometric_exempt =
            0,

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
          workflow_status
          NOT IN
          (
            'CANCELLED',
            'REJECTED'
          )
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
    result.affectedRows <
    1
  ) {
    return null;
  }

  return getLeaveById(
    subjectType,
    id
  );
}

/*
|--------------------------------------------------------------------------
| TRAINEE LEAVES
|--------------------------------------------------------------------------
*/

async function getTraineeLeaves({
  search = "",
  status = null,
  category = null,
  dateFrom = null,
  dateTo = null,
}) {
  const conditions = [
    "t.is_deleted = 0",
    "t.is_staff_exempt = 0",
  ];

  const params = {};

  if (search) {
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
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (status) {
    conditions.push(
      "l.workflow_status = :status"
    );

    params.status =
      status;
  }

  if (category) {
    conditions.push(
      "l.leave_category = :category"
    );

    params.category =
      category;
  }

  if (dateFrom) {
    conditions.push(
      "l.end_datetime >= :dateFrom"
    );

    params.dateFrom =
      `${dateFrom} 00:00:00`;
  }

  if (dateTo) {
    conditions.push(
      "l.start_datetime <= :dateTo"
    );

    params.dateTo =
      `${dateTo} 23:59:59`;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          l.id,

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

          p.platoon_number,

          NULL
            AS category_name,

          NULL
            AS branch_name,

          l.leave_type,
          l.leave_category,
          l.workflow_status,

          l.reason,
          l.reference_no,

          CAST(l.start_datetime AS CHAR) AS start_datetime,
          CAST(l.end_datetime AS CHAR) AS end_datetime,

          l.biometric_exempt,

          l.submitted_by,

          submitter.full_name
            AS submitted_by_name,

          l.submitted_at,

          l.approved_by,

          approver.full_name
            AS approved_by_name,

          l.approval_datetime,

          l.rejected_by,

          rejector.full_name
            AS rejected_by_name,

          l.rejection_datetime,
          l.rejection_reason,

          l.cancelled_by,

          canceller.full_name
            AS cancelled_by_name,

          l.cancelled_at,
          l.cancellation_reason,

          l.remarks,

          l.created_by,

          creator.full_name
            AS created_by_name,

          l.created_at,
          l.updated_at

        FROM trainee_leaves l

        JOIN trainees t
          ON t.id =
             l.trainee_id

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN platoons p
          ON p.id =
             t.platoon_id

        LEFT JOIN users submitter
          ON submitter.id =
             l.submitted_by

        LEFT JOIN users approver
          ON approver.id =
             l.approved_by

        LEFT JOIN users rejector
          ON rejector.id =
             l.rejected_by

        LEFT JOIN users canceller
          ON canceller.id =
             l.cancelled_by

        LEFT JOIN users creator
          ON creator.id =
             l.created_by

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          l.start_datetime DESC,
          l.id DESC
      `,
      params
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| STAFF LEAVES
|--------------------------------------------------------------------------
*/

async function getStaffLeaves({
  search = "",
  status = null,
  category = null,
  dateFrom = null,
  dateTo = null,
}) {
  const conditions = [
    "s.is_deleted = 0",
  ];

  const params = {};

  if (search) {
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
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (status) {
    conditions.push(
      "l.workflow_status = :status"
    );

    params.status =
      status;
  }

  if (category) {
    conditions.push(
      "l.leave_category = :category"
    );

    params.category =
      category;
  }

  if (dateFrom) {
    conditions.push(
      "l.end_datetime >= :dateFrom"
    );

    params.dateFrom =
      `${dateFrom} 00:00:00`;
  }

  if (dateTo) {
    conditions.push(
      "l.start_datetime <= :dateTo"
    );

    params.dateTo =
      `${dateTo} 23:59:59`;
  }

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          l.id,

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
            AS platoon_number,

          sc.category_name,
          sb.branch_name,

          l.leave_type,
          l.leave_category,
          l.workflow_status,

          l.reason,
          l.reference_no,

          CAST(l.start_datetime AS CHAR) AS start_datetime,
          CAST(l.end_datetime AS CHAR) AS end_datetime,

          l.biometric_exempt,

          l.submitted_by,

          submitter.full_name
            AS submitted_by_name,

          l.submitted_at,

          l.approved_by,

          approver.full_name
            AS approved_by_name,

          l.approval_datetime,

          l.rejected_by,

          rejector.full_name
            AS rejected_by_name,

          l.rejection_datetime,
          l.rejection_reason,

          l.cancelled_by,

          canceller.full_name
            AS cancelled_by_name,

          l.cancelled_at,
          l.cancellation_reason,

          l.remarks,

          l.created_by,

          creator.full_name
            AS created_by_name,

          l.created_at,
          l.updated_at

        FROM staff_leaves l

        JOIN staff s
          ON s.id =
             l.staff_id

        LEFT JOIN staff_categories sc
          ON sc.id =
             s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id =
             s.branch_id

        LEFT JOIN users submitter
          ON submitter.id =
             l.submitted_by

        LEFT JOIN users approver
          ON approver.id =
             l.approved_by

        LEFT JOIN users rejector
          ON rejector.id =
             l.rejected_by

        LEFT JOIN users canceller
          ON canceller.id =
             l.cancelled_by

        LEFT JOIN users creator
          ON creator.id =
             l.created_by

        WHERE
          ${conditions.join(
            " AND "
          )}

        ORDER BY
          l.start_datetime DESC,
          l.id DESC
      `,
      params
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| ALL LEAVES
|--------------------------------------------------------------------------
*/

async function getLeaves({
  subjectType = null,
  search = "",
  status = null,
  category = null,
  dateFrom = null,
  dateTo = null,
}) {
  const normalized =
    subjectType
      ? normalizeSubjectType(
          subjectType
        )
      : null;

  const options = {
    search,
    status,
    category,
    dateFrom,
    dateTo,
  };

  if (
    normalized ===
    "TRAINEE"
  ) {
    return getTraineeLeaves(
      options
    );
  }

  if (
    normalized ===
    "STAFF"
  ) {
    return getStaffLeaves(
      options
    );
  }

  const [
    traineeRows,
    staffRows,
  ] =
    await Promise.all([
      getTraineeLeaves(
        options
      ),

      getStaffLeaves(
        options
      ),
    ]);

  return [
    ...traineeRows,
    ...staffRows,
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


/*
|--------------------------------------------------------------------------
| TRAINEE APPROVED LEAVE CAP
|--------------------------------------------------------------------------
|
| The cap is configured per Course but applied individually to each trainee.
| A trainee record belongs to one Course, therefore counting by trainee_id
| keeps historical Course records separate automatically.
|
|--------------------------------------------------------------------------
*/

async function getTraineeApprovedLeaveCapInfo({
  traineeId,
  excludeLeaveId =
    null,
}) {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          t.id AS trainee_id,
          t.employee_id,
          t.course_id,

          c.course_name,

          clc.max_approved_leaves,

          COUNT(
            CASE
              WHEN
                tl.workflow_status
                IN
                (
                  'APPROVED',
                  'COMPLETED'
                )

                AND
                (
                  :excludeLeaveId IS NULL
                  OR
                  tl.id <> :excludeLeaveId
                )
              THEN tl.id
              ELSE NULL
            END
          ) AS approved_leave_count

        FROM trainees t

        LEFT JOIN courses c
          ON c.id =
             t.course_id

        LEFT JOIN course_leave_caps clc
          ON clc.course_id =
             t.course_id

        LEFT JOIN trainee_leaves tl
          ON tl.trainee_id =
             t.id

        WHERE
          t.id =
          :traineeId

        GROUP BY
          t.id,
          t.employee_id,
          t.course_id,
          c.course_name,
          clc.max_approved_leaves

        LIMIT 1
      `,
      {
        traineeId,

        excludeLeaveId:
          excludeLeaveId ||
          null,
      }
    );

  if (
    !rows.length
  ) {
    return null;
  }

  const row =
    rows[0];

  return {
    ...row,

    max_approved_leaves:
      row.max_approved_leaves ===
      null
        ? null
        : Number(
            row.max_approved_leaves
          ),

    approved_leave_count:
      Number(
        row.approved_leave_count ||
        0
      ),
  };
}

module.exports = {
  normalizeSubjectType,

  getSubjectById,

  getSubjectsByEmployeeId,

  getSubjectByEmployeeId,

  resolveSubjectForLeave,

  validateSubjectLeavePeriod,

  getLeaveById,

  getLeaves,

  hasLeaveOverlap,

  createNormalLeave,

  createEmergencyLeave,

  updateLeave,

  approveEmergencyLeave,

  rejectEmergencyLeave,

  cancelLeave,

  getTraineeApprovedLeaveCapInfo,
};