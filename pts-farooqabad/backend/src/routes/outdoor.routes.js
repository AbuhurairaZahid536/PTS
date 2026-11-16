const express =
  require("express");

const {
  authenticate,
  requirePermission,
} = require(
  "../middleware/auth"
);

const {
  listOutdoor,
  getOutdoor,

  addOutdoor,
  editOutdoor,

  cancelOutdoorRecord,
  completeOutdoorRecord,
} = require(
  "../controllers/outdoor.controller"
);

const { updateHomeRestFromLeave } = require("../controllers/homeRestLeaveBridge.controller");

const router =
  express.Router();

router.use(
  authenticate
);

/*
|--------------------------------------------------------------------------
| LIST PERMISSION
|--------------------------------------------------------------------------
|
| Normal Outdoor / Medical Management:
|   outdoor.view is required.
|
| Leave Management also displays Home Rest records from the Outdoor tables.
| A Leave user must therefore be able to read ONLY the Home Rest-filtered
| list without receiving access to the general Outdoor / Medical register.
|
| Safe rule:
|
|   outdoor.view
|     -> may use the normal list endpoint with any supported filters.
|
|   leave.view + home_rest_only=1
|     -> may read Home Rest-filtered rows only.
|
| A Leave-only user calling /outdoor without home_rest_only=1 still receives
| 403, so this does not grant general Outdoor module access.
|--------------------------------------------------------------------------
*/

function requireOutdoorListPermission(
  req,
  res,
  next
) {
  if (!req.user) {
    return res
      .status(401)
      .json({
        success: false,
        message:
          "Authentication required.",
      });
  }

  const permissions =
    Array.isArray(
      req.user.permissions
    )
      ? req.user.permissions
      : [];

  if (
    permissions.includes(
      "outdoor.view"
    )
  ) {
    return next();
  }

  const homeRestOnly =
    String(
      req.query.home_rest_only ||
      ""
    ).trim() === "1";

  if (
    homeRestOnly &&
    permissions.includes(
      "leave.view"
    )
  ) {
    return next();
  }

  return res
    .status(403)
    .json({
      success: false,
      message:
        "You do not have permission for this action.",
      requiredPermission:
        homeRestOnly
          ? "outdoor.view or leave.view for Home Rest"
          : "outdoor.view",
    });
}

/*
|--------------------------------------------------------------------------
| VIEW LIST
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  requireOutdoorListPermission,
  listOutdoor
);

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  requirePermission(
    "outdoor.create"
  ),
  addOutdoor
);

/*
|--------------------------------------------------------------------------
| SINGLE
|--------------------------------------------------------------------------
|
| Single Outdoor / Medical record access remains protected by outdoor.view.
| Leave Management does not need this endpoint for its Home Rest merged list.
|--------------------------------------------------------------------------
*/

router.get(
  "/:subjectType/:id",
  requirePermission(
    "outdoor.view"
  ),
  getOutdoor
);

/* Home Rest-owned Leave controls: strictly scoped to the Home Rest component. */
router.put(
  "/:subjectType/:id/home-rest/cancel",
  requirePermission("leave.cancel"),
  updateHomeRestFromLeave
);

router.put(
  "/:subjectType/:id/home-rest",
  requirePermission("leave.edit"),
  updateHomeRestFromLeave
);

/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id",
  requirePermission(
    "outdoor.edit"
  ),
  editOutdoor
);

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id/cancel",
  requirePermission(
    "outdoor.cancel"
  ),
  cancelOutdoorRecord
);

/*
|--------------------------------------------------------------------------
| COMPLETE
|--------------------------------------------------------------------------
|
| outdoor.edit use kar rahe hain because separate
| outdoor.complete permission abhi RBAC mein nahi hai.
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id/complete",
  requirePermission(
    "outdoor.edit"
  ),
  completeOutdoorRecord
);

module.exports =
  router;
