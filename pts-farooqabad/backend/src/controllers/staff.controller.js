const {
  pool,
} = require("../config/db");

const {
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
} = require("../models/staff.model");

const {
  createOrUpdateZkStaff,
  deleteZkEmployeeByCode,

  syncStaffCategoryToZk,
  syncStaffBranchToZk,
} = require(
  "../integrations/zkbiotime/employeeWrite.service"
);

const {
  logRequestAudit,
  logBulkAudit,
} = require(
  "../services/audit.service"
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

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

function dateOnly(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
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
  )
    .trim()
    .substring(
      0,
      10
    ) ||
    null;
}

/*
|--------------------------------------------------------------------------
| STAFF MASTER MAPPING SAFETY
|--------------------------------------------------------------------------
|
| Category Department / Branch Position kisi Course, Platoon ya doosre
| Staff master ke sath shared ho sakti hai. Rename ke waqt shared ZK master
| ko rename nahi karna. Is case mein local mapping detach karke renamed
| master ke liye nayi / matching safe mapping resolve ki jayegi.
|--------------------------------------------------------------------------
*/

async function isCategoryDepartmentShared(
  category
) {
  const departmentId =
    Number(
      category
        ?.zkbiotime_department_id ||
      0
    ) || null;

  if (!departmentId) {
    return false;
  }

  const [
    courseResult,
    categoryResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT id
        FROM courses
        WHERE zkbiotime_department_id = ?
        LIMIT 1
      `,
      [departmentId]
    ),

    pool.query(
      `
        SELECT id
        FROM staff_categories
        WHERE zkbiotime_department_id = ?
          AND id <> ?
          AND is_active = 1
        LIMIT 1
      `,
      [
        departmentId,
        category.id,
      ]
    ),
  ]);

  return (
    courseResult[0].length > 0 ||
    categoryResult[0].length > 0
  );
}

async function isBranchPositionShared(
  branch
) {
  const positionId =
    Number(
      branch
        ?.zkbiotime_position_id ||
      0
    ) || null;

  if (!positionId) {
    return false;
  }

  const [
    platoonResult,
    branchResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT id
        FROM platoons
        WHERE zkbiotime_position_id = ?
        LIMIT 1
      `,
      [positionId]
    ),

    pool.query(
      `
        SELECT id
        FROM staff_branches
        WHERE zkbiotime_position_id = ?
          AND id <> ?
          AND is_active = 1
        LIMIT 1
      `,
      [
        positionId,
        branch.id,
      ]
    ),
  ]);

  return (
    platoonResult[0].length > 0 ||
    branchResult[0].length > 0
  );
}

async function resyncStaffForCategory(
  category
) {
  const [rows] =
    await pool.query(
      `
        SELECT id
        FROM staff
        WHERE category_id = ?
          AND is_deleted = 0
        ORDER BY id
      `,
      [category.id]
    );

  const results = [];

  for (const row of rows) {
    try {
      const staff =
        await getStaffById(
          row.id
        );

      if (!staff) {
        continue;
      }

      const branch =
        staff.branch_id
          ? await getStaffBranchById(
              staff.branch_id
            )
          : null;

      const result =
        await createOrUpdateZkStaff({
          staff,
          category,
          branch,
        });

      results.push({
        id: staff.id,
        employee_id:
          staff.employee_id,
        success: true,
        action:
          result?.action ||
          null,
      });
    } catch (error) {
      results.push({
        id: row.id,
        success: false,
        error:
          error.message,
      });
    }
  }

  return {
    total:
      rows.length,
    synced:
      results.filter(
        (item) =>
          item.success
      ).length,
    failed:
      results.filter(
        (item) =>
          !item.success
      ).length,
    failed_records:
      results.filter(
        (item) =>
          !item.success
      ),
  };
}

