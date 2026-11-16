const {
  pool,
} = require(
  "../src/config/db"
);

/*
|--------------------------------------------------------------------------
| ONE-TIME LOCAL REPAIR
|--------------------------------------------------------------------------
|
| Purpose:
|   Legacy PTS data mein Admin / Dhobi Khana ko Course/Trainee side par
|   create kar diya gaya tha. Ye script un current records ko Staff side par
|   migrate karti hai WITHOUT contacting ZKBioTime.
|
| Safe / idempotent behavior:
|   - Existing active Staff row ko duplicate nahi karti.
|   - Existing Rank (staff.designation) overwrite nahi karti.
|   - Historical trainee row delete nahi karti; sirf is_staff_exempt = 1.
|   - Course row delete nahi karti.
|   - ZK Department mapping Course se Staff Category ko transfer karti hai.
|   - ZK Position mapping Platoon se matching Staff Branch ko reuse/create
|     kar sakti hai when the old position name looks like a real branch.
|
| Preview first:
|   node scripts/reclassify-legacy-staff.js --dry-run
|
| Apply:
|   node scripts/reclassify-legacy-staff.js
|--------------------------------------------------------------------------
*/

const LEGACY_STAFF_COURSES = [
  "Admin",
  "Dhobi Khana",
  "Class 4 Staff",
  "Line Staff",
  "Drill Instructors",
  "Law Instructor",
  "Menial Staff",
  "Ministerial Staff",
  "Security Staff",
  "Band Staff",
  "CL Staff",
  "Weapon Staff",
];

const DRY_RUN =
  process.argv.includes(
    "--dry-run"
  );

function cleanText(value) {
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

function normalizeKey(value) {
  const text =
    cleanText(value);

  if (!text) {
    return "";
  }

  return text
    .toLowerCase()
    .replace(/\bstaff\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLegacyStaffCourseName(
  value
) {
  const target =
    normalizeKey(
      value
    );

  if (!target) {
    return false;
  }

  return LEGACY_STAFF_COURSES
    .some(
      (name) => {
        const key =
          normalizeKey(
            name
          );

        return (
          target === key ||
          target.startsWith(
            `${key} `
          ) ||
          key.startsWith(
            `${target} `
          )
        );
      }
    );
}


function preferredCategoryName(
  courseName
) {
  const text =
    cleanText(courseName) ||
    "Staff";

  if (/\bstaff\b/i.test(text)) {
    return text;
  }

  return `${text} Staff`;
}

function meaningfulBranchName(
  value
) {
  const text =
    cleanText(value);

  if (!text) {
    return null;
  }

  /*
   * Numeric platoon labels such as 1 / 2 / 3 must never become Staff
   * Branches. Textual legacy ZK positions such as MESS / COBBLER BRANCH can.
   */
  if (/^\d+$/.test(text)) {
    return null;
  }

  return text;
}

async function getOrCreateCategory(
  connection,
  course
) {
  const zkDepartmentId =
    course.zkbiotime_department_id ||
    null;

  if (zkDepartmentId) {
    const [mapped] =
      await connection.query(
        `
          SELECT
            id,
            category_name

          FROM staff_categories

          WHERE
            zkbiotime_department_id = ?

          LIMIT 1
        `,
        [zkDepartmentId]
      );

    if (mapped.length) {
      return Number(
        mapped[0].id
      );
    }
  }

  const [categories] =
    await connection.query(
      `
        SELECT
          id,
          category_name

        FROM staff_categories

        WHERE
          is_active = 1

        ORDER BY id
      `
    );

  const targetKey =
    normalizeKey(
      course.course_name
    );

  const equivalent =
    categories.find(
      (row) =>
        normalizeKey(
          row.category_name
        ) === targetKey
    );

  if (equivalent) {
    await connection.query(
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
        course.zkbiotime_dept_code ||
          null,
        equivalent.id,
      ]
    );

    return Number(
      equivalent.id
    );
  }

  const [result] =
    await connection.query(
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
        preferredCategoryName(
          course.course_name
        ),
        zkDepartmentId,
        course.zkbiotime_dept_code ||
          null,
      ]
    );

  return Number(
    result.insertId
  );
}

async function getOrCreateBranch(
  connection,
  platoon
) {
  if (!platoon) {
    return null;
  }

  const branchName =
    meaningfulBranchName(
      platoon.platoon_name ||
      platoon.platoon_number
    );

  if (!branchName) {
    return null;
  }

  const zkPositionId =
    platoon.zkbiotime_position_id ||
    null;

  if (zkPositionId) {
    const [mapped] =
      await connection.query(
        `
          SELECT id
          FROM staff_branches
          WHERE zkbiotime_position_id = ?
          LIMIT 1
        `,
        [zkPositionId]
      );

    if (mapped.length) {
      return Number(
        mapped[0].id
      );
    }
  }

  const [named] =
    await connection.query(
      `
        SELECT id
        FROM staff_branches
        WHERE
          LOWER(TRIM(branch_name)) =
          LOWER(TRIM(?))
        LIMIT 1
      `,
      [branchName]
    );

  if (named.length) {
    const branchId =
      Number(
        named[0].id
      );

    if (zkPositionId) {
      await connection.query(
        `
          UPDATE staff_branches
          SET
            zkbiotime_position_id = ?,
            is_active = 1
          WHERE id = ?
        `,
        [
          zkPositionId,
          branchId,
        ]
      );
    }

    return branchId;
  }

  const [result] =
    await connection.query(
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
        branchName,
        zkPositionId,
      ]
    );

  return Number(
    result.insertId
  );
}

