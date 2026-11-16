const {
  pool,
} = require("../../config/db");

const {
  getEmployees,
  getEmployee,
  getDepartments,

  createEmployee,
  updateEmployee,
  deleteEmployee,

  createDepartment,
  updateDepartment,

  createPosition,
  updatePosition,
  getPositions,
} = require("./client");


/*
|--------------------------------------------------------------------------
| COMMON HELPERS
|--------------------------------------------------------------------------
*/

function isNotFoundError(
  error
) {
  const status =
    Number(
      error?.response?.status ||
      error?.status ||
      error?.statusCode ||
      0
    );

  const message =
    String(
      error?.message ||
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      ""
    ).toLowerCase();

  return (
    status === 404 ||
    message.includes(
      "http 404"
    ) ||
    message.includes(
      "not found"
    )
  );
}


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
    String(
      value
    ).trim();

  return text || null;
}


function normalizeApiRows(
  response
) {
  return (
    response?.data ||
    response?.results ||
    []
  );
}


function normalizeDate(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      value
    );

  if (
    !Number.isNaN(
      date.getTime()
    )
  ) {
    return date
      .toISOString()
      .slice(
        0,
        10
      );
  }

  return String(
    value
  ).slice(
    0,
    10
  );
}


/*
|--------------------------------------------------------------------------
| TECHNICAL ZK CODES
|--------------------------------------------------------------------------
|
| ZKBioTime create APIs require:
|
| Department → dept_code
| Position   → position_code
|
| User-facing name alag rahega.
|
| Existing ZK record update karte waqt existing ZK code preserve hoga.
|--------------------------------------------------------------------------
*/

function courseDepartmentCode(
  course
) {
  return `PTS-COURSE-${course.id}`;
}


function platoonPositionCode(
  platoon
) {
  if (
    platoon?.course_id
  ) {
    return (
      `PTS-COURSE-${platoon.course_id}` +
      `-PLATOON-${platoon.id}`
    );
  }

  return `PTS-PLATOON-${platoon.id}`;
}


function staffCategoryDepartmentCode(
  category
) {
  return `PTS-STAFF-${category.id}`;
}


function staffBranchPositionCode(
  branch
) {
  return `PTS-STAFF-BRANCH-${branch.id}`;
}


/*
|--------------------------------------------------------------------------
| EMPLOYEE LOOKUP
|--------------------------------------------------------------------------
*/

async function findZkEmployeeByCode(
  empCode
) {
  const code =
    cleanText(
      empCode
    );

  if (!code) {
    return null;
  }

  const findExact =
    (response) =>
      normalizeApiRows(
        response
      ).find(
        (item) =>
          cleanText(
            item?.emp_code
          ) === code
      ) ||
      null;

  /*
   * ZKBioTime normally supports exact emp_code filtering.
   * Some installations/builds have been observed to return incomplete
   * results for that filter, so use a contains fallback and still require
   * an exact Employee Code match before performing a destructive action.
   */
  const exactResponse =
    await getEmployees({
      emp_code:
        code,

      page:
        1,

      page_size:
        100,
    });

  const exact =
    findExact(
      exactResponse
    );

  if (exact) {
    return exact;
  }

  const fallbackResponse =
    await getEmployees({
      emp_code_icontains:
        code,

      page:
        1,

      page_size:
        100,
    });

  return findExact(
    fallbackResponse
  );
}


async function findZkEmployeeById(
  employeeId
) {
  const id =
    Number(
      employeeId
    );

  if (
    !Number.isInteger(
      id
    ) ||
    id < 1
  ) {
    return null;
  }

  try {
    return await getEmployee(
      id
    );
  } catch (error) {
    if (
      isNotFoundError(
        error
      )
    ) {
      return null;
    }

    throw error;
  }
}


/*
|--------------------------------------------------------------------------
| DEFAULT AREA
|--------------------------------------------------------------------------
*/