async function resyncStaffForBranch(
  branch
) {
  const [rows] =
    await pool.query(
      `
        SELECT id
        FROM staff
        WHERE branch_id = ?
          AND is_deleted = 0
        ORDER BY id
      `,
      [branch.id]
    );

  const results = [];

  for (const row of rows) {
    try {
      const staff =
        await getStaffById(
          row.id
        );

      if (!staff) {
        continue;
      }

      const category =
        await getStaffCategoryById(
          staff.category_id
        );

      if (!category) {
        throw new Error(
          "Staff Category could not be resolved."
        );
      }

      const result =
        await createOrUpdateZkStaff({
          staff,
          category,
          branch,
        });

      results.push({
        id: staff.id,
        employee_id:
          staff.employee_id,
        success: true,
        action:
          result?.action ||
          null,
      });
    } catch (error) {
      results.push({
        id: row.id,
        success: false,
        error:
          error.message,
      });
    }
  }

  return {
    total:
      rows.length,
    synced:
      results.filter(
        (item) =>
          item.success
      ).length,
    failed:
      results.filter(
        (item) =>
          !item.success
      ).length,
    failed_records:
      results.filter(
        (item) =>
          !item.success
      ),
  };
}

/*
|--------------------------------------------------------------------------
| AUDIT SNAPSHOT
|--------------------------------------------------------------------------
|
| Same keys old/new mein use hon gi taake Audit Logs exact field changes
| show kar saken.
|
|--------------------------------------------------------------------------
*/

function buildStaffAuditState(
  record
) {
  if (!record) {
    return null;
  }

  return {
    employee_id:
      record.employee_id ||
      null,

    belt_no:
      record.belt_no ||
      null,

    first_name:
      record.first_name ||
      null,

    last_name:
      record.last_name ||
      null,

    father_name:
      record.father_name ||
      null,

    cnic:
      record.cnic ||
      null,

    phone:
      record.phone ||
      null,

    email:
      record.email ||
      null,

    address:
      record.address ||
      null,

    category_id:
      record.category_id ||
      null,

    category_name:
      record.category_name ||
      null,

    branch_id:
      record.branch_id ||
      null,

    branch_name:
      record.branch_name ||
      null,

    designation:
      record.designation ||
      null,

    joining_date:
      dateOnly(
        record.joining_date
      ),

    status:
      record.status ||
      null,

    remarks:
      record.remarks ||
      null,

    is_deleted:
      Boolean(
        record.is_deleted
      ),
  };
}

/*
|--------------------------------------------------------------------------
| LIST STAFF
|--------------------------------------------------------------------------
*/

async function listStaff(
  req,
  res,
  next
) {
  try {
    const page =
      Number(
        req.query.page || 1
      );

    const pageSize =
      Number(
        req.query.page_size ||
        25
      );

    if (
      !Number.isInteger(page) ||
      page < 1
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "page must be a positive integer.",
        });
    }

    if (
      !Number.isInteger(
        pageSize
      ) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "page_size must be between 1 and 100.",
        });
    }

    const result =
      await getStaffList({
        search:
          req.query.search ||
          "",

        categoryId:
          req.query.category_id ||
          null,

        branchId:
          req.query.branch_id ||
          null,

        status:
          req.query.status ||
          null,

        page,
        pageSize,
      });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| SINGLE STAFF
|--------------------------------------------------------------------------
*/

async function getStaff(
  req,
  res,
  next
) {
  try {
    const id =
      Number(req.params.id);

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid staff ID.",
        });
    }

    const staff =
      await getStaffById(id);

    if (!staff) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Staff member not found.",
        });
    }

    return res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| CATEGORIES
|--------------------------------------------------------------------------
*/