async function migrateTraineeToStaff({
  connection,
  trainee,
  categoryId,
  branchId,
  sourceDepartmentId,
}) {
  const employeeId =
    cleanText(
      trainee.employee_id
    );

  if (!employeeId) {
    return {
      migrated: false,
      reason:
        "EMPLOYEE_ID_MISSING",
    };
  }

  const [existingRows] =
    await connection.query(
      `
        SELECT
          id,
          designation,
          category_id,
          branch_id

        FROM staff

        WHERE
          TRIM(employee_id) = ?

        ORDER BY
          is_deleted ASC,
          id DESC

        LIMIT 1
      `,
      [employeeId]
    );

  let staffId;
  let action;

  if (existingRows.length) {
    staffId =
      Number(
        existingRows[0].id
      );

    await connection.query(
      `
        UPDATE staff

        SET
          belt_no = COALESCE(
            NULLIF(TRIM(belt_no), ''),
            ?
          ),

          first_name = COALESCE(
            NULLIF(TRIM(first_name), ''),
            ?
          ),

          last_name = COALESCE(
            NULLIF(TRIM(last_name), ''),
            ?
          ),

          father_name = COALESCE(
            NULLIF(TRIM(father_name), ''),
            ?
          ),

          cnic = COALESCE(
            NULLIF(TRIM(cnic), ''),
            ?
          ),

          phone = COALESCE(
            NULLIF(TRIM(phone), ''),
            ?
          ),

          email = COALESCE(
            NULLIF(TRIM(email), ''),
            ?
          ),

          address = COALESCE(
            NULLIF(TRIM(address), ''),
            ?
          ),

          category_id = ?,

          branch_id = COALESCE(
            ?,
            branch_id
          ),

          source_zk_department_id =
            COALESCE(
              ?,
              source_zk_department_id
            ),

          joining_date = COALESCE(
            joining_date,
            ?
          ),

          status = 'ACTIVE',

          zkteco_emp_id = COALESCE(
            ?,
            zkteco_emp_id
          ),

          zkteco_emp_code = COALESCE(
            ?,
            zkteco_emp_code
          ),

          zkteco_synced = CASE
            WHEN ? = 1 THEN 1
            ELSE zkteco_synced
          END,

          zkteco_last_sync = COALESCE(
            ?,
            zkteco_last_sync
          ),

          is_deleted = 0,
          deleted_at = NULL,
          deleted_by = NULL

        WHERE id = ?
      `,
      [
        trainee.belt_no || null,
        trainee.first_name || null,
        trainee.last_name || null,
        trainee.father_name || null,
        trainee.cnic || null,
        trainee.phone || null,
        trainee.email || null,
        trainee.address || null,
        categoryId,
        branchId,
        sourceDepartmentId,
        trainee.joining_date || null,
        trainee.zkteco_emp_id || null,
        trainee.zkteco_emp_code ||
          employeeId,
        Number(
          trainee.zkteco_synced ||
          0
        ) ? 1 : 0,
        trainee.zkteco_last_sync ||
          null,
        staffId,
      ]
    );

    action =
      "UPDATED_EXISTING_STAFF";
  } else {
    const [result] =
      await connection.query(
        `
          INSERT INTO staff
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

            category_id,
            branch_id,

            designation,
            joining_date,

            status,
            remarks,

            source_zk_department_id,

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
            ?,

            NULL,
            ?,

            'ACTIVE',
            ?,

            ?,

            ?,
            ?,
            ?,
            ?,

            0
          )
        `,
        [
          employeeId,
          trainee.belt_no || null,

          trainee.first_name || null,
          trainee.last_name || null,
          trainee.father_name || null,

          trainee.cnic || null,
          trainee.phone || null,
          trainee.email || null,
          trainee.address || null,

          categoryId,
          branchId,

          trainee.joining_date || null,

          cleanText(
            trainee.remarks
          ) ||
          "Migrated from legacy Staff pseudo-course.",

          sourceDepartmentId,

          trainee.zkteco_emp_id || null,
          trainee.zkteco_emp_code ||
            employeeId,
          Number(
            trainee.zkteco_synced ||
            0
          ) ? 1 : 0,
          trainee.zkteco_last_sync ||
            null,
        ]
      );

    staffId =
      Number(
        result.insertId
      );

    action =
      "CREATED_STAFF";
  }

  /*
   * Preserve the historical trainee row but remove it from every active
   * Trainee list/count and transfer current ZK identity ownership to Staff.
   */
  await connection.query(
    `
      UPDATE trainees

      SET
        is_staff_exempt = 1,

        zkteco_emp_id = NULL,
        zkteco_emp_code = NULL,
        zkteco_synced = 0,
        zkteco_last_sync = NULL

      WHERE id = ?
    `,
    [trainee.id]
  );

  return {
    migrated: true,
    action,
    staff_id:
      staffId,
  };
}

