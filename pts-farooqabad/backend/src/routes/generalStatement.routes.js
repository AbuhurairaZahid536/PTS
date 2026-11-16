const express =
  require(
    "express"
  );

const {
  authenticate,
  requirePermission,
} = require(
  "../middleware/auth"
);

const {
  listActiveCourses,
  courseGeneralStatement,
} = require(
  "../controllers/generalStatement.controller"
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
| GENERAL STATEMENT VIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/courses",

  requirePermission(
    "general_statement.view"
  ),

  listActiveCourses
);


router.get(
  "/course/:courseId",

  requirePermission(
    "general_statement.view"
  ),

  courseGeneralStatement
);


module.exports =
  router;