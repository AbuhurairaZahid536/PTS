const {
  pool,
} = require("../config/db");

const {
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require(
  "../integrations/zkbiotime/client"
);

const {
  findZkEmployeeByCode,
  getDefaultAreaId,

  syncCourseToZk,
  syncPlatoonToZk,
} = require(
  "../integrations/zkbiotime/employeeWrite.service"
);


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

function legacyStaffCourseExclusionSql(
  alias = "c",
  indent = "      "
) {
  const nameSql =
    `LOWER(TRIM(COALESCE(${alias}.course_name, '')))`;

  return LEGACY_STAFF_COURSE_PATTERNS
    .map(
      (pattern) =>
        `${nameSql} NOT LIKE '${String(pattern).replace(/'/g, "''")}'`
    )
    .join(`\n${indent}AND\n${indent}`);
}

/*
|--------------------------------------------------------------------------
| IMPORTANT SAFETY RULES
|--------------------------------------------------------------------------
|
| THIS SERVICE MUST NEVER:
|
| - DELETE a PTS Course
| - DELETE a PTS Platoon
| - DELETE a PTS Trainee
| - DELETE Course historical data
| - DELETE ZKBioTime Department on Course completion
| - DELETE ZKBioTime Position on Course completion
|
| Course status behaviour:
|
| DATE_NOT_SET
|   -> NO ACTION
|
| UPCOMING
|   -> NO ACTION
|
| ACTIVE
|   -> Course Department / Platoon Position sync
|   -> eligible trainees create/update in ZKBioTime
|   -> TRAINING_DROP / inactive trainee may be removed from ZK
|
| COMPLETED
|   -> trainee Employee removed from ZKBioTime
|   -> ONLY when no Staff / other active Course owns same Employee ID
|   -> PTS historical record remains permanently
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanText(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}

function pad(
  value
) {
  return String(value).padStart(
    2,
    "0"
  );
}

function todayDate() {
  const now =
    new Date();

  return [
    now.getFullYear(),

    pad(
      now.getMonth() + 1
    ),

    pad(
      now.getDate()
    ),
  ].join("-");
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

      pad(
        value.getMonth() + 1
      ),

      pad(
        value.getDate()
      ),
    ].join("-");
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  return text.substring(
    0,
    10
  );
}

function getEntityId(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value ===
    "object"
  ) {
    return (
      Number(
        value.id ||
        value.pk ||
        0
      ) ||
      null
    );
  }

  return (
    Number(value) ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| COURSE STATUS
|--------------------------------------------------------------------------
|
| Start / End dates are inclusive.
|--------------------------------------------------------------------------
*/

function getCourseStatus(
  course,
  referenceDate =
    todayDate()
) {
  const startDate =
    dateOnly(
      course?.start_date
    );

  const endDate =
    dateOnly(
      course?.end_date
    );

  if (
    !startDate ||
    !endDate
  ) {
    return "DATE_NOT_SET";
  }

  if (
    referenceDate <
    startDate
  ) {
    return "UPCOMING";
  }

  if (
    referenceDate >
    endDate
  ) {
    return "COMPLETED";
  }

  return "ACTIVE";
}

/*
|--------------------------------------------------------------------------
| GET COURSES
|--------------------------------------------------------------------------
|
| courses table contains trainee Course history.
|
| No hard-coded Staff Course names are used here.
|--------------------------------------------------------------------------
*/

async function getManagedCourses({
  courseId = null,
} = {}) {
  const params = {};

  const conditions = [
    `
      ${legacyStaffCourseExclusionSql(
        "c"
      )}
    `,
  ];

  if (courseId) {
    conditions.push(
      `
        c.id =
        :courseId
      `
    );

    params.courseId =
      Number(courseId);
  }

  const whereClause =
    conditions.length
      ? `WHERE ${conditions.join(
          "\nAND\n"
        )}`
      : "";

  const [rows] =
    await pool.query(
      `
        SELECT
          c.*

        FROM courses c

        ${whereClause}

        ORDER BY
          c.start_date ASC,
          c.id ASC
      `,
      params
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| COURSE PLATOONS
|--------------------------------------------------------------------------
*/

async function getCoursePlatoons(
  courseId
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          p.*

        FROM platoons p

        WHERE
          p.course_id =
          :courseId

        ORDER BY
          CAST(
            p.platoon_number
            AS UNSIGNED
          ) ASC,

          p.platoon_number ASC,

          p.id ASC
      `,
      {
        courseId:
          Number(courseId),
      }
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| COURSE TRAINEES
|--------------------------------------------------------------------------
|
| Historical trainee rows remain in PTS.
|--------------------------------------------------------------------------
*/

async function getCourseTrainees(
  courseId
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          t.*,

          p.platoon_number,
          p.platoon_name,

          p.zkbiotime_position_id,
          p.zkbiotime_position_code

        FROM trainees t

        LEFT JOIN platoons p
          ON
            p.id =
            t.platoon_id

        WHERE
          t.course_id =
          :courseId

          AND

          t.is_deleted =
          0

          AND

          COALESCE(
            t.is_staff_exempt,
            0
          ) =
          0

        ORDER BY
          t.id ASC
      `,
      {
        courseId:
          Number(courseId),
      }
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| ONE TRAINEE FOR IMMEDIATE LIFECYCLE SYNC
|--------------------------------------------------------------------------
|
| Add/Edit should not wait for a full Course reconciliation containing
| hundreds/thousands of trainees. This targeted lookup feeds the same safe
| provisionTrainee() rules used by the central Course lifecycle.
|--------------------------------------------------------------------------
*/

async function getTraineeForLifecycle(
  traineeId
) {
  const id =
    Number(traineeId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          t.*,

          p.platoon_number,
          p.platoon_name,

          p.zkbiotime_position_id,
          p.zkbiotime_position_code

        FROM trainees t

        LEFT JOIN platoons p
          ON
            p.id =
            t.platoon_id

        WHERE
          t.id =
          :traineeId

          AND

          t.is_deleted =
          0

          AND

          COALESCE(
            t.is_staff_exempt,
            0
          ) =
          0

        LIMIT 1
      `,
      {
        traineeId:
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
| ACTIVE COURSE MATCHES FOR EMPLOYEE
|--------------------------------------------------------------------------
*/

async function getActiveCourseMatches(
  employeeId,
  referenceDate =
    todayDate()
) {
  const empCode =
    cleanText(
      employeeId
    );

  if (!empCode) {
    return [];
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          t.id
            AS trainee_id,

          t.employee_id,

          t.course_id,

          t.status
            AS trainee_status,

          c.course_name,
          c.start_date,
          c.end_date

        FROM trainees t

        INNER JOIN courses c
          ON
            c.id =
            t.course_id

        WHERE
          TRIM(
            t.employee_id
          ) =
          :employeeId

          AND

          t.is_deleted =
          0

          AND

          COALESCE(
            t.is_staff_exempt,
            0
          ) =
          0

          AND

          ${legacyStaffCourseExclusionSql(
            "c",
            "          "
          )}

          AND

          UPPER(
            COALESCE(
              t.status,
              'ACTIVE'
            )
          )
          NOT IN
          (
            'TRAINING_DROP',
            'INACTIVE',
            'COMPLETED'
          )

          AND

          c.start_date
          IS NOT NULL

          AND

          c.end_date
          IS NOT NULL

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
          empCode,

        referenceDate,
      }
    );

  return rows;
}

/*
|--------------------------------------------------------------------------
| ACTIVE STAFF IDENTITY
|--------------------------------------------------------------------------
|
| Staff lifecycle is separate.
|
| Course lifecycle MUST NOT delete a Staff ZK employee.
|--------------------------------------------------------------------------
*/

async function hasActiveStaffIdentity(
  employeeId
) {
  const empCode =
    cleanText(
      employeeId
    );

  if (!empCode) {
    return false;
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          id

        FROM staff

        WHERE
          TRIM(
            employee_id
          ) =
          :employeeId

          AND

          is_deleted =
          0

        LIMIT 1
      `,
      {
        employeeId:
          empCode,
      }
    );

  return (
    rows.length >
    0
  );
}

/*
|--------------------------------------------------------------------------
| SAVE COURSE -> ZK DEPARTMENT MAPPING
|--------------------------------------------------------------------------
*/

async function saveCourseZkMapping(
  courseId,
  department
) {
  if (
    !courseId ||
    !department?.id
  ) {
    return;
  }

  await pool.query(
    `
      UPDATE courses

      SET
        zkbiotime_department_id =
          :departmentId,

        zkbiotime_dept_code =
          :departmentCode

      WHERE
        id =
        :courseId
    `,
    {
      courseId:
        Number(
          courseId
        ),

      departmentId:
        Number(
          department.id
        ),

      departmentCode:
        cleanText(
          department.dept_code
        ),
    }
  );
}

/*
|--------------------------------------------------------------------------
| CLEAR ONE TRAINEE ZK MAPPING
|--------------------------------------------------------------------------
|
| Trainee itself is NOT deleted.
|--------------------------------------------------------------------------
*/

async function clearTraineeZkMapping(
  traineeId
) {
  if (!traineeId) {
    return;
  }

  await pool.query(
    `
      UPDATE trainees

      SET
        zkteco_emp_id =
          NULL,

        zkteco_emp_code =
          NULL,

        zkteco_synced =
          0,

        zkteco_last_sync =
          NOW()

      WHERE
        id =
        :traineeId
    `,
    {
      traineeId:
        Number(
          traineeId
        ),
    }
  );
}

/*
|--------------------------------------------------------------------------
| CLEAR ALL HISTORICAL TRAINEE ZK MAPPINGS
|--------------------------------------------------------------------------
|
| PTS rows remain.
|--------------------------------------------------------------------------
*/

async function clearAllTraineeMappings(
  employeeId
) {
  const empCode =
    cleanText(
      employeeId
    );

  if (!empCode) {
    return;
  }

  await pool.query(
    `
      UPDATE trainees

      SET
        zkteco_emp_id =
          NULL,

        zkteco_emp_code =
          NULL,

        zkteco_synced =
          0,

        zkteco_last_sync =
          NOW()

      WHERE
        TRIM(
          employee_id
        ) =
        :employeeId
    `,
    {
      employeeId:
        empCode,
    }
  );
}

/*
|--------------------------------------------------------------------------
| RELEASE OLD HISTORICAL COURSE MAPPINGS
|--------------------------------------------------------------------------
*/

async function releaseOtherTraineeMappings(
  employeeId,
  currentTraineeId
) {
  const empCode =
    cleanText(
      employeeId
    );

  if (!empCode) {
    return;
  }

  await pool.query(
    `
      UPDATE trainees

      SET
        zkteco_emp_id =
          NULL,

        zkteco_emp_code =
          NULL,

        zkteco_synced =
          0,

        zkteco_last_sync =
          NOW()

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
        empCode,

      currentTraineeId:
        Number(
          currentTraineeId
        ),
    }
  );
}

/*
|--------------------------------------------------------------------------
| SAVE CURRENT TRAINEE ZK MAPPING
|--------------------------------------------------------------------------
*/

async function saveTraineeZkMapping(
  traineeId,
  zkEmployeeId,
  employeeCode
) {
  await pool.query(
    `
      UPDATE trainees

      SET
        zkteco_emp_id =
          :zkEmployeeId,

        zkteco_emp_code =
          :employeeCode,

        zkteco_synced =
          1,

        zkteco_last_sync =
          NOW(),

        is_staff_exempt =
          0

      WHERE
        id =
        :traineeId
    `,
    {
      traineeId:
        Number(
          traineeId
        ),

      zkEmployeeId:
        Number(
          zkEmployeeId
        ),

      employeeCode:
        cleanText(
          employeeCode
        ),
    }
  );
}

/*
|--------------------------------------------------------------------------
| BUILD TRAINEE EMPLOYEE PAYLOAD
|--------------------------------------------------------------------------
*/

function buildEmployeePayload({
  trainee,
  departmentId,
  positionId,
  areaId,
}) {
  const employeeId =
    cleanText(
      trainee.employee_id
    );

  const payload = {
    emp_code:
      employeeId,

    department:
      Number(
        departmentId
      ),

    area: [
      Number(
        areaId
      ),
    ],
  };

  const firstName =
    cleanText(
      trainee.first_name
    );

  const lastName =
    cleanText(
      trainee.last_name
    );

  const mobile =
    cleanText(
      trainee.phone
    );

  const email =
    cleanText(
      trainee.email
    );

  const address =
    cleanText(
      trainee.address
    );

  const hireDate =
    dateOnly(
      trainee.joining_date
    );

  if (firstName) {
    payload.first_name =
      firstName;
  }

  if (lastName) {
    payload.last_name =
      lastName;
  }

  if (mobile) {
    payload.mobile =
      mobile;
  }

  if (email) {
    payload.email =
      email;
  }

  if (address) {
    payload.address =
      address;
  }

  if (hireDate) {
    payload.hire_date =
      hireDate;
  }

  if (positionId) {
    payload.position =
      Number(
        positionId
      );
  }

  return payload;
}

/*
|--------------------------------------------------------------------------
| ACTIVE COURSE MASTER SYNC
|--------------------------------------------------------------------------
|
| employeeWrite.service.js controls creation/update.
|
| No PTS-generated Department Code.
| No PTS-generated Position Code.
|--------------------------------------------------------------------------
*/

async function syncActiveCourseMasters(
  course,
  platoons
) {
  const department =
    await syncCourseToZk(
      course
    );

  if (
    !department?.id
  ) {
    throw new Error(
      `ZKBioTime Department could not be resolved for Course ${course.course_name}.`
    );
  }

  await saveCourseZkMapping(
    course.id,
    department
  );

  const connection =
    await pool.getConnection();

  try {
    const positionMap =
      new Map();

    for (
      const platoon
      of platoons
    ) {
      const position =
        await syncPlatoonToZk(
          platoon,
          connection
        );

      if (
        position?.id
      ) {
        positionMap.set(
          Number(
            platoon.id
          ),
          position
        );
      }
    }

    return {
      department,
      positionMap,
    };
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| TRAINEE ELIGIBILITY
|--------------------------------------------------------------------------
*/

function getTraineeIneligibleReason(
  trainee
) {
  if (
    Boolean(
      trainee.is_staff_exempt
    )
  ) {
    return (
      "Employee ID currently belongs to Staff."
    );
  }

  const status =
    String(
      trainee.status ||
      "ACTIVE"
    )
      .trim()
      .toUpperCase();

  if (
    [
      "TRAINING_DROP",
      "INACTIVE",
      "COMPLETED",
    ].includes(
      status
    )
  ) {
    return (
      `Trainee status is ${status}.`
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| SAFE REMOVE FROM ZKBIOTIME
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Deletes ONLY ZKBioTime Employee identity.
|
| NEVER deletes:
|
| courses
| platoons
| trainees
| attendance
| history
|
|--------------------------------------------------------------------------
*/

async function removeTraineeFromZkIfSafe({
  trainee,
  courseId,
  referenceDate,
  dryRun,
  reason,
}) {
  const employeeId =
    cleanText(
      trainee.employee_id
    );

  if (!employeeId) {
    return {
      employee_id:
        null,

      status:
        "SKIPPED",

      reason:
        "Employee ID missing.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF OWNS EMPLOYEE ID
  |--------------------------------------------------------------------------
  */

  const staffIdentity =
    await hasActiveStaffIdentity(
      employeeId
    );

  if (staffIdentity) {
    if (!dryRun) {
      await clearTraineeZkMapping(
        trainee.id
      );
    }

    return {
      employee_id:
        employeeId,

      status:
        "PRESERVED_STAFF",

      reason:
        "Active Staff identity owns this Employee ID.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | ANOTHER ACTIVE COURSE OWNS EMPLOYEE ID
  |--------------------------------------------------------------------------
  */

  const activeMatches =
    await getActiveCourseMatches(
      employeeId,
      referenceDate
    );

  const otherActive =
    activeMatches.filter(
      (item) =>
        Number(
          item.course_id
        ) !==
        Number(
          courseId
        )
    );

  if (
    otherActive.length >
    0
  ) {
    if (!dryRun) {
      await clearTraineeZkMapping(
        trainee.id
      );
    }

    return {
      employee_id:
        employeeId,

      status:
        "PRESERVED_OTHER_ACTIVE_COURSE",

      active_courses:
        otherActive.map(
          (item) => ({
            trainee_id:
              item.trainee_id,

            course_id:
              item.course_id,

            course_name:
              item.course_name,
          })
        ),

      reason:
        "Another active Course currently owns this Employee ID.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | NO STAFF / OTHER ACTIVE COURSE OWNER
  |--------------------------------------------------------------------------
  */

  const existing =
    await findZkEmployeeByCode(
      employeeId
    );

  if (dryRun) {
    return {
      employee_id:
        employeeId,

      status:
        existing
          ? "WOULD_DELETE"
          : "ALREADY_MISSING",

      zk_employee_id:
        existing?.id ||
        null,

      reason,
    };
  }

  if (
    existing?.id
  ) {
    await deleteEmployee(
      existing.id
    );
  }

  /*
   * PTS records are preserved.
   * Only their ZKBioTime mapping is cleared.
   */
  await clearAllTraineeMappings(
    employeeId
  );

  return {
    employee_id:
      employeeId,

    status:
      existing
        ? "DELETED"
        : "ALREADY_MISSING",

    zk_employee_id:
      existing?.id ||
      null,

    reason,
  };
}

/*
|--------------------------------------------------------------------------
| PROVISION ONE ACTIVE TRAINEE
|--------------------------------------------------------------------------
*/

async function provisionTrainee({
  trainee,
  course,
  department,
  position,
  referenceDate,
  areaId,
  dryRun,
}) {
  const employeeId =
    cleanText(
      trainee.employee_id
    );

  if (!employeeId) {
    return {
      employee_id:
        null,

      status:
        "SKIPPED",

      reason:
        "Employee ID missing.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | TRAINING DROP / INACTIVE / TRAINEE-COMPLETED
  |--------------------------------------------------------------------------
  */

  const ineligibleReason =
    getTraineeIneligibleReason(
      trainee
    );

  if (ineligibleReason) {
    return removeTraineeFromZkIfSafe({
      trainee,

      courseId:
        course.id,

      referenceDate,

      dryRun,

      reason:
        ineligibleReason,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF GUARD
  |--------------------------------------------------------------------------
  */

  const staffIdentity =
    await hasActiveStaffIdentity(
      employeeId
    );

  if (staffIdentity) {
    if (!dryRun) {
      await clearTraineeZkMapping(
        trainee.id
      );
    }

    return {
      employee_id:
        employeeId,

      status:
        "STAFF_CONFLICT",

      reason:
        "Employee ID currently belongs to an active Staff record.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | ACTIVE COURSE OWNERSHIP
  |--------------------------------------------------------------------------
  */

  const activeMatches =
    await getActiveCourseMatches(
      employeeId,
      referenceDate
    );

  if (
    activeMatches.length >
    1
  ) {
    /*
     * Do NOT delete anything here.
     * Ambiguous records must be resolved in PTS.
     */

    return {
      employee_id:
        employeeId,

      status:
        "AMBIGUOUS",

      matches:
        activeMatches.map(
          (item) => ({
            trainee_id:
              item.trainee_id,

            course_id:
              item.course_id,

            course_name:
              item.course_name,

            start_date:
              dateOnly(
                item.start_date
              ),

            end_date:
              dateOnly(
                item.end_date
              ),
          })
        ),

      reason:
        "Same Employee ID exists in more than one active Course. No ZKBioTime deletion or reassignment was performed.",
    };
  }

  if (
    activeMatches.length ===
      1 &&
    Number(
      activeMatches[0]
        .trainee_id
    ) !==
      Number(
        trainee.id
      )
  ) {
    if (!dryRun) {
      await clearTraineeZkMapping(
        trainee.id
      );
    }

    return {
      employee_id:
        employeeId,

      status:
        "HISTORICAL",

      active_trainee_id:
        activeMatches[0]
          .trainee_id,

      active_course_id:
        activeMatches[0]
          .course_id,

      reason:
        "Another historical/current PTS trainee row is the active Course owner.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | DEPARTMENT
  |--------------------------------------------------------------------------
  */

  const departmentId =
    Number(
      department?.id ||
      0
    );

  if (!departmentId) {
    throw new Error(
      `ZKBioTime Department missing for Course ${course.course_name}.`
    );
  }

  const positionId =
    Number(
      position?.id ||
      0
    ) ||
    null;

  const payload =
    buildEmployeePayload({
      trainee,

      departmentId,

      positionId,

      areaId,
    });

  const existing =
    await findZkEmployeeByCode(
      employeeId
    );

  /*
  |--------------------------------------------------------------------------
  | DOES EXISTING ZK EMPLOYEE BELONG TO CURRENT COURSE?
  |--------------------------------------------------------------------------
  */

  const existingDepartmentId =
    getEntityId(
      existing?.department
    );

  const localMappingMatches =
    Boolean(
      existing?.id
    ) &&
    Boolean(
      trainee.zkteco_synced
    ) &&
    Number(
      trainee.zkteco_emp_id
    ) ===
      Number(
        existing?.id
      );

  const departmentMatches =
    Boolean(
      existing?.id
    ) &&
    Number(
      existingDepartmentId
    ) ===
      Number(
        departmentId
      );

  const existingBelongsToCurrentCourse =
    Boolean(
      existing?.id
    ) &&
    (
      localMappingMatches ||
      departmentMatches
    );

  /*
  |--------------------------------------------------------------------------
  | SAME COURSE -> UPDATE
  |--------------------------------------------------------------------------
  |
  | Existing biometric enrollment stays intact.
  |--------------------------------------------------------------------------
  */

  if (
    existingBelongsToCurrentCourse
  ) {
    if (dryRun) {
      return {
        employee_id:
          employeeId,

        status:
          "WOULD_UPDATE",

        zk_employee_id:
          existing.id,

        course_id:
          course.id,
      };
    }

    const updated =
      await updateEmployee(
        existing.id,
        payload
      );

    await releaseOtherTraineeMappings(
      employeeId,
      trainee.id
    );

    await saveTraineeZkMapping(
      trainee.id,
      existing.id,
      employeeId
    );

    return {
      employee_id:
        employeeId,

      status:
        "UPDATED",

      course_id:
        course.id,

      trainee_id:
        trainee.id,

      zk_employee_id:
        existing.id,

      employee:
        updated,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | NEW ACTIVE COURSE
  |--------------------------------------------------------------------------
  |
  | ZKBioTime emp_code is unique.
  |
  | If stale ZK employee exists and no Staff / other active Course owns it:
  |
  | old ZK Employee -> delete
  | new Course       -> fresh create
  |
  | PTS historical records remain.
  |--------------------------------------------------------------------------
  */

  if (dryRun) {
    return {
      employee_id:
        employeeId,

      status:
        existing
          ? "WOULD_RECREATE_FRESH"
          : "WOULD_CREATE_FRESH",

      old_zk_employee_id:
        existing?.id ||
        null,

      course_id:
        course.id,

      trainee_id:
        trainee.id,
    };
  }

  if (
    existing?.id
  ) {
    await deleteEmployee(
      existing.id
    );
  }

  await clearAllTraineeMappings(
    employeeId
  );

  const created =
    await createEmployee(
      payload
    );

  if (
    !created?.id
  ) {
    throw new Error(
      `ZKBioTime employee ${employeeId} could not be created for Course ${course.course_name}.`
    );
  }

  await saveTraineeZkMapping(
    trainee.id,
    created.id,
    employeeId
  );

  return {
    employee_id:
      employeeId,

    status:
      existing
        ? "RECREATED_FRESH"
        : "CREATED_FRESH",

    course_id:
      course.id,

    trainee_id:
      trainee.id,

    zk_employee_id:
      created.id,

    fingerprint_status:
      "PENDING",

    employee:
      created,
  };
}

/*
|--------------------------------------------------------------------------
| PROVISION ONE ACTIVE TRAINEE BY PTS ID
|--------------------------------------------------------------------------
|
| Used by interactive Add/Edit. It reuses the exact same ownership guards,
| Department/Position rules and mapping helpers as the full Course lifecycle,
| but only touches the requested trainee.
|
| This removes the race where a trainee is created while a long STARTUP/
| SCHEDULED Course reconciliation is already running and the new row misses
| that run's earlier trainee snapshot.
|--------------------------------------------------------------------------
*/

async function provisionActiveTraineeById({
  traineeId,
  referenceDate =
    todayDate(),
  dryRun =
    false,
} = {}) {
  const trainee =
    await getTraineeForLifecycle(
      traineeId
    );

  if (!trainee) {
    return {
      trainee_id:
        Number(traineeId) ||
        null,

      status:
        "NOT_FOUND",

      reason:
        "Trainee is not available for ZKBioTime synchronization.",
    };
  }

  const courses =
    await getManagedCourses({
      courseId:
        trainee.course_id,
    });

  const course =
    courses[0] ||
    null;

  if (!course) {
    return {
      trainee_id:
        trainee.id,

      employee_id:
        trainee.employee_id,

      course_id:
        trainee.course_id,

      status:
        "COURSE_NOT_MANAGED",

      reason:
        "Trainee Course is not available for managed ZKBioTime lifecycle synchronization.",
    };
  }

  const courseStatus =
    getCourseStatus(
      course,
      referenceDate
    );

  if (
    courseStatus !==
    "ACTIVE"
  ) {
    return {
      trainee_id:
        trainee.id,

      employee_id:
        trainee.employee_id,

      course_id:
        course.id,

      course_status:
        courseStatus,

      status:
        "NO_ACTION",

      reason:
        `Course status is ${courseStatus}. Immediate employee provisioning is only for ACTIVE Course.`,
    };
  }

  const platoons =
    await getCoursePlatoons(
      course.id
    );

  let department =
    null;

  let positionMap =
    new Map();

  let areaId =
    null;

  if (!dryRun) {
    const masters =
      await syncActiveCourseMasters(
        course,
        platoons
      );

    department =
      masters.department;

    positionMap =
      masters.positionMap;

    areaId =
      await getDefaultAreaId();
  } else {
    department = {
      id:
        Number(
          course.zkbiotime_department_id ||
          -1
        ),

      dept_name:
        course.course_name,

      dept_code:
        course.zkbiotime_dept_code ||
        null,
    };

    for (
      const platoon
      of platoons
    ) {
      positionMap.set(
        Number(platoon.id),
        {
          id:
            Number(
              platoon.zkbiotime_position_id ||
              -Number(platoon.id)
            ),

          position_name:
            platoon.platoon_number,

          position_code:
            platoon.zkbiotime_position_code ||
            null,
        }
      );
    }

    areaId =
      -1;
  }

  const position =
    trainee.platoon_id
      ? (
          positionMap.get(
            Number(
              trainee.platoon_id
            )
          ) ||
          null
        )
      : null;

  const result =
    await provisionTrainee({
      trainee,
      course,
      department,
      position,
      referenceDate,
      areaId,
      dryRun,
    });

  return {
    ...result,

    trainee_id:
      result?.trainee_id ||
      trainee.id,

    employee_id:
      result?.employee_id ||
      trainee.employee_id,

    course_id:
      result?.course_id ||
      course.id,

    course_status:
      "ACTIVE",
  };
}

/*
|--------------------------------------------------------------------------
| PROVISION ACTIVE COURSE
|--------------------------------------------------------------------------
*/

async function provisionActiveCourse({
  course,
  referenceDate =
    todayDate(),
  dryRun = false,
}) {
  const status =
    getCourseStatus(
      course,
      referenceDate
    );

  /*
  |--------------------------------------------------------------------------
  | SAFETY GUARD
  |--------------------------------------------------------------------------
  */

  if (
    status !==
    "ACTIVE"
  ) {
    return {
      course_id:
        course.id,

      course_name:
        course.course_name,

      course_status:
        status,

      action:
        "NO_ACTION",

      employees:
        [],
    };
  }

  const platoons =
    await getCoursePlatoons(
      course.id
    );

  const trainees =
    await getCourseTrainees(
      course.id
    );

  let department =
    null;

  let positionMap =
    new Map();

  let areaId =
    null;

  /*
  |--------------------------------------------------------------------------
  | REAL MODE
  |--------------------------------------------------------------------------
  */

  if (!dryRun) {
    const masters =
      await syncActiveCourseMasters(
        course,
        platoons
      );

    department =
      masters.department;

    positionMap =
      masters.positionMap;

    areaId =
      await getDefaultAreaId();
  } else {
    /*
     * Dry-run MUST NOT create/update ZK master data.
     */

    department = {
      id:
        Number(
          course.zkbiotime_department_id ||
          -1
        ),

      dept_name:
        course.course_name,

      dept_code:
        course.zkbiotime_dept_code ||
        null,
    };

    for (
      const platoon
      of platoons
    ) {
      positionMap.set(
        Number(
          platoon.id
        ),
        {
          id:
            Number(
              platoon.zkbiotime_position_id ||
              -Number(
                platoon.id
              )
            ),

          position_name:
            platoon.platoon_number,

          position_code:
            platoon.zkbiotime_position_code ||
            null,
        }
      );
    }

    areaId =
      -1;
  }

  const employeeResults =
    [];

  for (
    const trainee
    of trainees
  ) {
    try {
      const position =
        trainee.platoon_id
          ? (
              positionMap.get(
                Number(
                  trainee.platoon_id
                )
              ) ||
              null
            )
          : null;

      const result =
        await provisionTrainee({
          trainee,

          course,

          department,

          position,

          referenceDate,

          areaId,

          dryRun,
        });

      employeeResults.push(
        result
      );
    } catch (error) {
      employeeResults.push({
        employee_id:
          trainee.employee_id,

        trainee_id:
          trainee.id,

        status:
          "FAILED",

        error:
          error.message,
      });
    }
  }

  return {
    course_id:
      course.id,

    course_name:
      course.course_name,

    course_status:
      "ACTIVE",

    action:
      dryRun
        ? "PREVIEW_PROVISION"
        : "PROVISIONED",

    department:
      department
        ? {
            id:
              department.id,

            dept_name:
              department.dept_name ||
              course.course_name,

            dept_code:
              department.dept_code ||
              null,
          }
        : null,

    platoons:
      platoons.length,

    trainees:
      trainees.length,

    employees:
      employeeResults,
  };
}

/*
|--------------------------------------------------------------------------
| COMPLETED COURSE DEPROVISION
|--------------------------------------------------------------------------
|
| CRITICAL SAFETY:
|
| This function performs destructive ZKBioTime employee removal ONLY when
| Course status is COMPLETED.
|
| DATE_NOT_SET / UPCOMING are rejected here with NO_ACTION.
|
| PTS Course is NEVER deleted.
| PTS Platoon is NEVER deleted.
| PTS Trainee is NEVER deleted.
| ZK Department is NEVER deleted.
| ZK Position is NEVER deleted.
|--------------------------------------------------------------------------
*/

async function deprovisionCourse({
  course,
  courseStatus,
  referenceDate =
    todayDate(),
  dryRun = false,
}) {
  /*
  |--------------------------------------------------------------------------
  | HARD SAFETY GUARD
  |--------------------------------------------------------------------------
  */

  if (
    courseStatus !==
    "COMPLETED"
  ) {
    return {
      course_id:
        course.id,

      course_name:
        course.course_name,

      course_status:
        courseStatus,

      action:
        "NO_ACTION",

      safety:
        "ZKBioTime employee deletion is allowed only for COMPLETED Course.",

      pts_history:
        "PRESERVED",

      employees:
        [],
    };
  }

  const trainees =
    await getCourseTrainees(
      course.id
    );

  const employeeResults =
    [];

  for (
    const trainee
    of trainees
  ) {
    try {
      const result =
        await removeTraineeFromZkIfSafe({
          trainee,

          courseId:
            course.id,

          referenceDate,

          dryRun,

          reason:
            "Course has completed.",
        });

      employeeResults.push(
        result
      );
    } catch (error) {
      employeeResults.push({
        employee_id:
          trainee.employee_id,

        trainee_id:
          trainee.id,

        status:
          "FAILED",

        error:
          error.message,
      });
    }
  }

  return {
    course_id:
      course.id,

    course_name:
      course.course_name,

    course_status:
      "COMPLETED",

    action:
      dryRun
        ? "PREVIEW_COMPLETED_DEPROVISION"
        : "COMPLETED_DEPROVISIONED",

    /*
     * Explicit proof in result:
     */
    pts_course:
      "PRESERVED",

    pts_platoons:
      "PRESERVED",

    pts_trainees:
      "PRESERVED",

    pts_history:
      "PRESERVED",

    zk_department:
      "PRESERVED",

    zk_positions:
      "PRESERVED",

    employees:
      employeeResults,
  };
}

/*
|--------------------------------------------------------------------------
| RECONCILE COURSE LIFECYCLE
|--------------------------------------------------------------------------
|
| SAFE FLOW:
|
| DATE_NOT_SET
|   -> NO ACTION
|
| UPCOMING
|   -> NO ACTION
|
| COMPLETED
|   -> process first
|   -> remove ZK trainee employee when safe
|
| ACTIVE
|   -> provision/update afterwards
|
| Processing COMPLETED first is important where same Employee ID later
| starts another Course.
|--------------------------------------------------------------------------
*/

async function reconcileCourseLifecycle({
  referenceDate =
    todayDate(),

  dryRun =
    true,

  courseId =
    null,
} = {}) {
  const courses =
    await getManagedCourses({
      courseId,
    });

  const completedCourses =
    [];

  const activeCourses =
    [];

  const untouchedCourses =
    [];

  for (
    const course
    of courses
  ) {
    const status =
      getCourseStatus(
        course,
        referenceDate
      );

    const item = {
      ...course,

      course_status:
        status,
    };

    if (
      status ===
      "COMPLETED"
    ) {
      completedCourses.push(
        item
      );

      continue;
    }

    if (
      status ===
      "ACTIVE"
    ) {
      activeCourses.push(
        item
      );

      continue;
    }

    /*
     * DATE_NOT_SET / UPCOMING
     */
    untouchedCourses.push(
      item
    );
  }

  /*
  |--------------------------------------------------------------------------
  | START WITH NO-ACTION RESULTS
  |--------------------------------------------------------------------------
  */

  const results =
    untouchedCourses.map(
      (course) => ({
        course_id:
          course.id,

        course_name:
          course.course_name,

        course_status:
          course.course_status,

        action:
          "NO_ACTION",

        reason:
          course.course_status ===
          "UPCOMING"
            ? "Course has not started yet."
            : "Course Start/End Date is not configured.",

        safety:
          "No PTS or ZKBioTime record was deleted.",
      })
    );

  /*
  |--------------------------------------------------------------------------
  | PHASE 1 — COMPLETED ONLY
  |--------------------------------------------------------------------------
  */

  for (
    const course
    of completedCourses
  ) {
    try {
      const result =
        await deprovisionCourse({
          course,

          courseStatus:
            "COMPLETED",

          referenceDate,

          dryRun,
        });

      results.push(
        result
      );
    } catch (error) {
      results.push({
        course_id:
          course.id,

        course_name:
          course.course_name,

        course_status:
          "COMPLETED",

        action:
          "FAILED",

        error:
          error.message,
      });
    }
  }

  /*
  |--------------------------------------------------------------------------
  | PHASE 2 — ACTIVE
  |--------------------------------------------------------------------------
  */

  for (
    const course
    of activeCourses
  ) {
    try {
      const result =
        await provisionActiveCourse({
          course,

          referenceDate,

          dryRun,
        });

      results.push(
        result
      );
    } catch (error) {
      results.push({
        course_id:
          course.id,

        course_name:
          course.course_name,

        course_status:
          "ACTIVE",

        action:
          "FAILED",

        error:
          error.message,
      });
    }
  }

  return {
    reference_date:
      referenceDate,

    dry_run:
      Boolean(
        dryRun
      ),

    total_courses:
      courses.length,

    active_courses:
      activeCourses.length,

    completed_courses:
      completedCourses.length,

    untouched_courses:
      untouchedCourses.length,

    date_not_set_courses:
      untouchedCourses.filter(
        (course) =>
          course.course_status ===
          "DATE_NOT_SET"
      ).length,

    upcoming_courses:
      untouchedCourses.filter(
        (course) =>
          course.course_status ===
          "UPCOMING"
      ).length,

    results,
  };
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  todayDate,

  getCourseStatus,

  findZkEmployeeByCode,

  getActiveCourseMatches,

  provisionActiveCourse,

  provisionActiveTraineeById,

  deprovisionCourse,

  reconcileCourseLifecycle,
};