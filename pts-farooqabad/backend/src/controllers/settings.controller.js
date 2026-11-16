const {
  DEFAULT_SETTINGS,

  getSystemSettings,

  updateSystemSettings,

  getCourseLeaveCaps,
  getCourseLeaveCapByCourseId,
  courseExists,
  upsertCourseLeaveCap,
  deleteCourseLeaveCap,
} = require(
  "../models/settings.model"
);

const {
  logRequestAudit,
} = require(
  "../services/audit.service"
);


/*
|--------------------------------------------------------------------------
| SETTING LIMITS
|--------------------------------------------------------------------------
*/

const SETTING_LIMITS = {
  idle_logout_minutes: {
    min:
      1,

    max:
      240,

    label:
      "Idle Logout",
  },

  biometric_auto_sync_seconds: {
    min:
      5,

    max:
      300,

    label:
      "Biometric Auto Sync",
  },

  dashboard_refresh_seconds: {
    min:
      60,

    max:
      600,

    label:
      "Dashboard Refresh",
  },

  general_statement_refresh_seconds: {
    min:
      10,

    max:
      3600,

    label:
      "General Statement Refresh",
  },
};


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function hasOwn(
  object,
  key
) {
  return Object.prototype
    .hasOwnProperty
    .call(
      object,
      key
    );
}


function validateSettingValue(
  key,
  value
) {
  const definition =
    SETTING_LIMITS[
      key
    ];

  if (!definition) {
    const error =
      new Error(
        "Unknown system setting."
      );

    error.statusCode =
      400;

    throw error;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed
    )
  ) {
    const error =
      new Error(
        `${definition.label} must be a whole number.`
      );

    error.statusCode =
      400;

    throw error;
  }

  if (
    parsed <
      definition.min ||
    parsed >
      definition.max
  ) {
    const error =
      new Error(
        `${definition.label} must be between ${definition.min} and ${definition.max}.`
      );

    error.statusCode =
      400;

    throw error;
  }

  return parsed;
}


function normalizeAuditState(
  settings
) {
  return {
    idle_logout_minutes:
      Number(
        settings
          ?.idle_logout_minutes ??
        DEFAULT_SETTINGS
          .idle_logout_minutes
      ),

    biometric_auto_sync_seconds:
      Number(
        settings
          ?.biometric_auto_sync_seconds ??
        DEFAULT_SETTINGS
          .biometric_auto_sync_seconds
      ),

    dashboard_refresh_seconds:
      Number(
        settings
          ?.dashboard_refresh_seconds ??
        DEFAULT_SETTINGS
          .dashboard_refresh_seconds
      ),

    general_statement_refresh_seconds:
      Number(
        settings
          ?.general_statement_refresh_seconds ??
        DEFAULT_SETTINGS
          .general_statement_refresh_seconds
      ),
  };
}


/*
|--------------------------------------------------------------------------
| RUNTIME SETTINGS
|--------------------------------------------------------------------------
|
| Any authenticated user needs these values because App.jsx uses them for:
|
| - idle logout
| - biometric sync
| - dashboard refresh
| - general statement refresh
|
| Editing still requires settings.manage.
|
|--------------------------------------------------------------------------
*/

