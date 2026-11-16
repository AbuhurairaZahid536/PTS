const express =
  require("express");

const {
  authenticate,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
  deleteTrainees,
  deleteStaff,
  deleteCourse,
  deletePlatoon,
  deleteStaffCategory,
  deleteStaffBranch,
} = require(
  "../controllers/dataManagement.controller"
);

const router =
  express.Router();

router.use(
  authenticate
);

/*
|--------------------------------------------------------------------------
| PERMANENT DELETE SECURITY
|--------------------------------------------------------------------------
|
| Permanent deletion sirf Super Admin level permission par available hai.
|
| Dedicated data_management.manage permission is preferred.
| users.manage remains accepted for backward compatibility with existing
| Super Admin / legacy roles during the permission migration.
|--------------------------------------------------------------------------
*/

router.post(
  "/trainees/permanent-delete",

  requireAnyPermission(
    "data_management.manage",
    "users.manage"
  ),

  deleteTrainees
);

router.post(
  "/staff/permanent-delete",

  requireAnyPermission(
    "data_management.manage",
    "users.manage"
  ),

  deleteStaff
);

router.post(
  "/courses/:id/permanent-delete",

  requireAnyPermission(
    "data_management.manage",
    "users.manage"
  ),

  deleteCourse
);

router.post(
  "/platoons/:id/permanent-delete",

  requireAnyPermission(
    "data_management.manage",
    "users.manage"
  ),

  deletePlatoon
);

/*
|--------------------------------------------------------------------------
| STAFF MASTER PERMANENT DELETE
|--------------------------------------------------------------------------
*/

router.post(
  "/staff-categories/:id/permanent-delete",

  requireAnyPermission(
    "data_management.manage",
    "users.manage"
  ),

  deleteStaffCategory
);

router.post(
  "/staff-branches/:id/permanent-delete",

  requireAnyPermission(
    "data_management.manage",
    "users.manage"
  ),

  deleteStaffBranch
);

module.exports =
  router;
