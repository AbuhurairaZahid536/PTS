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
  listCourses,
  addCourse,
  updateCourse,
} = require(
  "../controllers/course.controller"
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
    "courses.view",
    "courses.edit",

    "trainees.view",
    "trainees.edit",

    "platoons.view",
    "platoons.edit",

    "timetable.view",
    "timetable.edit",

    "weekend.manage",

    "settings.view",
    "settings.manage",

    "profiles.edit"
  ),

  listCourses
);


/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  requirePermission(
    "courses.edit"
  ),

  addCourse
);


router.put(
  "/:id",

  requirePermission(
    "courses.edit"
  ),

  updateCourse
);


module.exports =
  router;