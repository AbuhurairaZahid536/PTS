const {
  pool,
} = require("../config/db");

/*
|--------------------------------------------------------------------------
| STAFF LIST
|--------------------------------------------------------------------------
*/

async function getStaffList({
  search = "",
  categoryId = null,
  branchId = null,
  status = null,
  page = 1,
  pageSize = 25,
}) {
  const offset =
    (page - 1) * pageSize;

  const conditions = [
    "s.is_deleted = 0",
  ];

  const params = {};

  if (search) {
    conditions.push(`
      (
        s.employee_id LIKE :search
        OR s.belt_no LIKE :search
        OR s.first_name LIKE :search
        OR s.last_name LIKE :search
        OR s.father_name LIKE :search
        OR s.designation LIKE :search
      )
    `);

    params.search =
      `%${search}%`;
  }

  if (categoryId) {
    conditions.push(
      "s.category_id = :categoryId"
    );

    params.categoryId =
      categoryId;
  }

  if (branchId) {
    conditions.push(
      "s.branch_id = :branchId"
    );

    params.branchId =
      branchId;
  }

  if (status) {
    conditions.push(
      "s.status = :status"
    );

    params.status =
      status;
  }

  const whereClause = `
    WHERE ${conditions.join(
      " AND "
    )}
  `;

  const [countRows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM staff s

        ${whereClause}
      `,
      params
    );

  const total =
    Number(
      countRows[0]?.total || 0
    );

  const [rows] =
    await pool.query(
      `
        SELECT
          s.id,
          s.employee_id,
          s.belt_no,

          s.first_name,
          s.last_name,
          s.father_name,

          s.cnic,
          s.phone,
          s.email,
          s.address,

          s.category_id,
          sc.category_name,

          s.branch_id,
          sb.branch_name,

          s.designation,
          s.joining_date,
          s.status,

          s.zkteco_emp_id,
          s.zkteco_emp_code,
          s.zkteco_synced,
          s.zkteco_last_sync,

          s.remarks,
          s.created_at,
          s.updated_at

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id = s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id = s.branch_id

        ${whereClause}

        ORDER BY
          s.id DESC

        LIMIT :limit
        OFFSET :offset
      `,
      {
        ...params,
        limit: pageSize,
        offset,
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
          total / pageSize
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| SINGLE STAFF
|--------------------------------------------------------------------------
*/

async function getStaffById(
  id
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          s.*,

          sc.category_name,
          sc.zkbiotime_department_id,

          sb.branch_name,
          sb.zkbiotime_position_id

        FROM staff s

        LEFT JOIN staff_categories sc
          ON sc.id = s.category_id

        LEFT JOIN staff_branches sb
          ON sb.id = s.branch_id

        WHERE
          s.id = :id
          AND s.is_deleted = 0

        LIMIT 1
      `,
      {
        id,
      }
    );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| CATEGORY
|--------------------------------------------------------------------------
*/

async function getStaffCategoryById(
  id
) {
  const [rows] =
    await pool.query(
      `
        SELECT *
        FROM staff_categories

        WHERE id = :id
          AND is_active = 1

        LIMIT 1
      `,
      {
        id,
      }
    );

  return rows[0] || null;
}

async function getStaffCategoryByName(
  categoryName
) {
  const [rows] =
    await pool.query(
      `
        SELECT *
        FROM staff_categories

        WHERE
          LOWER(
            TRIM(category_name)
          ) =
          LOWER(
            TRIM(:categoryName)
          )

        LIMIT 1
      `,
      {
        categoryName,
      }
    );

  return rows[0] || null;
}

async function createStaffCategory(
  data
) {
  const [result] =
    await pool.query(
      `
        INSERT INTO staff_categories
        (
          category_name,
          is_active
        )

        VALUES
        (
          :category_name,
          1
        )
      `,
      {
        category_name:
          data.category_name,
      }
    );

  return getStaffCategoryById(
    result.insertId
  );
}

async function updateStaffCategory(
  id,
  data
) {
  await pool.query(
    `
      UPDATE staff_categories

      SET
        category_name =
          :category_name

      WHERE id = :id
        AND is_active = 1
    `,
    {
      id,

      category_name:
        data.category_name,
    }
  );

  return getStaffCategoryById(
    id
  );
}

/*
|--------------------------------------------------------------------------
| CATEGORY LIST + STAFF COUNT
|--------------------------------------------------------------------------
|
| Count ONLY Category ke against hai.
|--------------------------------------------------------------------------
*/

async function getStaffCategories() {
  const [rows] =
    await pool.query(
      `
        SELECT
          sc.id,
          sc.category_name,

          sc.zkbiotime_department_id,
          sc.zkbiotime_dept_code,

          COUNT(
            DISTINCT
            CASE
              WHEN s.is_deleted = 0
              THEN s.id
            END
          ) AS staff_count,

          COUNT(
            DISTINCT
            CASE
              WHEN
                s.is_deleted = 0
                AND s.status = 'ACTIVE'
              THEN s.id
            END
          ) AS active_staff_count

        FROM staff_categories sc

        LEFT JOIN staff s
          ON s.category_id = sc.id

        WHERE
          sc.is_active = 1

        GROUP BY
          sc.id,
          sc.category_name,
          sc.zkbiotime_department_id,
          sc.zkbiotime_dept_code

        ORDER BY
          sc.category_name
      `
    );

  return rows.map(
    (row) => ({
      ...row,

      staff_count:
        Number(
          row.staff_count || 0
        ),

      active_staff_count:
        Number(
          row.active_staff_count || 0
        ),
    })
  );
}

/*
|--------------------------------------------------------------------------
| BRANCH
|--------------------------------------------------------------------------
*/

async function getStaffBranchById(
  id
) {
  const [rows] =
    await pool.query(
      `
        SELECT *
        FROM staff_branches

        WHERE id = :id
          AND is_active = 1

        LIMIT 1
      `,
      {
        id,
      }
    );

  return rows[0] || null;
}

async function getStaffBranchByName(
  branchName
) {
  const [rows] =
    await pool.query(
      `
        SELECT *
        FROM staff_branches

        WHERE
          LOWER(
            TRIM(branch_name)
          ) =
          LOWER(
            TRIM(:branchName)
          )

        LIMIT 1
      `,
      {
        branchName,
      }
    );

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| BRANCH LIST
|--------------------------------------------------------------------------
|
| Branch kisi Category se linked nahi.
| Is liye yahan category aur staff count nahi.
|--------------------------------------------------------------------------
*/

async function getStaffBranches() {
  const [rows] =
    await pool.query(
      `
        SELECT
          sb.id,
          sb.branch_name,
          sb.zkbiotime_position_id,

          COUNT(
            DISTINCT
            CASE
              WHEN s.is_deleted = 0
              THEN s.id
            END
          ) AS staff_count,

          COUNT(
            DISTINCT
            CASE
              WHEN
                s.is_deleted = 0
                AND s.status = 'ACTIVE'
              THEN s.id
            END
          ) AS active_staff_count

        FROM staff_branches sb

        LEFT JOIN staff s
          ON s.branch_id = sb.id

        WHERE
          sb.is_active = 1

        GROUP BY
          sb.id,
          sb.branch_name,
          sb.zkbiotime_position_id

        ORDER BY
          sb.branch_name
      `
    );

  return rows.map(
    (row) => ({
      ...row,

      staff_count:
        Number(
          row.staff_count || 0
        ),

      active_staff_count:
        Number(
          row.active_staff_count || 0
        ),
    })
  );
}

async function createStaffBranch(
  data
) {
  const [result] =
    await pool.query(
      `
        INSERT INTO staff_branches
        (
          branch_name,
          zkbiotime_position_id,
          is_active
        )

        VALUES
        (
          :branch_name,
          :zkbiotime_position_id,
          1
        )
      `,
      {
        branch_name:
          data.branch_name,

        zkbiotime_position_id:
          data.zkbiotime_position_id ||
          null,
      }
    );

  return getStaffBranchById(
    result.insertId
  );
}

async function updateStaffBranch(
  id,
  data
) {
  await pool.query(
    `
      UPDATE staff_branches

      SET
        branch_name =
          :branch_name

      WHERE id = :id
        AND is_active = 1
    `,
    {
      id,

      branch_name:
        data.branch_name,
    }
  );

  return getStaffBranchById(
    id
  );
}

/*
|--------------------------------------------------------------------------
| CREATE STAFF
|--------------------------------------------------------------------------
*/

async function createStaff(
  data
) {
  const [result] =
    await pool.query(
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

          :category_id,
          :branch_id,

          :designation,
          :joining_date,

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

  return getStaffById(
    result.insertId
  );
}

/*
|--------------------------------------------------------------------------
| UPDATE STAFF
|--------------------------------------------------------------------------
*/

async function updateStaff(
  id,
  data
) {
  await pool.query(
    `
      UPDATE staff

      SET
        belt_no = :belt_no,
        first_name = :first_name,
        last_name = :last_name,
        father_name = :father_name,

        cnic = :cnic,
        phone = :phone,
        email = :email,
        address = :address,

        category_id = :category_id,
        branch_id = :branch_id,

        designation = :designation,
        joining_date = :joining_date,

        status = :status,
        remarks = :remarks

      WHERE
        id = :id
        AND is_deleted = 0
    `,
    {
      id,
      ...data,
    }
  );

  return getStaffById(
    id
  );
}

/*
|--------------------------------------------------------------------------
| SOFT DELETE
|--------------------------------------------------------------------------
*/

async function softDeleteStaff(
  id,
  deletedBy = null
) {
  const [result] =
    await pool.query(
      `
        UPDATE staff

        SET
          is_deleted = 1,
          deleted_at = NOW(),
          deleted_by = :deletedBy

        WHERE
          id = :id
          AND is_deleted = 0
      `,
      {
        id,
        deletedBy,
      }
    );

  return (
    result.affectedRows > 0
  );
}

/*
|--------------------------------------------------------------------------
| TRAINEE EXEMPTION
|--------------------------------------------------------------------------
*/

async function exemptFromTrainees(
  employeeId
) {
  await pool.query(
    `
      UPDATE trainees

      SET
        is_staff_exempt = 1

      WHERE
        employee_id = :employeeId
    `,
    {
      employeeId,
    }
  );
}

async function restoreToTrainees(
  employeeId
) {
  await pool.query(
    `
      UPDATE trainees

      SET
        is_staff_exempt = 0

      WHERE
        employee_id = :employeeId
    `,
    {
      employeeId,
    }
  );
}

module.exports = {
  getStaffList,
  getStaffById,

  getStaffCategoryById,
  getStaffCategoryByName,
  createStaffCategory,
  updateStaffCategory,
  getStaffCategories,

  getStaffBranchById,
  getStaffBranchByName,
  createStaffBranch,
  updateStaffBranch,
  getStaffBranches,

  createStaff,
  updateStaff,
  softDeleteStaff,

  exemptFromTrainees,
  restoreToTrainees,
};