async function listStaffCategories(
  req,
  res,
  next
) {
  try {
    const rows =
      await getStaffCategories();

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| MANUAL ADD CATEGORY
|--------------------------------------------------------------------------
*/

async function addStaffCategory(
  req,
  res,
  next
) {
  try {
    const categoryName =
      cleanText(
        req.body.category_name
      );

    if (!categoryName) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Staff Category Name is required.",
        });
    }

    const existing =
      await getStaffCategoryByName(
        categoryName
      );

    if (existing) {
      return res
        .status(409)
        .json({
          success: false,

          message:
            "This Staff Category already exists.",

          data:
            existing,
        });
    }

    let category =
      await createStaffCategory({
        category_name:
          categoryName,
      });

    let zkSync = {
      status:
        "PENDING",
    };

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const department =
        await syncStaffCategoryToZk(
          category,
          connection
        );

      await connection.commit();

      zkSync = {
        status:
          "SYNCED",

        department_id:
          department?.id ||
          null,
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch (_) {
        // ignore
      }

      zkSync = {
        status:
          "PENDING",

        message:
          error.message,
      };
    } finally {
      connection.release();
    }

    category =
      await getStaffCategoryById(
        category.id
      );

    await logRequestAudit(
      req,
      {
        action:
          "CREATE",

        module:
          "STAFF_CATEGORY",

        recordId:
          category.id,

        description:
          `Staff Category ${categoryName} created. ZKBioTime: ${zkSync.status}.`,

        oldData:
          null,

        newData: {
          id:
            category.id,

          category_name:
            category.category_name ||
            categoryName,
        },
      }
    );

    return res
      .status(201)
      .json({
        success: true,

        message:
          "Staff Category created successfully.",

        data:
          category,

        zkbiotime:
          zkSync,
      });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| EDIT CATEGORY
|--------------------------------------------------------------------------
*/

async function editStaffCategory(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid Staff Category ID.",
        });
    }

    const categoryName =
      cleanText(
        req.body.category_name
      );

    if (!categoryName) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Staff Category Name is required.",
        });
    }

    const existing =
      await getStaffCategoryById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Staff Category not found.",
        });
    }

    const duplicate =
      await getStaffCategoryByName(
        categoryName
      );

    if (
      duplicate &&
      Number(duplicate.id) !==
        id
    ) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            "This Staff Category already exists.",
          data:
            duplicate,
        });
    }

    const oldDepartmentId =
      Number(
        existing
          .zkbiotime_department_id ||
        0
      ) || null;

    const sharedMapping =
      await isCategoryDepartmentShared(
        existing
      );

    await updateStaffCategory(
      id,
      {
        category_name:
          categoryName,
      }
    );

    if (
      sharedMapping &&
      oldDepartmentId
    ) {
      await pool.query(
        `
          UPDATE staff_categories
          SET
            zkbiotime_department_id = NULL,
            zkbiotime_dept_code = NULL
          WHERE id = ?
        `,
        [id]
      );
    }

    let category =
      await getStaffCategoryById(
        id
      );

    let zkSync = {
      status:
        "PENDING",
    };

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const department =
        await syncStaffCategoryToZk(
          category,
          connection
        );

      await connection.commit();

      zkSync = {
        status:
          "SYNCED",
        department_id:
          department?.id ||
          null,
        shared_mapping_detached:
          sharedMapping,
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch (_) {
        // ignore
      }

      zkSync = {
        status:
          "PENDING",
        message:
          error.message,
        shared_mapping_detached:
          sharedMapping,
      };
    } finally {
      connection.release();
    }

    category =
      await getStaffCategoryById(
        id
      );

    const newDepartmentId =
      Number(
        category
          ?.zkbiotime_department_id ||
        0
      ) || null;

    let staffSync = null;

    if (
      newDepartmentId &&
      newDepartmentId !==
        oldDepartmentId
    ) {
      staffSync =
        await resyncStaffForCategory(
          category
        );
    }

    await logRequestAudit(
      req,
      {
        action:
          "UPDATE",
        module:
          "STAFF_CATEGORY",
        recordId:
          id,
        description:
          `Staff Category ${existing.category_name} renamed to ${categoryName}. ZKBioTime: ${zkSync.status}.`,
        oldData:
          existing,
        newData:
          category,
      }
    );

    return res.json({
      success: true,
      message:
        "Staff Category updated successfully.",
      data:
        category,
      zkbiotime:
        zkSync,
      staff_sync:
        staffSync,
    });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            "This Staff Category already exists.",
        });
    }

    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| BRANCHES