async function getRuntimeSettings(
  req,
  res,
  next
) {
  try {
    const settings =
      await getSystemSettings();

    return res.json({
      success:
        true,

      data:
        normalizeAuditState(
          settings
        ),
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| SETTINGS MANAGEMENT VIEW
|--------------------------------------------------------------------------
*/

async function getSettings(
  req,
  res,
  next
) {
  try {
    const settings =
      await getSystemSettings();

    return res.json({
      success:
        true,

      data:
        normalizeAuditState(
          settings
        ),

      defaults:
        normalizeAuditState(
          DEFAULT_SETTINGS
        ),

      limits:
        SETTING_LIMITS,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| UPDATE SETTINGS
|--------------------------------------------------------------------------
*/

async function updateSettings(
  req,
  res,
  next
) {
  try {
    const before =
      await getSystemSettings();

    const updates = {};

    for (
      const key
      of Object.keys(
        SETTING_LIMITS
      )
    ) {
      if (
        !hasOwn(
          req.body ||
            {},
          key
        )
      ) {
        continue;
      }

      updates[
        key
      ] =
        validateSettingValue(
          key,
          req.body[
            key
          ]
        );
    }

    if (
      !Object.keys(
        updates
      ).length
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "No valid system settings were supplied.",
        });
    }

    const after =
      await updateSystemSettings(
        updates,
        req.user?.id ||
          null
      );

    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await logRequestAudit(
      req,
      {
        action:
          "UPDATE",

        module:
          "SETTINGS",

        recordId:
          "SYSTEM",

        description:
          "System runtime settings updated.",

        oldData:
          normalizeAuditState(
            before
          ),

        newData:
          normalizeAuditState(
            after
          ),
      }
    );

    return res.json({
      success:
        true,

      message:
        "System settings updated successfully.",

      data:
        normalizeAuditState(
          after
        ),
    });
  } catch (error) {
    if (
      error.statusCode
    ) {
      return res
        .status(
          error.statusCode
        )
        .json({
          success:
            false,

          message:
            error.message,
        });
    }

    return next(
      error
    );
  }
}



/*
|--------------------------------------------------------------------------
| COURSE LEAVE CAPS
|--------------------------------------------------------------------------
*/

async function listCourseLeaveCaps(
  req,
  res,
  next
) {
  try {
    const rows =
      await getCourseLeaveCaps();

    return res.json({
      success:
        true,

      data:
        rows,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


async function saveCourseLeaveCap(
  req,
  res,
  next
) {
  try {
    const courseId =
      Number(
        req.params.courseId
      );

    const maxApprovedLeaves =
      Number(
        req.body
          ?.max_approved_leaves
      );

    if (
      !Number.isInteger(
        courseId
      ) ||
      courseId < 1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid Course is required.",
        });
    }

    if (
      !Number.isInteger(
        maxApprovedLeaves
      ) ||
      maxApprovedLeaves < 0 ||
      maxApprovedLeaves > 1000
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Maximum Approved Leaves must be a whole number between 0 and 1000.",
        });
    }

    const course =
      await courseExists(
        courseId
      );

    if (!course) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Course not found.",
        });
    }

    const before =
      await getCourseLeaveCapByCourseId(
        courseId
      );

    const after =
      await upsertCourseLeaveCap({
        courseId,

        maxApprovedLeaves,

        userId:
          req.user?.id ||
          null,
      });

    await logRequestAudit(
      req,
      {
        action:
          before
            ? "UPDATE"
            : "CREATE",

        module:
          "SETTINGS",

        recordId:
          `COURSE_LEAVE_CAP:${courseId}`,

        description:
          `Approved Leave cap saved for Course ${course.course_name}.`,

        oldData:
          before,

        newData:
          after,
      }
    );

    return res.json({
      success:
        true,

      message:
        "Course Leave Cap saved successfully.",

      data:
        after,
    });
  } catch (error) {
    return next(
      error
    );
  }
}


async function removeCourseLeaveCap(
  req,
  res,
  next
) {
  try {
    const courseId =
      Number(
        req.params.courseId
      );

    if (
      !Number.isInteger(
        courseId
      ) ||
      courseId < 1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid Course is required.",
        });
    }

    const removed =
      await deleteCourseLeaveCap(
        courseId
      );

    if (!removed) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Course Leave Cap not found.",
        });
    }

    await logRequestAudit(
      req,
      {
        action:
          "DELETE",

        module:
          "SETTINGS",

        recordId:
          `COURSE_LEAVE_CAP:${courseId}`,

        description:
          `Approved Leave cap removed for Course ${removed.course_name}.`,

        oldData:
          removed,

        newData:
          null,
      }
    );

    return res.json({
      success:
        true,

      message:
        "Course Leave Cap removed successfully.",
    });
  } catch (error) {
    return next(
      error
    );
  }
}

module.exports = {
  getRuntimeSettings,

  getSettings,

  updateSettings,

  listCourseLeaveCaps,
  saveCourseLeaveCap,
  removeCourseLeaveCap,
};