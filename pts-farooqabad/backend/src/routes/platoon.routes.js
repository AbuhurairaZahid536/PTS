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
  listPlatoons,
  addPlatoon,
} = require(
  "../controllers/platoon.controller"
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
| VIEW / LOOKUP
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requireAnyPermission(
    "platoons.view",
    "platoons.edit",

    "trainees.view",
    "trainees.edit",

    "profiles.edit"
  ),

  listPlatoons
);


/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  requirePermission(
    "platoons.edit"
  ),

  addPlatoon
);


module.exports =
  router;