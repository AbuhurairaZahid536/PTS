const express =
  require(
    "express"
  );

const {
  authenticate,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
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
} = require(
  "../controllers/staff.controller"
);


const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| AUTHENTICATION
|--------------------------------------------------------------------------
*/

router.use(
  authenticate
);


/*
|--------------------------------------------------------------------------
| CATEGORY
|--------------------------------------------------------------------------
*/

router.get(
  "/categories",

  requireAnyPermission(
    "staff.view",
    "staff.edit",

    "timetable.view",
    "timetable.edit",

    "duty_rest.view",
    "duty_rest.manage",

    "profiles.edit"
  ),

  listStaffCategories
);


router.post(
  "/categories",

  requirePermission(
    "staff.edit"
  ),

  addStaffCategory
);

router.put(
  "/categories/:id",

  requirePermission(
    "staff.edit"
  ),

  editStaffCategory
);


/*
|--------------------------------------------------------------------------
| BRANCH
|--------------------------------------------------------------------------
*/

router.get(
  "/branches",

  requireAnyPermission(
    "staff.view",
    "staff.edit",

    "profiles.edit"
  ),

  listStaffBranches
);


router.post(
  "/branches",

  requirePermission(
    "staff.edit"
  ),

  addStaffBranch
);

router.put(
  "/branches/:id",

  requirePermission(
    "staff.edit"
  ),

  editStaffBranch
);


/*
|--------------------------------------------------------------------------
| ZKBIOTIME MASTER SYNC
|--------------------------------------------------------------------------
|
| Ye data-changing operation hai.
|--------------------------------------------------------------------------
*/

router.post(
  "/sync-masters",

  requirePermission(
    "staff.edit"
  ),

  syncStaffMasters
);


/*
|--------------------------------------------------------------------------
| STAFF VIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requireAnyPermission(
    "staff.view",
    "staff.edit"
  ),

  listStaff
);


router.get(
  "/:id",

  requireAnyPermission(
    "staff.view",
    "staff.edit"
  ),

  getStaff
);


/*
|--------------------------------------------------------------------------
| STAFF EDIT
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  requirePermission(
    "staff.edit"
  ),

  addStaff
);


router.put(
  "/:id",

  requireAnyPermission(
    "staff.edit",
    "profiles.edit"
  ),

  editStaff
);


router.delete(
  "/:id",

  requirePermission(
    "staff.edit"
  ),

  deleteStaff
);


module.exports =
  router;