|--------------------------------------------------------------------------
*/

async function listStaffBranches(
  req,
  res,
  next
) {
  try {
    const rows =
      await getStaffBranches();

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| MANUAL ADD BRANCH
|--------------------------------------------------------------------------
*/

async function addStaffBranch(
  req,
  res,
  next
) {
  try {
    const branchName =
      cleanText(
        req.body.branch_name
      );

    if (!branchName) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Branch / Posting Place is required.",
        });
    }

    const existing =
      await getStaffBranchByName(
        branchName
      );

    if (existing) {
      return res
        .status(409)
        .json({
          success: false,

          message:
            "This Branch / Posting Place already exists.",

          data:
            existing,
        });
    }

    let branch =
      await createStaffBranch({
        branch_name:
          branchName,
      });

    let zkSync = {
      status:
        "PENDING",
    };

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const position =
        await syncStaffBranchToZk(
          branch,
          connection
        );

      await connection.commit();

      zkSync = {
        status:
          "SYNCED",

        position_id:
          position?.id ||
          null,
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch (_) {
        // ignore
      }

      zkSync = {
        status:
          "PENDING",

        message:
          error.message,
      };
    } finally {
      connection.release();
    }

    branch =
      await getStaffBranchById(
        branch.id
      );

    await logRequestAudit(
      req,
      {
        action:
          "CREATE",

        module:
          "STAFF_BRANCH",

        recordId:
          branch.id,

        description:
          `Staff Branch / Posting Place ${branchName} created. ZKBioTime: ${zkSync.status}.`,

        oldData:
          null,

        newData: {
          id:
            branch.id,

          branch_name:
            branch.branch_name ||
            branchName,
        },
      }
    );

    return res
      .status(201)
      .json({
        success: true,

        message:
          "Branch / Posting Place created successfully.",

        data:
          branch,

        zkbiotime:
          zkSync,
      });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            "This Branch / Posting Place already exists.",
        });
    }

    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| EDIT BRANCH / POSTING PLACE
|--------------------------------------------------------------------------
*/

