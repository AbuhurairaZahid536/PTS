const { pool } = require("../../config/db");
const {
  getEmployees,
  getDepartments,
  getPositions,
} = require("./client");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function hasStaffWord(value) {
  const text = cleanText(value);

  return Boolean(
    text &&
    /\bstaff\b/i.test(text)
  );
}

function normalizeApiRows(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.results)) {
    return response.results;
  }

  if (Array.isArray(response?.data?.data)) {
    return response.data.data;
  }

  if (Array.isArray(response?.data?.results)) {
    return response.data.results;
  }

  return [];
}


/*
|--------------------------------------------------------------------------
| EMPLOYEE SYNC SINGLE-RUN LOCK
|--------------------------------------------------------------------------
|
| MySQL named advisory lock:
| - shared across backend processes using the same MySQL server
| - does NOT lock attendance tables or biometric transaction processing
| - prevents Full Sync / Page Sync / Single Employee Sync from running together
|
| Timeout is 0 so a duplicate sync fails immediately instead of waiting while
| holding an HTTP request open.
|--------------------------------------------------------------------------
*/

const EMPLOYEE_SYNC_LOCK_NAME =
  "pts_employee_master_sync";

async function acquireEmployeeSyncLock() {
  const lockConnection =
    await pool.getConnection();

  try {
    const [rows] =
      await lockConnection.execute(
        "SELECT GET_LOCK(?, 0) AS acquired",
        [
          EMPLOYEE_SYNC_LOCK_NAME,
        ]
      );

    const acquired =
      Number(
        rows?.[0]?.acquired
      ) === 1;

    if (!acquired) {
      const error =
        new Error(
          "Another ZKBioTime employee sync is already running. Please wait for it to finish."
        );

      error.statusCode =
        409;

      error.code =
        "EMPLOYEE_SYNC_ALREADY_RUNNING";

      throw error;
    }

    return lockConnection;
  } catch (error) {
    lockConnection.release();
    throw error;
  }
}

async function releaseEmployeeSyncLock(
  lockConnection
) {
  if (!lockConnection) {
    return;
  }

  try {
    await lockConnection.execute(
      "SELECT RELEASE_LOCK(?) AS released",
      [
        EMPLOYEE_SYNC_LOCK_NAME,
      ]
    );
  } catch (error) {
    console.error(
      "[ZKBioTime] Employee sync lock release failed:",
      error.message || String(error)
    );
  } finally {
    lockConnection.release();
  }
}

async function runWithEmployeeSyncLock(
  task
) {
  const lockConnection =
    await acquireEmployeeSyncLock();

  try {
    return await task();
  } finally {
    await releaseEmployeeSyncLock(
      lockConnection
    );
  }
}

/*
|--------------------------------------------------------------------------
| ZK MASTER NAME RECONCILIATION
|--------------------------------------------------------------------------
|
| On full employee master sync, first read current ZKBioTime Department and
| Position masters and mirror RENAMES into already-mapped PTS master records.
| No new PTS masters are created here; creation/classification stays in the
| existing employee sync workflow.
|
|--------------------------------------------------------------------------
*/

async function fetchAllMasterRows(fetcher, pageSize = 100) {
  const { apiPages } = require("./pagination");
  const rows = [];
  for await (const page of apiPages(fetcher, {}, pageSize)) rows.push(...page.rows);
  return rows;
}

async function reconcileMappedDepartmentNames(connection, departments) {
  const summary = {
    departments_seen: 0,
    courses_renamed: 0,
    staff_categories_renamed: 0,
    conflicts: [],
  };

  for (const department of departments) {
    const zkDepartmentId = Number(department?.id || 0) || null;
    const departmentName = cleanText(department?.dept_name);
    const departmentCode = cleanText(department?.dept_code);
    if (!zkDepartmentId || !departmentName) continue;
    summary.departments_seen += 1;

    const [mappedCourses] = await connection.execute(
      `SELECT id, course_name FROM courses WHERE zkbiotime_department_id = ?`,
      [zkDepartmentId]
    );

    for (const course of mappedCourses) {
      if (hasStaffWord(departmentName)) {
        summary.conflicts.push({
          type: "COURSE_TO_STAFF_RENAME_BLOCKED",
          zk_department_id: zkDepartmentId,
          pts_course_id: Number(course.id),
          current_name: course.course_name,
          zk_name: departmentName,
        });
        continue;
      }

      const [dup] = await connection.execute(
        `SELECT id FROM courses
         WHERE LOWER(TRIM(course_name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
        [departmentName, course.id]
      );
      if (dup.length) {
        summary.conflicts.push({
          type: "COURSE_NAME_CONFLICT",
          zk_department_id: zkDepartmentId,
          pts_course_id: Number(course.id),
          conflicting_course_id: Number(dup[0].id),
          zk_name: departmentName,
        });
        continue;
      }

      const changed = cleanText(course.course_name) !== departmentName;
      await connection.execute(
        `UPDATE courses SET course_name = ?, zkbiotime_dept_code = ? WHERE id = ?`,
        [departmentName, departmentCode, course.id]
      );
      if (changed) summary.courses_renamed += 1;
    }

    const [mappedCategories] = await connection.execute(
      `SELECT id, category_name FROM staff_categories WHERE zkbiotime_department_id = ?`,
      [zkDepartmentId]
    );

    for (const category of mappedCategories) {
      const [dup] = await connection.execute(
        `SELECT id FROM staff_categories
         WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
        [departmentName, category.id]
      );
      if (dup.length) {
        summary.conflicts.push({
          type: "STAFF_CATEGORY_NAME_CONFLICT",
          zk_department_id: zkDepartmentId,
          pts_staff_category_id: Number(category.id),
          conflicting_staff_category_id: Number(dup[0].id),
          zk_name: departmentName,
        });
        continue;
      }

      const changed = cleanText(category.category_name) !== departmentName;
      await connection.execute(
        `UPDATE staff_categories SET category_name = ?, zkbiotime_dept_code = ? WHERE id = ?`,
        [departmentName, departmentCode, category.id]
      );
      if (changed) summary.staff_categories_renamed += 1;
    }
  }

  return summary;
}

