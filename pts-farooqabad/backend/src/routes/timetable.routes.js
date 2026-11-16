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
  listTimetables,
  getTimetable,
  addTimetable,
  editTimetable,
  removeTimetable,
} = require(
  "../controllers/timetable.controller"
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
| VIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requireAnyPermission(
    "timetable.view",
    "timetable.edit"
  ),

  listTimetables
);


router.get(
  "/:id",

  requireAnyPermission(
    "timetable.view",
    "timetable.edit"
  ),

  getTimetable
);


/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  requirePermission(
    "timetable.edit"
  ),

  addTimetable
);


router.put(
  "/:id",

  requirePermission(
    "timetable.edit"
  ),

  editTimetable
);


router.delete(
  "/:id",

  requirePermission(
    "timetable.edit"
  ),

  removeTimetable
);


module.exports =
  router;