async function editStaffBranch(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid Branch / Posting Place ID.",
        });
    }

    const branchName =
      cleanText(
        req.body.branch_name
      );

    if (!branchName) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Branch / Posting Place is required.",
        });
    }

    const existing =
      await getStaffBranchById(
        id
      );

    if (!existing) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Branch / Posting Place not found.",
        });
    }

    const duplicate =
      await getStaffBranchByName(
        branchName
      );

    if (
      duplicate &&
      Number(duplicate.id) !==
        id
    ) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            "This Branch / Posting Place already exists.",
          data:
            duplicate,
        });
    }

    const oldPositionId =
      Number(
        existing
          .zkbiotime_position_id ||
        0
      ) || null;

    const sharedMapping =
      await isBranchPositionShared(
        existing
      );

    await updateStaffBranch(
      id,
      {
        branch_name:
          branchName,
      }
    );

    if (
      sharedMapping &&
      oldPositionId
    ) {
      await pool.query(
        `
          UPDATE staff_branches
          SET
            zkbiotime_position_id = NULL
          WHERE id = ?
        `,
        [id]
      );
    }

    let branch =
      await getStaffBranchById(
        id
      );

    let zkSync = {
      status:
        "PENDING",
    };

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      const position =
        await syncStaffBranchToZk(
          branch,
          connection
        );

      await connection.commit();

      const resolvedName =
        cleanText(
          position
            ?.position_name ||
          position
            ?.name
        );

      const nameMatches =
        resolvedName &&
        resolvedName.toLowerCase() ===
          branchName.toLowerCase();

      zkSync = {
        status:
          position?.id &&
          nameMatches
            ? "SYNCED"
            : "PENDING",
        position_id:
          position?.id ||
          null,
        shared_mapping_detached:
          sharedMapping,
        ...(
          position?.id &&
          !nameMatches
            ? {
                message:
                  "Branch updated in PTS, but ZKBioTime Position name update is pending.",
              }
            : {}
        ),
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch (_) {
        // ignore
      }

      zkSync = {
        status:
          "PENDING",
        message:
          error.message,
        shared_mapping_detached:
          sharedMapping,
      };
    } finally {
      connection.release();
    }

    branch =
      await getStaffBranchById(
        id
      );

    const newPositionId =
      Number(
        branch
          ?.zkbiotime_position_id ||
        0
      ) || null;

    let staffSync = null;

    if (
      newPositionId &&
      newPositionId !==
        oldPositionId
    ) {
      staffSync =
        await resyncStaffForBranch(
          branch
        );
    }

    await logRequestAudit(
      req,
      {
        action:
          "UPDATE",
        module:
          "STAFF_BRANCH",
        recordId:
          id,
        description:
          `Staff Branch / Posting Place ${existing.branch_name} renamed to ${branchName}. ZKBioTime: ${zkSync.status}.`,
        oldData:
          existing,
        newData:
          branch,
      }
    );

    return res.json({
      success: true,
      message:
        "Branch / Posting Place updated successfully.",
      data:
        branch,
      zkbiotime:
        zkSync,
      staff_sync:
        staffSync,
    });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            "This Branch / Posting Place already exists.",
        });
    }

    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| ADD STAFF
|--------------------------------------------------------------------------
*/

async function addStaff(
  req,
  res,
  next
) {
  try {
    const data =
      req.body;

    const employeeId =
      cleanText(
        data.employee_id
      );

    if (!employeeId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Employee ID is required.",
        });
    }

    const categoryId =
      Number(
        data.category_id
      );

    if (!categoryId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Staff Category is required.",
        });
    }

    const category =
      await getStaffCategoryById(
        categoryId
      );

    if (!category) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Selected Staff Category does not exist.",
        });
    }

    let branch = null;

    if (data.branch_id) {
      branch =
        await getStaffBranchById(
          data.branch_id
        );

      if (!branch) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Selected Branch / Posting Place does not exist.",
          });
      }
    }

    const staff =
      await createStaff({
        employee_id:
          employeeId,

        belt_no:
          cleanText(
            data.belt_no
          ),

        first_name:
          cleanText(
            data.first_name
          ),

        last_name:
          cleanText(
            data.last_name
          ),

        father_name:
          cleanText(
            data.father_name
          ),

        cnic:
          cleanText(
            data.cnic
          ),

        phone:
          cleanText(
            data.phone
          ),

        email:
          cleanText(
            data.email
          ),

        address:
          cleanText(
            data.address
          ),

        category_id:
          category.id,

        branch_id:
          branch?.id ||
          null,

        designation:
          cleanText(
            data.designation
          ),

        joining_date:
          data.joining_date ||
          null,

        status:
          data.status ||
          "ACTIVE",

        remarks:
          cleanText(
            data.remarks
          ),
      });

    await exemptFromTrainees(
      employeeId
    );

    let zkSync = {
      status:
        "PENDING",
    };

    try {
      const result =
        await createOrUpdateZkStaff({
          staff,
          category,
          branch,
        });

      zkSync = {
        status:
          "SYNCED",

        action:
          result.action,

        zkteco_employee_id:
          result.zkteco_employee_id ||
          null,
      };
    } catch (error) {
      zkSync = {
        status:
          "PENDING",

        message:
          error.message,
      };
    }

    const latestStaff =
      await getStaffById(
        staff.id
      );

    await logRequestAudit(
      req,
      {
        action:
          "CREATE",

        module:
          "STAFF",

        recordId:
          staff.id,

        description:
          `Staff ${employeeId} added. ZKBioTime: ${zkSync.status}.`,

        oldData:
          null,

        newData:
          buildStaffAuditState(
            latestStaff ||
            staff
          ),
      }
    );

    return res
      .status(201)
      .json({
        success: true,

        data:
          latestStaff ||
          staff,

        zkbiotime:
          zkSync,
      });
  } catch (error) {
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      return res
        .status(409)
        .json({
          success: false,

          message:
            "Employee ID or CNIC already exists in PTS Staff.",
        });
    }

    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| EDIT STAFF
