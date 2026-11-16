const express =
  require("express");

const {
  authenticate,

  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
  getRuntimeSettings,

  getSettings,

  updateSettings,

  listCourseLeaveCaps,
  saveCourseLeaveCap,
  removeCourseLeaveCap,
} = require(
  "../controllers/settings.controller"
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
| RUNTIME VALUES
|--------------------------------------------------------------------------
|
| Portal ke har authenticated user ko runtime intervals chahiye.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/runtime",

  getRuntimeSettings
);


/*
|--------------------------------------------------------------------------
| SETTINGS MANAGEMENT
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requireAnyPermission(
    "settings.view",
    "settings.manage"
  ),

  getSettings
);


router.put(
  "/",

  requirePermission(
    "settings.manage"
  ),

  updateSettings
);



/*
|--------------------------------------------------------------------------
| COURSE LEAVE CAPS
|--------------------------------------------------------------------------
*/

router.get(
  "/leave-caps",

  requireAnyPermission(
    "settings.view",
    "settings.manage"
  ),

  listCourseLeaveCaps
);


router.put(
  "/leave-caps/:courseId",

  requirePermission(
    "settings.manage"
  ),

  saveCourseLeaveCap
);


router.delete(
  "/leave-caps/:courseId",

  requirePermission(
    "settings.manage"
  ),

  removeCourseLeaveCap
);

module.exports =
  router;