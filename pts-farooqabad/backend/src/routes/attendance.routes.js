const express =
  require("express");

const {
  authenticate,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/auth");

const {
  processAttendance,
  listAttendance,
  attendanceSummary,
} = require("../controllers/attendance.controller");

const router =
  express.Router();

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
    "attendance.view",
    "attendance.correct"
  ),
  listAttendance
);

router.get(
  "/summary",
  requireAnyPermission(
    "attendance.view",
    "attendance.correct"
  ),
  attendanceSummary
);

/*
|--------------------------------------------------------------------------
| PROCESS / RECALCULATE
|--------------------------------------------------------------------------
|
| Abhi attendance.correct permission use kar rahe hain.
| Super Admin isko run kar sakega.
|--------------------------------------------------------------------------
*/

router.post(
  "/process",
  requirePermission(
    "attendance.correct"
  ),
  processAttendance
);

module.exports =
  router;