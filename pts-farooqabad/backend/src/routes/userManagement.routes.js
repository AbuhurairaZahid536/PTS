const express =
  require("express");

const {
  authenticate,

  requirePermission,
  requireAnyPermission,
} = require("../middleware/auth");

const {
  listUsers,
  getUser,

  listRoles,
  listPermissions,

  addRole,
  editRole,

  changeRoleStatus,

  getRolePermissions,
  saveRolePermissions,

  addUser,
  editUser,

  changeUserStatus,
  resetUserPassword,

  getUserPermissions,
  saveUserPermissions,
} = require("../controllers/userManagement.controller");


const router =
  express.Router();


router.use(
  authenticate
);


/*
|--------------------------------------------------------------------------
| MASTER DATA
|--------------------------------------------------------------------------
|
| users.manage:
|   User create/edit karne ke liye Roles list required hai.
|
| roles.manage:
|   Roles aur permissions manage karne ke liye.
|--------------------------------------------------------------------------
*/

router.get(
  "/roles",

  requireAnyPermission([
    "users.view",
    "users.manage",
    "roles.view",
    "roles.manage",
  ]),

  listRoles
);


router.get(
  "/permissions",

  requireAnyPermission([
    "users.manage",
    "roles.view",
    "roles.manage",
  ]),

  listPermissions
);


/*
|--------------------------------------------------------------------------
| ROLE MANAGEMENT
|--------------------------------------------------------------------------
*/

router.post(
  "/roles",

  requirePermission(
    "roles.manage"
  ),

  addRole
);


router.put(
  "/roles/:id",

  requirePermission(
    "roles.manage"
  ),

  editRole
);


router.put(
  "/roles/:id/status",

  requirePermission(
    "roles.manage"
  ),

  changeRoleStatus
);


router.get(
  "/roles/:id/permissions",

  requireAnyPermission(
    "roles.view",
    "roles.manage"
  ),

  getRolePermissions
);


router.put(
  "/roles/:id/permissions",

  requirePermission(
    "roles.manage"
  ),

  saveRolePermissions
);


/*
|--------------------------------------------------------------------------
| USER MANAGEMENT
|--------------------------------------------------------------------------
*/

router.get(
  "/users",

  requireAnyPermission(
    "users.view",
    "users.manage"
  ),

  listUsers
);


router.post(
  "/users",

  requirePermission(
    "users.manage"
  ),

  addUser
);


router.get(
  "/users/:id",

  requireAnyPermission(
    "users.view",
    "users.manage"
  ),

  getUser
);


router.put(
  "/users/:id",

  requirePermission(
    "users.manage"
  ),

  editUser
);


router.put(
  "/users/:id/status",

  requirePermission(
    "users.manage"
  ),

  changeUserStatus
);


router.put(
  "/users/:id/password",

  requirePermission(
    "users.manage"
  ),

  resetUserPassword
);


/*
|--------------------------------------------------------------------------
| INDIVIDUAL USER PERMISSIONS
|--------------------------------------------------------------------------
*/

router.get(
  "/users/:id/permissions",

  requirePermission(
    "users.manage"
  ),

  getUserPermissions
);


router.put(
  "/users/:id/permissions",

  requirePermission(
    "users.manage"
  ),

  saveUserPermissions
);


module.exports =
  router;