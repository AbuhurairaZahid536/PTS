const express =
  require("express");

const {
  authenticate,
  requirePermission,
} = require(
  "../middleware/auth"
);

const {
  listDrops,
  addDrop,
  editDrop,
  rejoin,
  cancel,
} = require(
  "../controllers/trainingDrop.controller"
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
| LIST TRAINING DROPS / REPATRIATES
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  requirePermission(
    "training_drop.view"
  ),
  listDrops
);


/*
|--------------------------------------------------------------------------
| ADD TRAINING DROP / REPATRIATE
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  requirePermission(
    "training_drop.create"
  ),
  addDrop
);


/*
|--------------------------------------------------------------------------
| EDIT TRAINING DROP / REPATRIATE
|--------------------------------------------------------------------------
|
| Current permission setup already has:
| training_drop.create
| training_drop.rejoin
| training_drop.cancel
|
| Separate training_drop.edit permission is not currently being used,
| so edit is kept under training_drop.create for now.
|
|--------------------------------------------------------------------------
*/

router.put(
  "/:id",
  requirePermission(
    "training_drop.create"
  ),
  editDrop
);


/*
|--------------------------------------------------------------------------
| REJOIN
|--------------------------------------------------------------------------
*/

router.put(
  "/:id/rejoin",
  requirePermission(
    "training_drop.rejoin"
  ),
  rejoin
);


/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

router.put(
  "/:id/cancel",
  requirePermission(
    "training_drop.cancel"
  ),
  cancel
);


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  router;