async function getDefaultAreaId() {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          setting_value

        FROM system_settings

        WHERE
          setting_key =
          'zkbiotime_default_area_id'

        LIMIT 1
      `
    );

  if (
    !rows.length ||
    !rows[0].setting_value
  ) {
    throw new Error(
      "ZKBioTime default Area is not configured."
    );
  }

  const areaId =
    Number(
      rows[0]
        .setting_value
    );

  if (
    !Number.isInteger(
      areaId
    ) ||
    areaId < 1
  ) {
    throw new Error(
      "Configured ZKBioTime Area ID is invalid."
    );
  }

  return areaId;
}


/*
|--------------------------------------------------------------------------
| ZK DEPARTMENT LOOKUP
|--------------------------------------------------------------------------
*/

async function findZkDepartmentById(
  departmentId
) {
  const id =
    Number(
      departmentId
    );

  if (!id) {
    return null;
  }

  const response =
    await getDepartments({
      page:
        1,

      page_size:
        1000,
    });

  return (
    normalizeApiRows(
      response
    ).find(
      (
        item
      ) =>
        Number(
          item?.id
        ) === id
    ) ||
    null
  );
}


async function findZkDepartmentByName(
  departmentName
) {
  const name =
    cleanText(
      departmentName
    );

  if (!name) {
    return null;
  }

  const response =
    await getDepartments({
      page:
        1,

      page_size:
        100,

      dept_name:
        name,
    });

  return (
    normalizeApiRows(
      response
    ).find(
      (
        item
      ) =>
        cleanText(
          item?.dept_name
        )?.toLowerCase() ===
        name.toLowerCase()
    ) ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| ZK POSITION LOOKUP
|--------------------------------------------------------------------------
*/

async function findZkPositionById(
  positionId
) {
  const id =
    Number(
      positionId
    );

  if (!id) {
    return null;
  }

  const response =
    await getPositions({
      page:
        1,

      page_size:
        1000,
    });

  return (
    normalizeApiRows(
      response
    ).find(
      (
        item
      ) =>
        Number(
          item?.id
        ) === id
    ) ||
    null
  );
}


async function findZkPositionByName(
  positionName
) {
  const name =
    cleanText(
      positionName
    );

  if (!name) {
    return null;
  }

  const response =
    await getPositions({
      page:
        1,

      page_size:
        100,

      position_name:
        name,
    });

  return (
    normalizeApiRows(
      response
    ).find(
      (
        item
      ) =>
        cleanText(
          item?.position_name
        )?.toLowerCase() ===
        name.toLowerCase()
    ) ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| UPDATE PAYLOADS
|--------------------------------------------------------------------------
|
| Existing ZKBioTime technical code ko kabhi replace nahi karna.
|--------------------------------------------------------------------------
*/

function departmentUpdatePayload({
  department,
  departmentName,
}) {
  const payload = {
    dept_name:
      departmentName,

    parent_dept:
      department
        ?.parent_dept
        ?.id ??
      department
        ?.parent_dept ??
      null,
  };

  const currentCode =
    cleanText(
      department
        ?.dept_code
    );

  if (currentCode) {
    payload.dept_code =
      currentCode;
  }

  return payload;
}


function positionUpdatePayload({
  position,
  positionName,
}) {
  const payload = {
    position_name:
      positionName,

    parent_position:
      position
        ?.parent_position
        ?.id ??
      position
        ?.parent_position ??
      null,
  };

  const currentCode =
    cleanText(
      position
        ?.position_code
    );

  if (currentCode) {
    payload.position_code =
      currentCode;
  }

  return payload;
}


/*
|--------------------------------------------------------------------------
| COURSE → ZK DEPARTMENT
|--------------------------------------------------------------------------
*/

async function syncCourseToZk(
  course
) {
  if (!course) {
    throw new Error(
      "Course is required for ZKBioTime synchronization."
    );
  }

  const departmentName =
    cleanText(
      course.course_name
    );

  if (!departmentName) {
    throw new Error(
      "Course Name is required for ZKBioTime synchronization."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | EXISTING MAPPED DEPARTMENT
  |--------------------------------------------------------------------------
  */

  if (
    course
      .zkbiotime_department_id
  ) {
    const current =
      await findZkDepartmentById(
        course
          .zkbiotime_department_id
      );

    if (current) {
      const payload =
        departmentUpdatePayload({
          department:
            current,

          departmentName,
        });

      const result =
        await updateDepartment(
          current.id,
          payload
        );

      return {
        ...current,
        ...(
          result ||
          {}
        ),

        id:
          current.id,

        dept_name:
          departmentName,

        dept_code:
          result
            ?.dept_code ||
          current
            .dept_code ||
          null,
      };
    }


    console.warn(
      `[ZKBioTime] Course Department mapping is stale. ` +
      `Course=${departmentName} | ` +
      `OldDepartmentID=${course.zkbiotime_department_id} | ` +
      `Recovering automatically.`
    );
  }


  /*
  |--------------------------------------------------------------------------
  | SAME NAME DEPARTMENT
  |--------------------------------------------------------------------------
  */

  const existing =
    await findZkDepartmentByName(
      departmentName
    );

  if (existing) {
    return existing;
  }


  /*
  |--------------------------------------------------------------------------
  | CREATE NEW DEPARTMENT
  |--------------------------------------------------------------------------
  */

  const created =
    await createDepartment({
      dept_code:
        courseDepartmentCode(
          course
        ),

      dept_name:
        departmentName,

      parent_dept:
        null,
    });

  if (
    !created?.id
  ) {
    throw new Error(
      `Could not create ZKBioTime Department for Course ${departmentName}.`
    );
  }

  return created;
}


/*
|--------------------------------------------------------------------------
| PLATOON → ZK POSITION
|--------------------------------------------------------------------------
*/

async function syncPlatoonToZk(
  platoon,
  connection
) {
  if (!platoon) {
    return null;
  }

  const positionName =
    cleanText(
      platoon.platoon_number
    );

  if (!positionName) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | EXISTING MAPPED POSITION
  |--------------------------------------------------------------------------
  */

  if (
    platoon.zkbiotime_position_id
  ) {
    try {
      const current =
        await findZkPositionById(
          platoon.zkbiotime_position_id
        );

      if (current) {
        /*
         * Existing Position usable hai.
         * Name update ki attempt karo.
         * Update fail ho tab bhi existing Position use kar sakte hain.
         */
        try {
          const payload =
            positionUpdatePayload({
              position:
                current,

              positionName,
            });

          const result =
            await updatePosition(
              current.id,
              payload
            );

          const resolved = {
            ...current,
            ...(result || {}),

            id:
              current.id,

            position_name:
              positionName,

            position_code:
              result?.position_code ||
              current.position_code ||
              null,
          };

          await connection.query(
            `
              UPDATE platoons

              SET
                zkbiotime_position_id =
                  :positionId,

                zkbiotime_position_code =
                  :positionCode

              WHERE id =
                :platoonId
            `,
            {
              platoonId:
                platoon.id,

              positionId:
                current.id,

              positionCode:
                resolved.position_code,
            }
          );

          return resolved;
        } catch (
          updateError
        ) {
          console.warn(
            `[ZKBioTime] Platoon Position update failed. ` +
            `Existing Position will still be used. ` +
            `Platoon=${positionName} | ` +
            `PositionID=${current.id} | ` +
            `Error=${updateError.message}`
          );

          return current;
        }
      }

      /*
       * Mapping stale hai.
       */
      console.warn(
        `[ZKBioTime] Platoon Position mapping is stale. ` +
        `Platoon=${positionName} | ` +
        `OldPositionID=${platoon.zkbiotime_position_id}`
      );

      await connection.query(
        `
          UPDATE platoons

          SET
            zkbiotime_position_id =
              NULL,

            zkbiotime_position_code =
              NULL

          WHERE id =
            :platoonId
        `,
        {
          platoonId:
            platoon.id,
        }
      );
    } catch (
      lookupError
    ) {
      console.warn(
        `[ZKBioTime] Platoon Position lookup failed. ` +
        `Employee sync will continue without Position. ` +
        `Platoon=${positionName} | ` +
        `Error=${lookupError.message}`
      );

      return null;
    }
  }


  /*
  |--------------------------------------------------------------------------
  | SAME NAME POSITION
  |--------------------------------------------------------------------------
  */

  try {
    const existingPosition =
      await findZkPositionByName(
        positionName
      );

    if (existingPosition) {
      await connection.query(
        `
          UPDATE platoons

          SET
            zkbiotime_position_id =
              :positionId,

            zkbiotime_position_code =
              :positionCode

          WHERE id =
            :platoonId
        `,
        {
          platoonId:
            platoon.id,

          positionId:
            existingPosition.id,

          positionCode:
            existingPosition.position_code ||
            null,
        }
      );

      return existingPosition;
    }
  } catch (
    lookupError
  ) {
    console.warn(
      `[ZKBioTime] Existing Platoon Position search failed. ` +
      `Employee sync will continue without Position. ` +
      `Platoon=${positionName} | ` +
      `Error=${lookupError.message}`
    );

    return null;
  }


  /*
  |--------------------------------------------------------------------------
  | CREATE NEW POSITION
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | Position creation is NON-BLOCKING.
  |--------------------------------------------------------------------------
  */

  try {
    const technicalCode =
      platoon.zkbiotime_position_code ||
      (
        platoon.course_id
          ? `PTS-COURSE-${platoon.course_id}-PLATOON-${platoon.id}`
          : `PTS-PLATOON-${platoon.id}`
      );

    const created =
      await createPosition({
        position_code:
          technicalCode,

        position_name:
          positionName,

        parent_position:
          null,
      });

    if (!created?.id) {
      throw new Error(
        "Position create returned no ID."
      );
    }

    await connection.query(
      `
        UPDATE platoons

        SET
          zkbiotime_position_id =
            :positionId,

          zkbiotime_position_code =
            :positionCode

        WHERE id =
          :platoonId
      `,
      {
        platoonId:
          platoon.id,

        positionId:
          created.id,

        positionCode:
          created.position_code ||
          technicalCode,
      }
    );

    return created;
  } catch (
    createError
  ) {
    console.warn(
      `[ZKBioTime] Platoon Position could not be created. ` +
      `Trainee synchronization will continue without Position. ` +
      `Platoon=${positionName} | ` +
      `Error=${createError.message}`
    );

    return null;
  }
}


/*
|--------------------------------------------------------------------------
| SAVE COURSE ZK MAPPING
|--------------------------------------------------------------------------
*/

async function saveCourseZkMapping(
  connection,
  courseId,
  department
) {
  if (
    !courseId ||
    !department?.id
  ) {
    return;
  }

  await connection.query(
    `
      UPDATE courses

      SET
        zkbiotime_department_id =
          :departmentId,

        zkbiotime_dept_code =
          :deptCode

      WHERE id =
        :courseId
    `,
    {
      courseId,

      departmentId:
        department.id,

      deptCode:
        department
          .dept_code ||
        null,
    }
  );
}


/*
|--------------------------------------------------------------------------
| TRAINEE ZK STATUS
|--------------------------------------------------------------------------
*/

async function updateTraineeZkSyncStatus(
  connection,
  traineeId,
  employeeId,
  empCode
) {
  await connection.query(
    `
      UPDATE trainees

      SET
        zkteco_emp_id =
          :employeeId,

        zkteco_emp_code =
          :empCode,

        zkteco_synced =
          TRUE,

        zkteco_last_sync =
          NOW()

      WHERE id =
        :traineeId
    `,
    {
      traineeId,
      employeeId,
      empCode,
    }
  );
}


/*
|--------------------------------------------------------------------------
| TRAINEE EMPLOYEE PAYLOAD
|--------------------------------------------------------------------------
*/

function buildTraineeEmployeePayload({
  trainee,
  zkDepartmentId,
  zkPositionId,
  areaIds,
}) {
  const payload = {
    emp_code:
      cleanText(
        trainee
          .employee_id
      ),

    department:
      zkDepartmentId,

    area:
      areaIds,
  };


  if (
    cleanText(
      trainee.first_name
    )
  ) {
    payload.first_name =
      cleanText(
        trainee.first_name
      );
  }


  if (
    cleanText(
      trainee.last_name
    )
  ) {
    payload.last_name =
      cleanText(
        trainee.last_name
      );
  }


  if (
    cleanText(
      trainee.phone
    )
  ) {
    payload.mobile =
      cleanText(
        trainee.phone
      );
  }


  if (
    cleanText(
      trainee.email
    )
  ) {
    payload.email =
      cleanText(
        trainee.email
      );
  }


  if (
    cleanText(
      trainee.address
    )
  ) {
    payload.address =
      cleanText(
        trainee.address
      );
  }


  const hireDate =
    normalizeDate(
      trainee
        .joining_date
    );

  if (hireDate) {
    payload.hire_date =
      hireDate;
  }


  if (zkPositionId) {
    payload.position =
      zkPositionId;
  }


  return payload;
}


/*
|--------------------------------------------------------------------------
| TRAINEE → ZKBIOTIME
|--------------------------------------------------------------------------
*/

async function createOrUpdateZkEmployee({
  trainee,
  course,
  platoon,
}) {
  const empCode =
    cleanText(
      trainee
        ?.employee_id
    );

  if (!empCode) {
    throw new Error(
      "Employee ID / Cap No. is required."
    );
  }


  if (!course) {
    throw new Error(
      "Course is required for ZKBioTime synchronization."
    );
  }


  const connection =
    await pool
      .getConnection();


  try {
    await connection
      .beginTransaction();


    /*
    |--------------------------------------------------------------------------
    | COURSE → DEPARTMENT
    |--------------------------------------------------------------------------
    */

    const department =
      await syncCourseToZk(
        course
      );

    if (
      !department?.id
    ) {
      throw new Error(
        "ZKBioTime Course Department could not be resolved."
      );
    }


    await saveCourseZkMapping(
      connection,
      course.id,
      department
    );


    /*
    |--------------------------------------------------------------------------
    | PLATOON → POSITION
    |--------------------------------------------------------------------------
    */

    const position =
      platoon
        ? await syncPlatoonToZk(
            platoon,
            connection
          )
        : null;


    /*
    |--------------------------------------------------------------------------
    | AREA
    |--------------------------------------------------------------------------
    */

    const areaId =
      await getDefaultAreaId();


    /*
    |--------------------------------------------------------------------------
    | EMPLOYEE PAYLOAD
    |--------------------------------------------------------------------------
    */

    const payload =
      buildTraineeEmployeePayload({
        trainee:
          {
            ...trainee,

            employee_id:
              empCode,
          },

        zkDepartmentId:
          department.id,

        zkPositionId:
          position?.id ||
          null,

        areaIds:
          [
            areaId,
          ],
      });


    /*
    |--------------------------------------------------------------------------
    | CREATE / UPDATE EMPLOYEE
    |--------------------------------------------------------------------------
    */

    const existing =
      await findZkEmployeeByCode(
        empCode
      );


    let employee =
      null;

    let action =
      null;

    let employeeId =
      null;


    if (existing) {
      employee =
        await updateEmployee(
          existing.id,
          payload
        );

      action =
        "UPDATED";

      employeeId =
        existing.id;
    } else {
      employee =
        await createEmployee(
          payload
        );

      action =
        "CREATED";

      employeeId =
        employee?.id ||
        null;
    }


    if (!employeeId) {
      throw new Error(
        "ZKBioTime Employee ID was not returned after synchronization."
      );
    }


    await updateTraineeZkSyncStatus(
      connection,
      trainee.id,
      employeeId,
      empCode
    );


    await connection
      .commit();


    return {
      action,
      employee,
      department,
      position,

      area_id:
        areaId,

      zkteco_employee_id:
        employeeId,
    };
  } catch (
    error
  ) {
    try {
      await connection
        .rollback();
    } catch (_) {
      // Ignore rollback error.
    }

    throw error;
  } finally {
    connection
      .release();
  }
}


/*
|--------------------------------------------------------------------------
| STAFF CATEGORY → ZK DEPARTMENT
|--------------------------------------------------------------------------
*/

async function syncStaffCategoryToZk(
  category,
  connection
) {
  if (!category) {
    throw new Error(
      "Staff Category is required."
    );
  }


  const departmentName =
    cleanText(
      category
        .category_name
    );


  if (!departmentName) {
    throw new Error(
      "Staff Category Name is required."
    );
  }


  let department =
    null;


  /*
  |--------------------------------------------------------------------------
  | EXISTING MAPPED DEPARTMENT
  |--------------------------------------------------------------------------
  */

  if (
    category
      .zkbiotime_department_id
  ) {
    const current =
      await findZkDepartmentById(
        category
          .zkbiotime_department_id
      );


    if (current) {
      const payload =
        departmentUpdatePayload({
          department:
            current,

          departmentName,
        });


      const result =
        await updateDepartment(
          current.id,
          payload
        );


      department = {
        ...current,
        ...(
          result ||
          {}
        ),

        id:
          current.id,

        dept_name:
          departmentName,

        dept_code:
          result
            ?.dept_code ||
          current
            .dept_code ||
          null,
      };
    } else {
      console.warn(
        `[ZKBioTime] Staff Category Department mapping is stale. ` +
        `Category=${departmentName} | ` +
        `OldDepartmentID=${category.zkbiotime_department_id} | ` +
        `Recovering automatically.`
      );


      await connection.query(
        `
          UPDATE staff_categories

          SET
            zkbiotime_department_id =
              NULL,

            zkbiotime_dept_code =
              NULL

          WHERE id =
            :categoryId
        `,
        {
          categoryId:
            category.id,
        }
      );
    }
  }


  /*
  |--------------------------------------------------------------------------
  | SAME NAME DEPARTMENT
  |--------------------------------------------------------------------------
  */

  if (!department) {
    department =
      await findZkDepartmentByName(
        departmentName
      );
  }


  /*
  |--------------------------------------------------------------------------
  | CREATE NEW DEPARTMENT
  |--------------------------------------------------------------------------
  */

  if (!department) {
    department =
      await createDepartment({
        dept_code:
          staffCategoryDepartmentCode(
            category
          ),

        dept_name:
          departmentName,

        parent_dept:
          null,
      });
  }


  if (
    !department?.id
  ) {
    throw new Error(
      `Could not resolve ZKBioTime Department for Staff Category ${departmentName}.`
    );
  }


  /*
  |--------------------------------------------------------------------------
  | SAVE PTS ↔ ZK MAPPING
  |--------------------------------------------------------------------------
  */

  await connection.query(
    `
      UPDATE staff_categories

      SET
        zkbiotime_department_id =
          :departmentId,

        zkbiotime_dept_code =
          :deptCode

      WHERE id =
        :categoryId
    `,
    {
      categoryId:
        category.id,

      departmentId:
        department.id,

      deptCode:
        department
          .dept_code ||
        null,
    }
  );


  return department;
}


/*
|--------------------------------------------------------------------------
| STAFF BRANCH → ZK POSITION
|--------------------------------------------------------------------------
|
| Staff Branch global hai.
|--------------------------------------------------------------------------
*/

async function syncStaffBranchToZk(
  branch,
  connection
) {
  if (!branch) {
    return null;
  }

  const branchName =
    cleanText(
      branch.branch_name
    );

  if (!branchName) {
    return null;
  }


  /*
  |--------------------------------------------------------------------------
  | EXISTING MAPPED POSITION
  |--------------------------------------------------------------------------
  */

  if (
    branch.zkbiotime_position_id
  ) {
    try {
      const current =
        await findZkPositionById(
          branch.zkbiotime_position_id
        );

      if (current) {
        /*
         * Existing Position ko update try karo.
         * Update fail ho to current Position phir bhi usable hai.
         */
        try {
          const payload =
            positionUpdatePayload({
              position:
                current,

              positionName:
                branchName,
            });

          const result =
            await updatePosition(
              current.id,
              payload
            );

          return {
            ...current,
            ...(result || {}),

            id:
              current.id,

            position_name:
              branchName,

            position_code:
              result?.position_code ||
              current.position_code ||
              null,
          };
        } catch (
          updateError
        ) {
          console.warn(
            `[ZKBioTime] Staff Branch Position update failed. ` +
            `Existing Position will still be used. ` +
            `Branch=${branchName} | ` +
            `PositionID=${current.id} | ` +
            `Error=${updateError.message}`
          );

          return current;
        }
      }


      /*
      |--------------------------------------------------------------------------
      | STALE LOCAL MAPPING
      |--------------------------------------------------------------------------
      */

      console.warn(
        `[ZKBioTime] Staff Branch Position mapping is stale. ` +
        `Branch=${branchName} | ` +
        `OldPositionID=${branch.zkbiotime_position_id}`
      );

      await connection.query(
        `
          UPDATE staff_branches

          SET
            zkbiotime_position_id =
              NULL

          WHERE id =
            :branchId
        `,
        {
          branchId:
            branch.id,
        }
      );
    } catch (
      lookupError
    ) {
      console.warn(
        `[ZKBioTime] Staff Branch Position lookup failed. ` +
        `Staff synchronization will continue without Position. ` +
        `Branch=${branchName} | ` +
        `Error=${lookupError.message}`
      );

      return null;
    }
  }


  /*
  |--------------------------------------------------------------------------
  | SAME NAME POSITION
  |--------------------------------------------------------------------------
  */

  try {
    const existingPosition =
      await findZkPositionByName(
        branchName
      );

    if (existingPosition) {
      await connection.query(
        `
          UPDATE staff_branches

          SET
            zkbiotime_position_id =
              :positionId

          WHERE id =
            :branchId
        `,
        {
          branchId:
            branch.id,

          positionId:
            existingPosition.id,
        }
      );

      return existingPosition;
    }
  } catch (
    lookupError
  ) {
    console.warn(
      `[ZKBioTime] Existing Staff Branch Position search failed. ` +
      `Staff synchronization will continue without Position. ` +
      `Branch=${branchName} | ` +
      `Error=${lookupError.message}`
    );

    return null;
  }


  /*
  |--------------------------------------------------------------------------
  | CREATE NEW POSITION
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | ZKBioTime Position POST issue Staff creation ko block nahi karega.
  |--------------------------------------------------------------------------
  */

  try {
    const technicalCode =
      `PTS-STAFF-BRANCH-${branch.id}`;

    const created =
      await createPosition({
        position_code:
          technicalCode,

        position_name:
          branchName,

        parent_position:
          null,
      });

    if (!created?.id) {
      throw new Error(
        "Position create returned no ID."
      );
    }


    await connection.query(
      `
        UPDATE staff_branches

        SET
          zkbiotime_position_id =
            :positionId

        WHERE id =
          :branchId
      `,
      {
        branchId:
          branch.id,

        positionId:
          created.id,
      }
    );


    return created;
  } catch (
    createError
  ) {
    console.warn(
      `[ZKBioTime] Staff Branch Position could not be created. ` +
      `Staff synchronization will continue without Position. ` +
      `Branch=${branchName} | ` +
      `Error=${createError.message}`
    );

    return null;
  }
}


/*
|--------------------------------------------------------------------------
| STAFF EMPLOYEE PAYLOAD
|--------------------------------------------------------------------------
*/

function buildStaffEmployeePayload({
  staff,
  zkDepartmentId,
  zkPositionId,
  areaIds,
}) {
  const payload = {
    emp_code:
      cleanText(
        staff.employee_id
      ),

    department:
      zkDepartmentId,

    area:
      areaIds,
  };


  if (
    cleanText(
      staff.first_name
    )
  ) {
    payload.first_name =
      cleanText(
        staff.first_name
      );
  }


  if (
    cleanText(
      staff.last_name
    )
  ) {
    payload.last_name =
      cleanText(
        staff.last_name
      );
  }


  if (
    cleanText(
      staff.phone
    )
  ) {
    payload.mobile =
      cleanText(
        staff.phone
      );
  }


  if (
    cleanText(
      staff.email
    )
  ) {
    payload.email =
      cleanText(
        staff.email
      );
  }


  if (
    cleanText(
      staff.address
    )
  ) {
    payload.address =
      cleanText(
        staff.address
      );
  }


  const hireDate =
    normalizeDate(
      staff
        .joining_date
    );


  if (hireDate) {
    payload.hire_date =
      hireDate;
  }


  if (zkPositionId) {
    payload.position =
      zkPositionId;
  }


  return payload;
}


/*
|--------------------------------------------------------------------------
| STAFF ZK STATUS
|--------------------------------------------------------------------------
*/

async function updateStaffZkSyncStatus(
  connection,
  staffId,
  employeeId,
  empCode
) {
  await connection.query(
    `
      UPDATE staff

      SET
        zkteco_emp_id =
          :employeeId,

        zkteco_emp_code =
          :empCode,

        zkteco_synced =
          TRUE,

        zkteco_last_sync =
          NOW()

      WHERE id =
        :staffId
    `,
    {
      staffId,
      employeeId,
      empCode,
    }
  );
}


/*
|--------------------------------------------------------------------------
| STAFF → ZKBIOTIME
|--------------------------------------------------------------------------
*/

async function createOrUpdateZkStaff({
  staff,
  category,
  branch,
}) {
  const empCode =
    cleanText(
      staff
        ?.employee_id
    );


  if (!empCode) {
    throw new Error(
      "Staff Employee ID is required."
    );
  }


  if (!category) {
    throw new Error(
      "Staff Category is required for ZKBioTime synchronization."
    );
  }


  const connection =
    await pool
      .getConnection();


  try {
    await connection
      .beginTransaction();


    /*
    |--------------------------------------------------------------------------
    | CATEGORY → DEPARTMENT
    |--------------------------------------------------------------------------
    */

    const department =
      await syncStaffCategoryToZk(
        category,
        connection
      );


    if (
      !department?.id
    ) {
      throw new Error(
        "ZKBioTime Staff Department could not be resolved."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | BRANCH → POSITION
    |--------------------------------------------------------------------------
    */

    const position =
      branch
        ? await syncStaffBranchToZk(
            branch,
            connection
          )
        : null;


    /*
    |--------------------------------------------------------------------------
    | AREA
    |--------------------------------------------------------------------------
    */

    const areaId =
      await getDefaultAreaId();


    /*
    |--------------------------------------------------------------------------
    | EMPLOYEE PAYLOAD
    |--------------------------------------------------------------------------
    */

    const payload =
      buildStaffEmployeePayload({
        staff:
          {
            ...staff,

            employee_id:
              empCode,
          },

        zkDepartmentId:
          department.id,

        zkPositionId:
          position?.id ||
          null,

        areaIds:
          [
            areaId,
          ],
      });


    /*
    |--------------------------------------------------------------------------
    | CREATE / UPDATE EMPLOYEE
    |--------------------------------------------------------------------------
    */

    const existing =
      await findZkEmployeeByCode(
        empCode
      );


    let employee =
      null;

    let action =
      null;

    let employeeId =
      null;


    if (existing) {
      employee =
        await updateEmployee(
          existing.id,
          payload
        );

      action =
        "UPDATED";

      employeeId =
        existing.id;
    } else {
      employee =
        await createEmployee(
          payload
        );

      action =
        "CREATED";

      employeeId =
        employee?.id ||
        null;
    }


    if (!employeeId) {
      throw new Error(
        "ZKBioTime Employee ID was not returned after Staff synchronization."
      );
    }


    await updateStaffZkSyncStatus(
      connection,
      staff.id,
      employeeId,
      empCode
    );


    await connection
      .commit();


    return {
      action,
      employee,
      department,
      position,

      area_id:
        areaId,

      zkteco_employee_id:
        employeeId,
    };
  } catch (
    error
  ) {
    try {
      await connection
        .rollback();
    } catch (_) {
      // Ignore rollback error.
    }

    throw error;
  } finally {
    connection
      .release();
  }
}


/*
|--------------------------------------------------------------------------
| DELETE FROM ZKBIOTIME
|--------------------------------------------------------------------------
*/

async function deleteZkEmployeeByCode(
  empCode,
  {
    zktecoEmpId = null,
  } = {}
) {
  const code =
    cleanText(
      empCode
    );

  const storedId =
    Number(
      zktecoEmpId
    );

  let employee =
    null;

  /*
   * Prefer the Portal's stored ZKBioTime numeric employee ID because the
   * DELETE endpoint requires that ID. Only accept it when the fetched ZK
   * record still belongs to the same Employee Code.
   */
  if (
    Number.isInteger(
      storedId
    ) &&
    storedId > 0
  ) {
    const byId =
      await findZkEmployeeById(
        storedId
      );

    if (
      byId &&
      (!code ||
        cleanText(
          byId?.emp_code
        ) === code)
    ) {
      employee =
        byId;
    }
  }

  if (
    !employee &&
    code
  ) {
    employee =
      await findZkEmployeeByCode(
        code
      );
  }

  if (!employee) {
    return {
      action:
        "ALREADY_MISSING",

      employee_id:
        null,
    };
  }

  const employeeId =
    Number(
      employee.id
    );

  if (
    !Number.isInteger(
      employeeId
    ) ||
    employeeId < 1
  ) {
    throw new Error(
      `ZKBioTime employee ${code || "-"} was found without a valid numeric ID.`
    );
  }

  try {
    await deleteEmployee(
      employeeId
    );
  } catch (error) {
    /*
     * Lookup and delete can race with another process. A genuine 404 means
     * the requested ZK employee is already absent and is safe to continue.
     */
    if (
      !isNotFoundError(
        error
      )
    ) {
      throw error;
    }
  }

  /*
   * Never report PTS deletion as successful merely because DELETE returned
   * without an exception. Verify that the ZK employee actually disappeared.
   */
  const remainingById =
    await findZkEmployeeById(
      employeeId
    );

  if (remainingById) {
    throw new Error(
      `ZKBioTime employee ${code || employeeId} still exists after DELETE.`
    );
  }

  if (code) {
    const remainingByCode =
      await findZkEmployeeByCode(
        code
      );

    if (remainingByCode) {
      throw new Error(
        `ZKBioTime Employee Code ${code} still exists after DELETE.`
      );
    }
  }

  return {
    action:
      "DELETED",

    employee_id:
      employeeId,
  };
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  findZkEmployeeByCode,
  findZkEmployeeById,
  getDefaultAreaId,

  /*
   * Trainee
   */
  syncCourseToZk,
  syncPlatoonToZk,
  createOrUpdateZkEmployee,

  /*
   * Staff
   */
  syncStaffCategoryToZk,
  syncStaffBranchToZk,
  createOrUpdateZkStaff,

  /*
   * Delete
   */
  deleteZkEmployeeByCode,
};