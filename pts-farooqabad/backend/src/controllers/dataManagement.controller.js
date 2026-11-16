const {
  bulkDeleteTrainees,
  bulkDeleteStaff,
  permanentlyDeleteCourse,
  permanentlyDeletePlatoon,
  permanentlyDeleteStaffCategory,
  permanentlyDeleteStaffBranch,
} = require(
  "../services/permanentDelete.service"
);

function getIds(body) {
  if (
    !Array.isArray(
      body.ids
    )
  ) {
    return [];
  }

  return body.ids;
}

function getUserId(req) {
  return (
    req.user?.id ||
    req.user?.user_id ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| TRAINEES
|--------------------------------------------------------------------------
*/

async function deleteTrainees(
  req,
  res,
  next
) {
  try {
    const ids =
      getIds(req.body);

    if (!ids.length) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Select at least one trainee.",
        });
    }

    const result =
      await bulkDeleteTrainees({
        ids,

        deleteRawTransactions:
          Boolean(
            req.body
              .delete_raw_transactions
          ),

        userId:
          getUserId(req),
      });

    return res.json({
      success:
        result.failed === 0,

      message:
        result.failed === 0
          ? `${result.deleted} trainee(s) permanently deleted.`
          : `${result.deleted} deleted, ${result.failed} failed.`,

      data:
        result,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| STAFF
|--------------------------------------------------------------------------
*/

async function deleteStaff(
  req,
  res,
  next
) {
  try {
    const ids =
      getIds(req.body);

    if (!ids.length) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Select at least one staff member.",
        });
    }

    const result =
      await bulkDeleteStaff({
        ids,

        deleteRawTransactions:
          Boolean(
            req.body
              .delete_raw_transactions
          ),

        userId:
          getUserId(req),
      });

    return res.json({
      success:
        result.failed === 0,

      message:
        result.failed === 0
          ? `${result.deleted} staff member(s) permanently deleted.`
          : `${result.deleted} deleted, ${result.failed} failed.`,

      data:
        result,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| COURSE
|--------------------------------------------------------------------------
*/

async function deleteCourse(
  req,
  res,
  next
) {
  try {
    const courseId =
      Number(
        req.params.id
      );

    if (!courseId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Invalid Course ID.",
        });
    }

    const result =
      await permanentlyDeleteCourse({
        courseId,

        deleteTrainees:
          Boolean(
            req.body
              .delete_trainees
          ),

        deleteRawTransactions:
          Boolean(
            req.body
              .delete_raw_transactions
          ),

        userId:
          getUserId(req),
      });

    return res.json({
      success: true,

      message:
        "Course permanently deleted.",

      data:
        result,
    });
  } catch (error) {
    return res
      .status(409)
      .json({
        success: false,
        message:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| PLATOON
|--------------------------------------------------------------------------
*/

async function deletePlatoon(
  req,
  res,
  next
) {
  try {
    const platoonId =
      Number(
        req.params.id
      );

    if (!platoonId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Invalid Platoon ID.",
        });
    }

    const result =
      await permanentlyDeletePlatoon({
        platoonId,

        deleteTrainees:
          Boolean(
            req.body
              .delete_trainees
          ),

        deleteRawTransactions:
          Boolean(
            req.body
              .delete_raw_transactions
          ),

        userId:
          getUserId(req),
      });

    return res.json({
      success: true,

      message:
        "Platoon permanently deleted.",

      data:
        result,
    });
  } catch (error) {
    return res
      .status(409)
      .json({
        success: false,
        message:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| STAFF CATEGORY
|--------------------------------------------------------------------------
|
| Category permanent delete:
| - category ke tamam Staff records permanently remove honge
| - duplicate Employee ID ki doosri Portal identity ho to ZK person/raw data
|   protected rahenge
| - mapped ZKBioTime Department sirf tab delete hoga jab kahin aur use na ho
|--------------------------------------------------------------------------
*/

async function deleteStaffCategory(
  req,
  res,
  next
) {
  try {
    const categoryId =
      Number(
        req.params.id
      );

    if (!categoryId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid Staff Category ID.",
        });
    }

    const result =
      await permanentlyDeleteStaffCategory({
        categoryId,

        deleteRawTransactions:
          Boolean(
            req.body
              .delete_raw_transactions
          ),

        userId:
          getUserId(req),
      });

    if (!result.success) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            result.error ||
            "Staff Category could not be permanently deleted.",
          data:
            result,
        });
    }

    return res.json({
      success: true,
      message:
        `Staff Category permanently deleted. ${result.staff_deleted || 0} staff member(s) removed.`,
      data:
        result,
    });
  } catch (error) {
    return next(error);
  }
}

/*
|--------------------------------------------------------------------------
| STAFF BRANCH / POSTING PLACE
|--------------------------------------------------------------------------
|
| Branch permanent delete:
| - branch ke tamam Staff records permanently remove honge
| - duplicate Employee ID ki doosri Portal identity ho to ZK person/raw data
|   protected rahenge
| - mapped ZKBioTime Position sirf tab delete hogi jab kahin aur use na ho
|--------------------------------------------------------------------------
*/

async function deleteStaffBranch(
  req,
  res,
  next
) {
  try {
    const branchId =
      Number(
        req.params.id
      );

    if (!branchId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid Staff Branch / Posting Place ID.",
        });
    }

    const result =
      await permanentlyDeleteStaffBranch({
        branchId,

        deleteRawTransactions:
          Boolean(
            req.body
              .delete_raw_transactions
          ),

        userId:
          getUserId(req),
      });

    if (!result.success) {
      return res
        .status(409)
        .json({
          success: false,
          message:
            result.error ||
            "Branch / Posting Place could not be permanently deleted.",
          data:
            result,
        });
    }

    return res.json({
      success: true,
      message:
        `Branch / Posting Place permanently deleted. ${result.staff_deleted || 0} staff member(s) removed.`,
      data:
        result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  deleteTrainees,
  deleteStaff,
  deleteCourse,
  deletePlatoon,
  deleteStaffCategory,
  deleteStaffBranch,
};