async function main() {
  const connection =
    await pool.getConnection();

  const summary = {
    courses_found: 0,
    trainees_found: 0,
    staff_created: 0,
    staff_updated: 0,
    trainee_rows_exempted: 0,
    skipped: 0,
    details: [],
  };

  try {
    await connection.beginTransaction();

    const [allCourses] =
      await connection.query(
        `
          SELECT
            id,
            course_name,
            zkbiotime_department_id,
            zkbiotime_dept_code

          FROM courses

          ORDER BY id
        `
      );

    const courses =
      allCourses.filter(
        (course) =>
          isLegacyStaffCourseName(
            course.course_name
          )
      );

    summary.courses_found =
      courses.length;

    for (const course of courses) {
      const categoryId =
        await getOrCreateCategory(
          connection,
          course
        );

      const [trainees] =
        await connection.query(
          `
            SELECT
              t.*,

              p.platoon_number,
              p.platoon_name,
              p.zkbiotime_position_id

            FROM trainees t

            LEFT JOIN platoons p
              ON p.id = t.platoon_id

            WHERE
              t.course_id = ?

              AND
              t.is_deleted = 0

            ORDER BY t.id
          `,
          [course.id]
        );

      summary.trainees_found +=
        trainees.length;

      for (const trainee of trainees) {
        const branchId =
          await getOrCreateBranch(
            connection,
            trainee
          );

        const result =
          await migrateTraineeToStaff({
            connection,
            trainee,
            categoryId,
            branchId,
            sourceDepartmentId:
              course.zkbiotime_department_id ||
              null,
          });

        if (!result.migrated) {
          summary.skipped += 1;
          summary.details.push({
            trainee_id:
              trainee.id,
            employee_id:
              trainee.employee_id,
            status:
              "SKIPPED",
            reason:
              result.reason,
          });
          continue;
        }

        if (
          result.action ===
          "CREATED_STAFF"
        ) {
          summary.staff_created += 1;
        } else {
          summary.staff_updated += 1;
        }

        summary.trainee_rows_exempted += 1;

        summary.details.push({
          trainee_id:
            trainee.id,
          employee_id:
            trainee.employee_id,
          staff_id:
            result.staff_id,
          course:
            course.course_name,
          category_id:
            categoryId,
          branch_id:
            branchId,
          status:
            result.action,
        });
      }

      /*
       * Staff Category now owns this ZKBioTime Department mapping.
       * The old Course remains only as historical local data.
       */
      await connection.query(
        `
          UPDATE courses

          SET
            zkbiotime_department_id = NULL,
            zkbiotime_dept_code = NULL

          WHERE id = ?
        `,
        [course.id]
      );
    }

    if (DRY_RUN) {
      await connection.rollback();
    } else {
      await connection.commit();
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          dry_run:
            DRY_RUN,
          ...summary,
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // ignore rollback failure
    }

    console.error(
      JSON.stringify(
        {
          success: false,
          error:
            error.message,
        },
        null,
        2
      )
    );

    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