async function reconcileMappedPositionNames(connection, positions) {
  const summary = {
    positions_seen: 0,
    platoons_renamed: 0,
    staff_branches_renamed: 0,
    conflicts: [],
  };

  for (const position of positions) {
    const zkPositionId = Number(position?.id || 0) || null;
    const positionName = cleanText(position?.position_name);
    const positionCode = cleanText(position?.position_code);
    if (!zkPositionId || !positionName) continue;
    summary.positions_seen += 1;

    const [mappedPlatoons] = await connection.execute(
      `SELECT id, course_id, platoon_number, platoon_name
       FROM platoons WHERE zkbiotime_position_id = ?`,
      [zkPositionId]
    );

    for (const platoon of mappedPlatoons) {
      const [dup] = await connection.execute(
        `SELECT id FROM platoons
         WHERE course_id = ? AND LOWER(TRIM(platoon_number)) = LOWER(TRIM(?))
           AND id <> ? LIMIT 1`,
        [platoon.course_id, positionName, platoon.id]
      );
      if (dup.length) {
        summary.conflicts.push({
          type: "PLATOON_NAME_CONFLICT",
          zk_position_id: zkPositionId,
          pts_platoon_id: Number(platoon.id),
          conflicting_platoon_id: Number(dup[0].id),
          zk_name: positionName,
        });
        continue;
      }

      const changed = cleanText(platoon.platoon_number) !== positionName ||
        cleanText(platoon.platoon_name) !== positionName;
      await connection.execute(
        `UPDATE platoons
         SET platoon_number = ?, platoon_name = ?, zkbiotime_position_code = ?
         WHERE id = ?`,
        [positionName, positionName, positionCode, platoon.id]
      );
      if (changed) summary.platoons_renamed += 1;
    }

    const [mappedBranches] = await connection.execute(
      `SELECT id, branch_name FROM staff_branches WHERE zkbiotime_position_id = ?`,
      [zkPositionId]
    );

    for (const branch of mappedBranches) {
      const [dup] = await connection.execute(
        `SELECT id FROM staff_branches
         WHERE LOWER(TRIM(branch_name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
        [positionName, branch.id]
      );
      if (dup.length) {
        summary.conflicts.push({
          type: "STAFF_BRANCH_NAME_CONFLICT",
          zk_position_id: zkPositionId,
          pts_staff_branch_id: Number(branch.id),
          conflicting_staff_branch_id: Number(dup[0].id),
          zk_name: positionName,
        });
        continue;
      }

      const changed = cleanText(branch.branch_name) !== positionName;
      await connection.execute(
        `UPDATE staff_branches SET branch_name = ? WHERE id = ?`,
        [positionName, branch.id]
      );
      if (changed) summary.staff_branches_renamed += 1;
    }
  }

  return summary;
}

async function syncZkMappedMasterNames() {
  const [departments, positions] = await Promise.all([
    fetchAllMasterRows(getDepartments, 100),
    fetchAllMasterRows(getPositions, 100),
  ]);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const departmentSummary = await reconcileMappedDepartmentNames(connection, departments);
    const positionSummary = await reconcileMappedPositionNames(connection, positions);
    await connection.commit();

    return {
      ...departmentSummary,
      ...positionSummary,
      conflicts: [
        ...(departmentSummary.conflicts || []),
        ...(positionSummary.conflicts || []),
      ],
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| DEPARTMENT CLASSIFICATION
|--------------------------------------------------------------------------
|
| No hard-coded Department IDs / Categories.
|
| Priority:
|
| 1. Existing Staff Category mapping by ZK Department ID
| 2. Existing Course mapping by ZK Department ID
| 3. Department Name contains whole word "Staff"
| 4. Existing Staff Category exact name
| 5. Existing Course exact name
| 6. New non-Staff Department -> Trainee Course
|
|--------------------------------------------------------------------------
*/

async function classifyDepartment(
  connection,
  department
) {
  if (!department) {
    return {
      type: "UNKNOWN",
      reason: "Department missing",
    };
  }

  const zkDepartmentId =
    Number(department.id || 0) ||
    null;

  const departmentName =
    cleanText(
      department.dept_name
    );

  if (!departmentName) {
    return {
      type: "UNKNOWN",
      reason: "Department Name missing",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF MAPPED BY ZK DEPARTMENT ID
  |--------------------------------------------------------------------------
  */

  if (zkDepartmentId) {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,
            category_name

          FROM staff_categories

          WHERE
            zkbiotime_department_id = ?

          LIMIT 1
        `,
        [
          zkDepartmentId,
        ]
      );

    if (rows.length > 0) {
      return {
        type: "STAFF",
        staff_category_id:
          rows[0].id,
      };
    }
  }

  /*
  |--------------------------------------------------------------------------
  | COURSE MAPPED BY ZK DEPARTMENT ID
  |--------------------------------------------------------------------------
  */

  if (zkDepartmentId) {
    const [rows] =
      await connection.execute(
        `
          SELECT
            id,
            course_name

          FROM courses

          WHERE
            zkbiotime_department_id = ?

          LIMIT 1
        `,
        [
          zkDepartmentId,
        ]
      );

    if (rows.length > 0) {
      /*
       * Existing mapped Course suddenly renamed to "* Staff".
       *
       * Do not silently convert historical Course into Staff Category.
       */
      if (
        hasStaffWord(
          departmentName
        )
      ) {
        return {
          type: "CONFLICT",

          reason:
            `ZKBioTime Department "${departmentName}" is already mapped ` +
            `to PTS Course ID ${rows[0].id}. ` +
            `Automatic Course-to-Staff conversion was blocked.`,
        };
      }

      return {
        type: "TRAINEE",
        course_id:
          rows[0].id,
      };
    }
  }

  /*
  |--------------------------------------------------------------------------
  | STAFF WORD
  |--------------------------------------------------------------------------
  */

  if (
    hasStaffWord(
      departmentName
    )
  ) {
    return {
      type: "STAFF",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | EXISTING STAFF CATEGORY NAME
  |--------------------------------------------------------------------------
  |
  | This dynamically handles existing categories such as:
  |
  | Admin
  | Drill Instructors
  | Law Instructor
  |
  | without defining them here.
  |--------------------------------------------------------------------------
  */

  const [staffByName] =
    await connection.execute(
      `
        SELECT
          id

        FROM staff_categories

        WHERE
          LOWER(TRIM(category_name))
          =
          LOWER(TRIM(?))

        LIMIT 1
      `,
      [
        departmentName,
      ]
    );

  if (
    staffByName.length > 0
  ) {
    return {
      type: "STAFF",
      staff_category_id:
        staffByName[0].id,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | EXISTING COURSE NAME
  |--------------------------------------------------------------------------
  */

  const [courseByName] =
    await connection.execute(
      `
        SELECT
          id

        FROM courses

        WHERE
          LOWER(TRIM(course_name))
          =
          LOWER(TRIM(?))

        LIMIT 1
      `,
      [
        departmentName,
      ]
    );

  if (
    courseByName.length > 0
  ) {
    return {
      type: "TRAINEE",
      course_id:
        courseByName[0].id,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | NEW NON-STAFF DEPARTMENT
  |--------------------------------------------------------------------------
  */

  return {
    type: "TRAINEE",
  };
}

/*
|--------------------------------------------------------------------------
| COURSE
|--------------------------------------------------------------------------
|
| ZKBioTime Department -> PTS Course
|
|--------------------------------------------------------------------------
*/

async function findOrCreateCourse(
  connection,
  department
) {
  if (!department) {
    return null;
  }

  const zkDepartmentId =
    department.id ??
    null;

  const departmentName =
    cleanText(
      department.dept_name
    );

  const departmentCode =
    cleanText(
      department.dept_code
    );

  if (!departmentName) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY ZK DEPARTMENT ID
  |--------------------------------------------------------------------------
  */

  if (zkDepartmentId) {
    const [mapped] =
      await connection.execute(
        `
          SELECT
            id

          FROM courses

          WHERE
            zkbiotime_department_id = ?

          LIMIT 1
        `,
        [
          zkDepartmentId,
        ]
      );

    if (mapped.length > 0) {
      const courseId =
        mapped[0].id;

      /*
       * ZK Department rename
       * -> PTS Course rename
       */
      await connection.execute(
        `
          UPDATE courses

          SET
            course_name = ?,
            zkbiotime_dept_code = ?,
            is_active = 1

          WHERE id = ?
        `,
        [
          departmentName,
          departmentCode,
          courseId,
        ]
      );

      return courseId;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY COURSE NAME
  |--------------------------------------------------------------------------
  */

  const [byName] =
    await connection.execute(
      `
        SELECT
          id

        FROM courses

        WHERE
          LOWER(TRIM(course_name))
          =
          LOWER(TRIM(?))

        LIMIT 1
      `,
      [
        departmentName,
      ]
    );

  if (byName.length > 0) {
    const courseId =
      byName[0].id;

    await connection.execute(
      `
        UPDATE courses

        SET
          zkbiotime_department_id = ?,
          zkbiotime_dept_code = ?,
          is_active = 1

        WHERE id = ?
      `,
      [
        zkDepartmentId,
        departmentCode,
        courseId,
      ]
    );

    return courseId;
  }

  /*
  |--------------------------------------------------------------------------
  | OLD COURSE CODE FALLBACK
  |--------------------------------------------------------------------------
  */

  if (departmentCode) {
    const [byCode] =
      await connection.execute(
        `
          SELECT
            id

          FROM courses

          WHERE
            course_code = ?

          LIMIT 1
        `,
        [
          departmentCode,
        ]
      );

    if (byCode.length > 0) {
      const courseId =
        byCode[0].id;

      await connection.execute(
        `
          UPDATE courses

          SET
            course_name = ?,
            zkbiotime_department_id = ?,
            zkbiotime_dept_code = ?,
            is_active = 1

          WHERE id = ?
        `,
        [
          departmentName,
          zkDepartmentId,
          departmentCode,
          courseId,
        ]
      );

      return courseId;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CREATE COURSE
  |--------------------------------------------------------------------------
  |
  | ZKBioTime has no Course Start/End Date.
  | They remain NULL until configured in PTS.
  |--------------------------------------------------------------------------
  */

  const [result] =
    await connection.execute(
      `
        INSERT INTO courses
        (
          course_name,
          course_code,

          start_date,
          end_date,

          is_active,

          zkbiotime_department_id,
          zkbiotime_dept_code
        )

        VALUES
        (
          ?,
          NULL,

          NULL,
          NULL,

          1,

          ?,
          ?
        )
      `,
      [
        departmentName,
        zkDepartmentId,
        departmentCode,
      ]
    );

  return result.insertId;
}

/*
|--------------------------------------------------------------------------
| PLATOON
|--------------------------------------------------------------------------
|
| ZKBioTime Position -> PTS Platoon
|
| Platoon is Course-specific.
|--------------------------------------------------------------------------
*/

async function findOrCreatePlatoon(
  connection,
  courseId,
  position
) {
  if (
    !courseId ||
    !position
  ) {
    return null;
  }

  const zkPositionId =
    position.id ??
    null;

  const positionName =
    cleanText(
      position.position_name
    );

  const positionCode =
    cleanText(
      position.position_code
    );

  if (!positionName) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY ZK POSITION ID + COURSE
  |--------------------------------------------------------------------------
  */

  if (zkPositionId) {
    const [mapped] =
      await connection.execute(
        `
          SELECT
            id

          FROM platoons

          WHERE
            course_id = ?

            AND

            zkbiotime_position_id = ?

          LIMIT 1
        `,
        [
          courseId,
          zkPositionId,
        ]
      );

    if (mapped.length > 0) {
      const platoonId =
        mapped[0].id;

      /*
       * ZK Position rename
       * -> PTS Platoon rename
       */
      await connection.execute(
        `
          UPDATE platoons

          SET
            platoon_number = ?,
            platoon_name = ?,

            zkbiotime_position_code = ?,

            is_active = 1

          WHERE id = ?
        `,
        [
          positionName,
          positionName,

          positionCode,

          platoonId,
        ]
      );

      return platoonId;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY NAME + COURSE
  |--------------------------------------------------------------------------
  */

  const [byName] =
    await connection.execute(
      `
        SELECT
          id

        FROM platoons

        WHERE
          course_id = ?

          AND

          LOWER(TRIM(platoon_number))
          =
          LOWER(TRIM(?))

        LIMIT 1
      `,
      [
        courseId,
        positionName,
      ]
    );

  if (byName.length > 0) {
    const platoonId =
      byName[0].id;

    await connection.execute(
      `
        UPDATE platoons

        SET
          platoon_number = ?,
          platoon_name = ?,

          zkbiotime_position_id = ?,
          zkbiotime_position_code = ?,

          is_active = 1

        WHERE id = ?
      `,
      [
        positionName,
        positionName,

        zkPositionId,
        positionCode,

        platoonId,
      ]
    );

    return platoonId;
  }

  /*
  |--------------------------------------------------------------------------
  | CREATE PLATOON
  |--------------------------------------------------------------------------
  */

  const [result] =
    await connection.execute(
      `
        INSERT INTO platoons
        (
          course_id,

          platoon_number,
          platoon_name,

          zkbiotime_position_id,
          zkbiotime_position_code,

          is_active
        )

        VALUES
        (
          ?,

          ?,
          ?,

          ?,
          ?,

          1
        )
      `,
      [
        courseId,

        positionName,
        positionName,

        zkPositionId,
        positionCode,
      ]
    );

  return result.insertId;
}

/*
|--------------------------------------------------------------------------
| STAFF CATEGORY
|--------------------------------------------------------------------------
|
| ZKBioTime Department -> PTS Staff Category
|
|--------------------------------------------------------------------------
*/

async function findOrCreateStaffCategory(
  connection,
  department
) {
  if (!department) {
    return null;
  }

  const zkDepartmentId =
    department.id ??
    null;

  const departmentName =
    cleanText(
      department.dept_name
    );

  const departmentCode =
    cleanText(
      department.dept_code
    );

  if (!departmentName) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY ZK DEPARTMENT ID
  |--------------------------------------------------------------------------
  */

  if (zkDepartmentId) {
    const [mapped] =
      await connection.execute(
        `
          SELECT
            id

          FROM staff_categories

          WHERE
            zkbiotime_department_id = ?

          LIMIT 1
        `,
        [
          zkDepartmentId,
        ]
      );

    if (mapped.length > 0) {
      const categoryId =
        mapped[0].id;

      /*
       * ZK Department rename
       * -> PTS Staff Category rename
       */
      await connection.execute(
        `
          UPDATE staff_categories

          SET
            category_name = ?,
            zkbiotime_dept_code = ?,
            is_active = 1

          WHERE id = ?
        `,
        [
          departmentName,
          departmentCode,
          categoryId,
        ]
      );

      return categoryId;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY CATEGORY NAME
  |--------------------------------------------------------------------------
  */

  const [byName] =
    await connection.execute(
      `
        SELECT
          id

        FROM staff_categories

        WHERE
          LOWER(TRIM(category_name))
          =
          LOWER(TRIM(?))

        LIMIT 1
      `,
      [
        departmentName,
      ]
    );

  if (byName.length > 0) {
    const categoryId =
      byName[0].id;

    await connection.execute(
      `
        UPDATE staff_categories

        SET
          zkbiotime_department_id = ?,
          zkbiotime_dept_code = ?,
          is_active = 1

        WHERE id = ?
      `,
      [
        zkDepartmentId,
        departmentCode,
        categoryId,
      ]
    );

    return categoryId;
  }

  /*
  |--------------------------------------------------------------------------
  | CREATE CATEGORY
  |--------------------------------------------------------------------------
  */

  const [result] =
    await connection.execute(
      `
        INSERT INTO staff_categories
        (
          category_name,
          zkbiotime_department_id,
          zkbiotime_dept_code,
          is_active
        )

        VALUES
        (
          ?,
          ?,
          ?,
          1
        )
      `,
      [
        departmentName,
        zkDepartmentId,
        departmentCode,
      ]
    );

  return result.insertId;
}

/*
|--------------------------------------------------------------------------
| STAFF BRANCH
|--------------------------------------------------------------------------
|
| ZKBioTime Position -> PTS Staff Branch / Posting Place
|
| Staff Branch is global.
|--------------------------------------------------------------------------
*/

async function findOrCreateStaffBranch(
  connection,
  position
) {
  if (!position) {
    return null;
  }

  const zkPositionId =
    position.id ??
    null;

  const positionName =
    cleanText(
      position.position_name
    );

  if (!positionName) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY ZK POSITION ID
  |--------------------------------------------------------------------------
  */

  if (zkPositionId) {
    const [mapped] =
      await connection.execute(
        `
          SELECT
            id

          FROM staff_branches

          WHERE
            zkbiotime_position_id = ?

          LIMIT 1
        `,
        [
          zkPositionId,
        ]
      );

    if (mapped.length > 0) {
      const branchId =
        mapped[0].id;

      /*
       * ZK Position rename
       * -> PTS Branch rename
       */
      await connection.execute(
        `
          UPDATE staff_branches

          SET
            branch_name = ?,
            is_active = 1

          WHERE id = ?
        `,
        [
          positionName,
          branchId,
        ]
      );

      return branchId;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | MATCH BY BRANCH NAME
  |--------------------------------------------------------------------------
  */

  const [byName] =
    await connection.execute(
      `
        SELECT
          id

        FROM staff_branches

        WHERE
          LOWER(TRIM(branch_name))
          =
          LOWER(TRIM(?))

        LIMIT 1
      `,
      [
        positionName,
      ]
    );

  if (byName.length > 0) {
    const branchId =
      byName[0].id;

    await connection.execute(
      `
        UPDATE staff_branches

        SET
          branch_name = ?,
          zkbiotime_position_id = ?,
          is_active = 1

        WHERE id = ?
      `,
      [
        positionName,
        zkPositionId,
        branchId,
      ]
    );

    return branchId;
  }

  /*
  |--------------------------------------------------------------------------
  | CREATE BRANCH
  |--------------------------------------------------------------------------
  */

  const [result] =
    await connection.execute(
      `
        INSERT INTO staff_branches
        (
          branch_name,
          zkbiotime_position_id,
          is_active
        )

        VALUES
        (
          ?,
          ?,
          1
        )
      `,
      [
        positionName,
        zkPositionId,
      ]
    );

  return result.insertId;
}

/*
|--------------------------------------------------------------------------
| ZK EMPLOYEE MIRROR
|--------------------------------------------------------------------------
*/

async function upsertZktecoEmployee(
  connection,
  employee
) {
  const data = {
    id:
      employee.id,

    emp_code:
      employee.emp_code ||
      null,

    first_name:
      employee.first_name ||
      null,

    last_name:
      employee.last_name ||
      null,

    nickname:
      employee.nickname ||
      null,

    format_name:
      employee.format_name ||
      null,

    photo:
      employee.photo ||
      null,

    full_name:
      employee.full_name ||
      null,

    device_password:
      employee.device_password ||
      null,

    card_no:
      employee.card_no ||
      null,

    department_id:
      employee.department?.id ??
      null,

    department_code:
      employee.department?.dept_code ||
      null,

    department_name:
      employee.department?.dept_name ||
      null,

    position:
      employee.position?.position_name ||
      null,

    hire_date:
      employee.hire_date ||
      null,

    gender:
      employee.gender ||
      null,

    birthday:
      employee.birthday ||
      null,

    verify_mode:
      employee.verify_mode ??
      null,

    emp_type:
      employee.emp_type ||
      null,

    contact_tel:
      employee.contact_tel ||
      null,

    office_tel:
      employee.office_tel ||
      null,

    mobile:
      employee.mobile ||
      null,

    national:
      employee.national ||
      null,

    city:
      employee.city ||
      null,

    address:
      employee.address ||
      null,

    postcode:
      employee.postcode ||
      null,

    email:
      employee.email ||
      null,

    enroll_sn:
      employee.enroll_sn ||
      null,

    ssn:
      employee.ssn ||
      null,

    religion:
      employee.religion ||
      null,

    enable_att:
      employee.attemployee
        ?.enable_attendance ??
      null,

    enable_overtime:
      employee.attemployee
        ?.enable_overtime ??
      null,

    enable_holiday:
      employee.attemployee
        ?.enable_holiday ??
      null,

    dev_privilege:
      employee.dev_privilege ??
      null,

    app_status:
      employee.app_status ??
      null,

    app_role:
      employee.app_role ??
      null,

    update_time:
      employee.update_time ||
      null,

    fingerprint:
      employee.fingerprint ||
      null,

    face:
      employee.face ||
      null,

    palm:
      employee.palm ||
      null,

    vl_face:
      employee.vl_face ||
      null,

    vl_palm:
      employee.vl_palm ||
      null,

    vl_face_photo:
      employee.vl_face_photo ||
      null,

    areas_json:
      JSON.stringify(
        employee.area ||
        []
      ),

    position_id:
      employee.position?.id ??
      null,

    position_code:
      employee.position
        ?.position_code ||
      null,

    position_name:
      employee.position
        ?.position_name ||
      null,

    attemployee_id:
      employee.attemployee?.id ??
      null,

    enable_schedule:
      employee.attemployee
        ?.enable_schedule ??
      null,

    raw_json:
      JSON.stringify(
        employee
      ),

    last_synced_at:
      new Date(),

    sync_status:
      "SUCCESS",

    sync_error:
      null,
  };

  const columns =
    Object.keys(data);

  const values =
    Object.values(data);

  const placeholders =
    columns
      .map(() => "?")
      .join(", ");

  const columnNames =
    columns
      .map(
        (column) =>
          `\`${column}\``
      )
      .join(", ");

  const updates =
    columns
      .filter(
        (column) =>
          column !== "id"
      )
      .map(
        (column) =>
          `\`${column}\` = VALUES(\`${column}\`)`
      )
      .join(", ");

  const sql = `
    INSERT INTO zkteco_employees
    (
      ${columnNames}
    )

    VALUES
    (
      ${placeholders}
    )

    ON DUPLICATE KEY UPDATE
      ${updates}
  `;

  await connection.execute(
    sql,
    values
  );
}

/*
|--------------------------------------------------------------------------
| STAFF EMPLOYEE SYNC
|--------------------------------------------------------------------------
|
| Historical key:
|
| Employee ID + Staff Category
|
| Same ID + Same Category -> UPDATE
| Same ID + New Category  -> CREATE historical row
|--------------------------------------------------------------------------
*/

async function syncStaffEmployee(
  employee,
  connection,
  empCode
) {
  const categoryId =
    await findOrCreateStaffCategory(
      connection,
      employee.department
    );

  if (!categoryId) {
    throw new Error(
      `Staff Category could not be resolved for Employee ${empCode}.`
    );
  }

  const branchId =
    await findOrCreateStaffBranch(
      connection,
      employee.position
    );

  const firstName =
    cleanText(
      employee.first_name
    );

  const lastName =
    cleanText(
      employee.last_name
    );

  const sourceDepartmentId =
    employee.department?.id ??
    null;

  /*
  |--------------------------------------------------------------------------
  | SAME EMPLOYEE + SAME CATEGORY
  |--------------------------------------------------------------------------
  */

  const [existingStaff] =
    await connection.execute(
      `
        SELECT
          id,
          category_id,
          branch_id,
          zkteco_emp_id

        FROM staff

        WHERE (zkteco_emp_id = ? OR employee_id = ?) AND category_id = ?
        ORDER BY (zkteco_emp_id = ?) DESC, id DESC

        LIMIT 1
      `,
      [
        employee.id ?? null,
        empCode,
        categoryId,
        employee.id ?? null,
      ]
    );

  let staffId;
  let action;

  if (
    existingStaff.length > 0
  ) {
    /*
    |--------------------------------------------------------------------------
    | UPDATE SAME EMPLOYEE + CATEGORY
    |--------------------------------------------------------------------------
    */

    staffId =
      existingStaff[0].id;

    await connection.execute(
      `
        UPDATE staff

        SET
          employee_id = ?,
          first_name = ?,
          last_name = ?,

          phone = ?,
          email = ?,
          address = ?,

          category_id = ?,
          branch_id = ?,

          source_zk_department_id = ?,

          joining_date = ?,

          status = 'ACTIVE',

          zkteco_emp_id = ?,
          zkteco_emp_code = ?,

          zkteco_synced = TRUE,
          zkteco_last_sync = NOW(),

          is_deleted = 0,
          deleted_at = NULL,
          deleted_by = NULL

        WHERE id = ?
      `,
      [
        empCode,
        firstName,
        lastName,

        employee.mobile ||
        null,

        employee.email ||
        null,

        employee.address ||
        null,

        categoryId,
        branchId,

        sourceDepartmentId,

        employee.hire_date ||
        null,

        employee.id ??
        null,

        empCode,

        staffId,
      ]
    );

    action =
      "STAFF_UPDATED";
  } else {
    /*
    |--------------------------------------------------------------------------
    | NEW EMPLOYEE + CATEGORY
    |--------------------------------------------------------------------------
    */

    const [result] =
      await connection.execute(
        `
          INSERT INTO staff
          (
            employee_id,

            first_name,
            last_name,

            phone,
            email,
            address,

            category_id,
            branch_id,

            source_zk_department_id,

            joining_date,

            status,

            zkteco_emp_id,
            zkteco_emp_code,

            zkteco_synced,
            zkteco_last_sync,

            is_deleted
          )

          VALUES
          (
            ?,

            ?,
            ?,

            ?,
            ?,
            ?,

            ?,
            ?,

            ?,

            ?,

            'ACTIVE',

            ?,
            ?,

            TRUE,
            NOW(),

            0
          )
        `,
        [
          empCode,

          firstName,
          lastName,

          employee.mobile ||
          null,

          employee.email ||
          null,

          employee.address ||
          null,

          categoryId,
          branchId,

          sourceDepartmentId,

          employee.hire_date ||
          null,

          employee.id ??
          null,

          empCode,
        ]
      );

    staffId =
      result.insertId;

    action =
      "STAFF_CREATED";
  }

  /*
  |--------------------------------------------------------------------------
  | ONLY CURRENT STAFF CATEGORY OWNS ZK IDENTITY
  |--------------------------------------------------------------------------
  |
  | Old Category records remain historical.
  |--------------------------------------------------------------------------
  */

  await connection.execute(
    `
      UPDATE staff

      SET
        is_deleted = 1,

        deleted_at =
          COALESCE(
            deleted_at,
            NOW()
          ),

        zkteco_emp_id = NULL,
        zkteco_emp_code = NULL,

        zkteco_synced = 0,
        zkteco_last_sync = NULL

      WHERE
        employee_id
        =
        ?

        AND

        id <> ?
    `,
    [
      empCode,
      staffId,
    ]
  );

  /*
  |--------------------------------------------------------------------------
  | STAFF CURRENTLY OWNS EMPLOYEE
  |--------------------------------------------------------------------------
  |
  | Trainee historical records remain saved.
  |--------------------------------------------------------------------------
  */

  await connection.execute(
    `
      UPDATE trainees

      SET
        is_staff_exempt = 1,

        zkteco_emp_id = NULL,
        zkteco_emp_code = NULL,

        zkteco_synced = 0,
        zkteco_last_sync = NULL

      WHERE
        employee_id
        =
        ?
    `,
    [
      empCode,
    ]
  );

  const [categoryRows] =
    await connection.execute(
      `
        SELECT
          category_name

        FROM staff_categories

        WHERE id = ?

        LIMIT 1
      `,
      [
        categoryId,
      ]
    );

  return {
    action,

    employee_type:
      "STAFF",

    staff_id:
      staffId,

    trainee_id:
      null,

    zkteco_employee_id:
      employee.id ??
      null,

    emp_code:
      empCode,

    staff_category_id:
      categoryId,

    staff_category:
      categoryRows[0]
        ?.category_name ||
      null,

    branch_id:
      branchId,

    source_zk_department_id:
      sourceDepartmentId,

    source_zk_department_name:
      employee.department
        ?.dept_name ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| TRAINEE EMPLOYEE SYNC
|--------------------------------------------------------------------------
|
| Historical key:
|
| Employee ID + Course
|
| Same ID + Same Course -> UPDATE
| Same ID + New Course  -> CREATE historical row
|--------------------------------------------------------------------------
*/

async function syncTraineeEmployee(
  employee,
  connection,
  empCode
) {
  const courseId =
    await findOrCreateCourse(
      connection,
      employee.department
    );

  if (!courseId) {
    return {
      action:
        "MIRRORED_ONLY",

      employee_type:
        "TRAINEE",

      zkteco_employee_id:
        employee.id ??
        null,

      emp_code:
        empCode,

      course_id:
        null,

      platoon_id:
        null,

      reason:
        "PTS Course could not be resolved.",
    };
  }

  const platoonId =
    await findOrCreatePlatoon(
      connection,
      courseId,
      employee.position
    );

  const firstName =
    cleanText(
      employee.first_name
    );

  const lastName =
    cleanText(
      employee.last_name
    );

  /*
  |--------------------------------------------------------------------------
  | SAME EMPLOYEE + SAME COURSE
  |--------------------------------------------------------------------------
  */

  const [existingTrainee] =
    await connection.execute(
      `
        SELECT
          id,
          course_id,
          platoon_id,
          zkteco_emp_id

        FROM trainees

        WHERE (zkteco_emp_id = ? OR employee_id = ?) AND course_id = ?
        ORDER BY (zkteco_emp_id = ?) DESC, id DESC

        LIMIT 1
      `,
      [
        employee.id ?? null,
        empCode,
        courseId,
        employee.id ?? null,
      ]
    );

  let traineeId;
  let action;

  if (
    existingTrainee.length > 0
  ) {
    /*
    |--------------------------------------------------------------------------
    | UPDATE SAME EMPLOYEE + COURSE
    |--------------------------------------------------------------------------
    */

    traineeId =
      existingTrainee[0].id;

    await connection.execute(
      `
        UPDATE trainees

        SET
          employee_id = ?,
          first_name = ?,
          last_name = ?,

          course_id = ?,
          platoon_id = ?,

          position = ?,
          joining_date = ?,

          zkteco_emp_id = ?,
          zkteco_emp_code = ?,

          zkteco_synced = TRUE,
          zkteco_last_sync = NOW(),

          is_staff_exempt = 0,

          is_deleted = 0,
          deleted_at = NULL,
          deleted_by = NULL

        WHERE id = ?
      `,
      [
        empCode,
        firstName,
        lastName,

        courseId,
        platoonId,

        employee.position
          ?.position_name ||
        null,

        employee.hire_date ||
        null,

        employee.id ??
        null,

        empCode,

        traineeId,
      ]
    );

    action =
      "UPDATED";
  } else {
    /*
    |--------------------------------------------------------------------------
    | NEW EMPLOYEE + COURSE
    |--------------------------------------------------------------------------
    */

    const [result] =
      await connection.execute(
        `
          INSERT INTO trainees
          (
            employee_id,

            first_name,
            last_name,

            course_id,
            platoon_id,

            position,
            joining_date,

            zkteco_emp_id,
            zkteco_emp_code,

            zkteco_synced,
            zkteco_last_sync,

            is_staff_exempt
          )

          VALUES
          (
            ?,

            ?,
            ?,

            ?,
            ?,

            ?,
            ?,

            ?,
            ?,

            TRUE,
            NOW(),

            0
          )
        `,
        [
          empCode,

          firstName,
          lastName,

          courseId,
          platoonId,

          employee.position
            ?.position_name ||
          null,

          employee.hire_date ||
          null,

          employee.id ??
          null,

          empCode,
        ]
      );

    traineeId =
      result.insertId;

    action =
      "CREATED";
  }

  /*
  |--------------------------------------------------------------------------
  | ONLY CURRENT COURSE OWNS ZK IDENTITY
  |--------------------------------------------------------------------------
  |
  | Previous Courses remain historically saved.
  |--------------------------------------------------------------------------
  */

  await connection.execute(
    `
      UPDATE trainees

      SET
        zkteco_emp_id = NULL,
        zkteco_emp_code = NULL,

        zkteco_synced = 0,
        zkteco_last_sync = NULL

      WHERE
        employee_id
        =
        ?

        AND

        id <> ?
    `,
    [
      empCode,
      traineeId,
    ]
  );

  /*
  |--------------------------------------------------------------------------
  | TRAINEE CURRENTLY OWNS EMPLOYEE
  |--------------------------------------------------------------------------
  |
  | Staff Category history remains saved.
  |--------------------------------------------------------------------------
  */

  await connection.execute(
    `
      UPDATE staff

      SET
        is_deleted = 1,

        deleted_at =
          COALESCE(
            deleted_at,
            NOW()
          ),

        zkteco_emp_id = NULL,
        zkteco_emp_code = NULL,

        zkteco_synced = 0,
        zkteco_last_sync = NULL

      WHERE
        employee_id
        =
        ?

        AND

        is_deleted = 0
    `,
    [
      empCode,
    ]
  );

  return {
    action,

    employee_type:
      "TRAINEE",

    trainee_id:
      traineeId,

    staff_id:
      null,

    zkteco_employee_id:
      employee.id ??
      null,

    emp_code:
      empCode,

    course_id:
      courseId,

    platoon_id:
      platoonId,

    course_mapping:
      "MATCHED",

    platoon_mapping:
      platoonId
        ? "MATCHED"
        : "NOT_MAPPED",
  };
}

/*
|--------------------------------------------------------------------------
| SYNC SINGLE EMPLOYEE OBJECT
|--------------------------------------------------------------------------
*/

async function syncEmployee(
  employee,
  connection
) {
  /*
  |--------------------------------------------------------------------------
  | ALWAYS MIRROR SOURCE RECORD
  |--------------------------------------------------------------------------
  */

  await upsertZktecoEmployee(
    connection,
    employee
  );

  const empCode =
    cleanText(
      employee.emp_code
    );

  /*
  |--------------------------------------------------------------------------
  | EMPLOYEE ID REQUIRED
  |--------------------------------------------------------------------------
  */

  if (!empCode) {
    return {
      action:
        "MIRRORED_ONLY",

      employee_type:
        "UNKNOWN",

      zkteco_employee_id:
        employee.id ??
        null,

      emp_code:
        null,

      reason:
        "Employee ID / Cap No. missing",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | DEPARTMENT REQUIRED
  |--------------------------------------------------------------------------
  */

  if (
    !employee.department ||
    !cleanText(
      employee.department
        ?.dept_name
    )
  ) {
    return {
      action:
        "MIRRORED_ONLY",

      employee_type:
        "UNKNOWN",

      zkteco_employee_id:
        employee.id ??
        null,

      emp_code:
        empCode,

      reason:
        "ZKBioTime Department missing",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | CLASSIFY
  |--------------------------------------------------------------------------
  */

  const classification =
    await classifyDepartment(
      connection,
      employee.department
    );

  if (
    classification.type ===
    "CONFLICT"
  ) {
    return {
      action:
        "MIRRORED_ONLY",

      employee_type:
        "CONFLICT",

      zkteco_employee_id:
        employee.id ??
        null,

      emp_code:
        empCode,

      reason:
        classification.reason,
    };
  }

  if (
    classification.type ===
    "STAFF"
  ) {
    return syncStaffEmployee(
      employee,
      connection,
      empCode
    );
  }

  if (
    classification.type ===
    "TRAINEE"
  ) {
    return syncTraineeEmployee(
      employee,
      connection,
      empCode
    );
  }

  return {
    action:
      "MIRRORED_ONLY",

    employee_type:
      "UNKNOWN",

    zkteco_employee_id:
      employee.id ??
      null,

    emp_code:
      empCode,

    reason:
      classification.reason ||
      "Could not classify ZKBioTime Department.",
  };
}

/*
|--------------------------------------------------------------------------
| SYNC SINGLE EMPLOYEE BY EMPLOYEE ID / CAP NO.
|--------------------------------------------------------------------------
|
| Controlled testing helper.
|
| Example:
|
| syncEmployeeByCode("0002")
|
|--------------------------------------------------------------------------
*/

async function syncEmployeeByCodeUnlocked(
  employeeCode
) {
  const empCode =
    cleanText(
      employeeCode
    );

  if (!empCode) {
    throw new Error(
      "Employee ID / Cap No. is required."
    );
  }

  const response =
    await getEmployees({
      emp_code:
        empCode,

      page:
        1,

      page_size:
        100,
    });

  const employees =
    normalizeApiRows(
      response
    );

  const employee =
    employees.find(
      (item) =>
        cleanText(
          item?.emp_code
        ) === empCode
    );

  if (!employee) {
    return {
      action:
        "NOT_FOUND",

      emp_code:
        empCode,

      message:
        `Employee ${empCode} was not found in ZKBioTime.`,
    };
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result =
      await syncEmployee(
        employee,
        connection
      );

    await connection.commit();

    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback error.
    }

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| SYNC ONE PAGE
|--------------------------------------------------------------------------
*/

async function syncEmployeesUnlocked(
  page = 1,
  pageSize = 100
) {
  const safePage =
    Math.max(
      Number(page) || 1,
      1
    );

  const safePageSize =
    Math.min(
      Math.max(
        Number(pageSize) ||
        100,
        1
      ),
      100
    );

  const connection =
    await pool.getConnection();

  try {
    const response =
      await getEmployees({
        page:
          safePage,

        page_size:
          safePageSize,
      });

    const employees =
      normalizeApiRows(
        response
      );

    const results =
      [];

    /*
    |--------------------------------------------------------------------------
    | ONE EMPLOYEE = ONE TRANSACTION
    |--------------------------------------------------------------------------
    |
    | Do not keep a whole ZKBioTime page inside one database transaction.
    | A page can contain up to 100 employees; keeping all of them open until
    | the page commit causes row locks from earlier employees to remain held
    | while later employees are processed, which can create cross-sync
    | deadlocks. Each employee now commits independently and releases locks
    | immediately.
    */

    for (
      const employee
      of employees
    ) {
      try {
        await connection.beginTransaction();

        const result =
          await syncEmployee(
            employee,
            connection
          );

        await connection.commit();

        results.push(
          result
        );
      } catch (employeeError) {
        try {
          await connection.rollback();
        } catch (_) {
          // Ignore rollback error.
        }

        results.push({
          action:
            "FAILED",

          employee_type:
            "UNKNOWN",

          zkteco_employee_id:
            employee?.id ??
            null,

          emp_code:
            cleanText(
              employee?.emp_code
            ),

          error:
            employeeError.message,
        });
      }
    }

    return {
      count:
        Number(
          response?.count
        ) ||
        Number(
          response?.data?.count
        ) ||
        0,

      page:
        safePage,

      page_size:
        safePageSize,

      processed:
        employees.length,

      results,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Ignore rollback error.
    }

    throw error;
  } finally {
    connection.release();
  }
}

/*
|--------------------------------------------------------------------------
| SYNC ALL EMPLOYEES
|--------------------------------------------------------------------------
*/

async function syncAllEmployeesUnlocked(
  pageSize = 100
) {
  const safePageSize =
    Math.min(
      Math.max(
        Number(pageSize) ||
        100,
        1
      ),
      100
    );

  let masterDataSync = {
    departments_seen: 0,
    positions_seen: 0,
    courses_renamed: 0,
    staff_categories_renamed: 0,
    platoons_renamed: 0,
    staff_branches_renamed: 0,
    conflicts: [],
  };

  try {
    masterDataSync = await syncZkMappedMasterNames();
  } catch (masterError) {
    masterDataSync = {
      ...masterDataSync,
      error: masterError.message || String(masterError),
    };

    console.error(
      "[ZKBioTime] Master Department/Position name reconciliation failed:",
      masterDataSync.error
    );
  }

  let page =
    1;

  let totalEmployees =
    0;

  let totalPages =
    1;

  let processed =
    0;

  let traineeCreated =
    0;

  let traineeUpdated =
    0;

  let staffCreated =
    0;

  let staffUpdated =
    0;

  let mirroredOnly =
    0;

  let conflicts =
    0;

  let failed =
    0;

  let withoutCourse =
    0;

  let withoutPlatoon =
    0;

  const pages =
    [];

  const seenEmployeePages = new Set();
  do {
    const connection =
      await pool.getConnection();

    try {
      const response =
        await getEmployees({
          page,

          page_size:
            safePageSize,
        });

      const employees =
        normalizeApiRows(
          response
        );

      const signature = JSON.stringify(employees.map(item => item.id));
      if (employees.length && seenEmployeePages.has(signature)) throw new Error("BioTime repeated an employee page.");
      seenEmployeePages.add(signature);
      totalEmployees =
        Number(
          response?.count
        ) ||
        Number(
          response?.data?.count
        ) ||
        0;

      totalPages =
        Math.max(
          1,

          Math.ceil(
            totalEmployees /
            safePageSize
          )
        );

      const pageSummary = {
        page,

        fetched:
          employees.length,

        trainee_created:
          0,

        trainee_updated:
          0,

        staff_created:
          0,

        staff_updated:
          0,

        mirrored_only:
          0,

        conflicts:
          0,

        without_course:
          0,

        without_platoon:
          0,

        failed:
          0,
      };

      /*
      |--------------------------------------------------------------------------
      | ONE EMPLOYEE = ONE TRANSACTION
      |--------------------------------------------------------------------------
      |
      | Release trainee/staff row locks after every employee instead of holding
      | them for the complete page. This keeps full sync safe when another sync
      | request is running at the same time.
      */

      for (
        const employee
        of employees
      ) {
        try {
          await connection.beginTransaction();

          const result =
            await syncEmployee(
              employee,
              connection
            );

          processed +=
            1;

          if (
            result.action ===
            "CREATED"
          ) {
            traineeCreated +=
              1;

            pageSummary
              .trainee_created +=
              1;
          }

          if (
            result.action ===
            "UPDATED"
          ) {
            traineeUpdated +=
              1;

            pageSummary
              .trainee_updated +=
              1;
          }

          if (
            result.action ===
            "STAFF_CREATED"
          ) {
            staffCreated +=
              1;

            pageSummary
              .staff_created +=
              1;
          }

          if (
            result.action ===
            "STAFF_UPDATED"
          ) {
            staffUpdated +=
              1;

            pageSummary
              .staff_updated +=
              1;
          }

          if (
            result.action ===
            "MIRRORED_ONLY"
          ) {
            mirroredOnly +=
              1;

            pageSummary
              .mirrored_only +=
              1;
          }

          if (
            result.employee_type ===
            "CONFLICT"
          ) {
            conflicts +=
              1;

            pageSummary
              .conflicts +=
              1;
          }

          if (
            result.employee_type ===
              "TRAINEE" &&
            result.emp_code &&
            !result.course_id
          ) {
            withoutCourse +=
              1;

            pageSummary
              .without_course +=
              1;
          }

          if (
            result.employee_type ===
              "TRAINEE" &&
            result.emp_code &&
            !result.platoon_id
          ) {
            withoutPlatoon +=
              1;

            pageSummary
              .without_platoon +=
              1;
          }

          await connection.commit();
        } catch (employeeError) {
          failed +=
            1;

          pageSummary.failed +=
            1;

          try {
            await connection.rollback();
          } catch (_) {
            // Ignore rollback error.
          }

          console.error(
            `[ZKBioTime] Employee failed | ` +
              `ZK ID=${employee?.id} | ` +
              `Employee=${employee?.emp_code} | ` +
              `Error=${employeeError.message}`
          );
        }
      }

      pages.push(
        pageSummary
      );

      console.log(
        `[ZKBioTime] Page ${page}/${totalPages} | ` +
          `Fetched=${pageSummary.fetched} | ` +
          `TraineeCreated=${pageSummary.trainee_created} | ` +
          `TraineeUpdated=${pageSummary.trainee_updated} | ` +
          `StaffCreated=${pageSummary.staff_created} | ` +
          `StaffUpdated=${pageSummary.staff_updated} | ` +
          `Conflicts=${pageSummary.conflicts} | ` +
          `NoCourse=${pageSummary.without_course} | ` +
          `NoPlatoon=${pageSummary.without_platoon} | ` +
          `Failed=${pageSummary.failed}`
      );

      if (
        employees.length ===
        0
      ) {
        break;
      }

      const seen = pages.reduce((sum, entry) => sum + entry.fetched, 0);
      if (totalEmployees > 0 && seen < totalEmployees) totalPages = Math.max(totalPages, page + 1);
      else if (!totalEmployees && employees.length && response?.next !== null) totalPages = page + 1;
      page +=
        1;
    } catch (error) {
      try {
        await connection.rollback();
      } catch (_) {
        // Ignore rollback error.
      }

      throw error;
    } finally {
      connection.release();
    }
  } while (
    page <=
    totalPages
  );

  const received = pages.reduce((sum, entry) => sum + entry.fetched, 0);
  if (totalEmployees > 0 && received < totalEmployees) throw new Error(`BioTime employee sync incomplete: ${received}/${totalEmployees}.`);
  return {
    total_zkbiotime_employees:
      totalEmployees,

    page_size:
      safePageSize,

    pages_processed:
      pages.length,

    processed,

    trainee_created:
      traineeCreated,

    trainee_updated:
      traineeUpdated,

    staff_created:
      staffCreated,

    staff_updated:
      staffUpdated,

    mirrored_only:
      mirroredOnly,

    conflicts,

    without_course:
      withoutCourse,

    without_platoon:
      withoutPlatoon,

    failed,

    complete: failed === 0 && conflicts === 0 && !masterDataSync.error && !(masterDataSync.conflicts || []).length,
    master_data_sync:
      masterDataSync,

    pages,
  };
}

/*
|--------------------------------------------------------------------------
| LOCKED PUBLIC SYNC ENTRY POINTS
|--------------------------------------------------------------------------
|
| Attendance processing is not part of this lock. Only employee master sync
| entry points use it, so attendance can keep reading biometric transactions
| and calculating reports normally.
|--------------------------------------------------------------------------
*/

async function syncEmployeeByCode(
  employeeCode
) {
  return runWithEmployeeSyncLock(
    () =>
      syncEmployeeByCodeUnlocked(
        employeeCode
      )
  );
}

async function syncEmployees(
  page = 1,
  pageSize = 100
) {
  return runWithEmployeeSyncLock(
    () =>
      syncEmployeesUnlocked(
        page,
        pageSize
      )
  );
}

async function syncAllEmployees(
  pageSize = 100
) {
  return runWithEmployeeSyncLock(
    () =>
      syncAllEmployeesUnlocked(
        pageSize
      )
  );
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  syncEmployeeByCode,
  syncEmployees,
  syncAllEmployees,
};