|--------------------------------------------------------------------------
*/

async function editStaff(
  req,
  res,
  next
) {
  try {
    const id =
      Number(req.params.id);

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid staff ID.",
        });
    }

    const existing =
      await getStaffById(id);

    if (!existing) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Staff member not found.",
        });
    }

    const data =
      req.body;

    if (
      data.employee_id &&
      String(
        data.employee_id
      ).trim() !==
        String(
          existing.employee_id
        ).trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Employee ID cannot be changed after creation.",
        });
    }

    const categoryId =
      Number(
        data.category_id ||
        existing.category_id
      );

    const category =
      await getStaffCategoryById(
        categoryId
      );

    if (!category) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Selected Staff Category does not exist.",
        });
    }

    let branch = null;

    if (
      data.branch_id !==
      undefined
    ) {
      if (data.branch_id) {
        branch =
          await getStaffBranchById(
            data.branch_id
          );

        if (!branch) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Selected Branch / Posting Place does not exist.",
            });
        }
      }
    } else if (
      existing.branch_id
    ) {
      branch =
        await getStaffBranchById(
          existing.branch_id
        );
    }

    const staff =
      await updateStaff(
        id,
        {
          belt_no:
            data.belt_no !==
            undefined
              ? cleanText(
                  data.belt_no
                )
              : existing.belt_no,

          first_name:
            data.first_name !==
            undefined
              ? cleanText(
                  data.first_name
                )
              : existing.first_name,

          last_name:
            data.last_name !==
            undefined
              ? cleanText(
                  data.last_name
                )
              : existing.last_name,

          father_name:
            data.father_name !==
            undefined
              ? cleanText(
                  data.father_name
                )
              : existing.father_name,

          cnic:
            data.cnic !==
            undefined
              ? cleanText(
                  data.cnic
                )
              : existing.cnic,

          phone:
            data.phone !==
            undefined
              ? cleanText(
                  data.phone
                )
              : existing.phone,

          email:
            data.email !==
            undefined
              ? cleanText(
                  data.email
                )
              : existing.email,

          address:
            data.address !==
            undefined
              ? cleanText(
                  data.address
                )
              : existing.address,

          category_id:
            category.id,

          branch_id:
            branch?.id ||
            null,

          designation:
            data.designation !==
            undefined
              ? cleanText(
                  data.designation
                )
              : existing.designation,

          joining_date:
            data.joining_date !==
            undefined
              ? data.joining_date ||
                null
              : existing.joining_date,

          status:
            data.status ||
            existing.status,

          remarks:
            data.remarks !==
            undefined
              ? cleanText(
                  data.remarks
                )
              : existing.remarks,
        }
      );

    await exemptFromTrainees(
      existing.employee_id
    );

    let zkSync = {
      status:
        "PENDING",
    };

    try {
      const result =
        await createOrUpdateZkStaff({
          staff,
          category,
          branch,
        });

      zkSync = {
        status:
          "SYNCED",

        action:
          result.action,

        zkteco_employee_id:
          result.zkteco_employee_id ||
          null,
      };
    } catch (error) {
      zkSync = {
        status:
          "PENDING",

        message:
          error.message,
      };
    }

    const latestStaff =
      await getStaffById(
        id
      );

    await logRequestAudit(
      req,
      {
        action:
          "UPDATE",

        module:
          "STAFF",

        recordId:
          id,

        description:
          `Staff ${existing.employee_id} updated. ZKBioTime: ${zkSync.status}.`,

        oldData:
          buildStaffAuditState(
            existing
          ),

        newData:
          buildStaffAuditState(
            latestStaff ||
            staff
          ),
      }
    );

    return res.json({
      success: true,

      data:
        latestStaff ||
        staff,

      zkbiotime:
        zkSync,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

async function deleteStaff(
  req,
  res,
  next
) {
  try {
    const id =
      Number(req.params.id);

    if (
      !Number.isInteger(
        id
      ) ||
      id < 1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid staff ID.",
        });
    }

    const existing =
      await getStaffById(id);

    if (!existing) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Staff member not found.",
        });
    }

    let zkDelete;

    try {
      const result =
        await deleteZkEmployeeByCode(
          existing.employee_id,
          {
            zktecoEmpId:
              existing.zkteco_emp_id ||
              null,
          }
        );

      zkDelete = {
        status:
          "SYNCED",

        action:
          result.action,

        zkteco_employee_id:
          result.employee_id ||
          null,
      };
    } catch (error) {
      return res
        .status(502)
        .json({
          success: false,

          message:
            "ZKBioTime employee delete failed. PTS Staff record was not deleted.",

          error:
            error.message,
        });
    }

    const deleted =
      await softDeleteStaff(
        id,
        req.user?.id ||
          null
      );

    if (!deleted) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Staff member could not be deleted.",
        });
    }

    await restoreToTrainees(
      existing.employee_id
    );

    const oldAuditState =
      buildStaffAuditState(
        existing
      );

    await logRequestAudit(
      req,
      {
        action:
          "DELETE",

        module:
          "STAFF",

        recordId:
          id,

        description:
          `Staff ${existing.employee_id} deleted from PTS Staff and ZKBioTime.`,

        oldData:
          oldAuditState,

        newData: {
          ...oldAuditState,

          is_deleted:
            true,
        },
      }
    );

    return res.json({
      success: true,

      message:
        "Staff deleted successfully.",

      zkbiotime:
        zkDelete,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| SYNC CATEGORIES
|--------------------------------------------------------------------------
*/

async function syncStaffMasters(
  req,
  res,
  next
) {
  try {
    const categories =
      await getStaffCategories();

    const results = [];

    for (
      const category
      of categories
    ) {
      const connection =
        await pool.getConnection();

      try {
        await connection.beginTransaction();

        const department =
          await syncStaffCategoryToZk(
            category,
            connection
          );

        await connection.commit();

        results.push({
          category_id:
            category.id,

          category_name:
            category.category_name,

          status:
            "SYNCED",

          zk_department_id:
            department?.id ||
            null,
        });
      } catch (error) {
        try {
          await connection.rollback();
        } catch (_) {
          // ignore
        }

        results.push({
          category_id:
            category.id,

          category_name:
            category.category_name,

          status:
            "FAILED",

          error:
            error.message,
        });
      } finally {
        connection.release();
      }
    }

    const syncedCount =
      results.filter(
        (item) =>
          item.status ===
          "SYNCED"
      ).length;

    const failedCount =
      results.length -
      syncedCount;

    await logBulkAudit(
      req,
      {
        action:
          "SYNC",

        module:
          "STAFF_MASTER",

        description:
          "Staff Categories synchronized with ZKBioTime.",

        summary: {
          total:
            results.length,

          synced:
            syncedCount,

          failed:
            failedCount,
        },
      }
    );

    return res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listStaff,
  getStaff,

  listStaffCategories,
  addStaffCategory,
  editStaffCategory,

  listStaffBranches,
  addStaffBranch,
  editStaffBranch,

  addStaff,
  editStaff,
  deleteStaff,

  syncStaffMasters,
};