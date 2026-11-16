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
  attendanceFilters,
  attendanceReport,
  exportAttendanceReport,

  longWeekendReport,
  exportLongWeekendReport,

  continuousAbsenceReport,
  exportContinuousAbsenceReport,

  customShiftFilters,
  customShiftReport,
  exportCustomShiftReport,
} = require(
  "../controllers/report.controller"
);

const router =
  express.Router();

router.use(
  authenticate
);

/*
|--------------------------------------------------------------------------
| ATTENDANCE FILTERS
|--------------------------------------------------------------------------
| Reports page only.
|--------------------------------------------------------------------------
*/
router.get(
  "/attendance/filters",

  requirePermission(
    "reports.view"
  ),

  attendanceFilters
);

/*
|--------------------------------------------------------------------------
| ATTENDANCE DATA
|--------------------------------------------------------------------------
| Dashboard also reads this endpoint.
|
| dashboard.view  => may read Dashboard attendance data
| reports.view    => may read Reports attendance data
|
| Export remains protected separately by reports.export.
|--------------------------------------------------------------------------
*/
router.get(
  "/attendance",

  requireAnyPermission(
    "dashboard.view",
    "reports.view"
  ),

  attendanceReport
);

router.get(
  "/attendance/export",

  requirePermission(
    "reports.export"
  ),

  exportAttendanceReport
);


/*
|--------------------------------------------------------------------------
| LONG WEEKEND / DEPARTURE REPORT
|--------------------------------------------------------------------------
*/

router.get(
  "/long-weekend",

  requirePermission(
    "reports.view"
  ),

  longWeekendReport
);

router.get(
  "/long-weekend/export",

  requirePermission(
    "reports.export"
  ),

  exportLongWeekendReport
);


/*
|--------------------------------------------------------------------------
| CONTINUOUS ABSENCE / RETURN REPORT
|--------------------------------------------------------------------------
|
| Reports module only.
|
| reports.view   => view Continuous Absence Report
| reports.export => export Continuous Absence Report
|
|--------------------------------------------------------------------------
*/

router.get(
  "/continuous-absence",

  requirePermission(
    "reports.view"
  ),

  continuousAbsenceReport
);

router.get(
  "/continuous-absence/export",

  requirePermission(
    "reports.export"
  ),

  exportContinuousAbsenceReport
);


/*
|--------------------------------------------------------------------------
| CUSTOM SHIFT DUTY ATTENDANCE REPORT
|--------------------------------------------------------------------------
| Persisted custom_shift_attendance only; viewing an old report never
| recalculates or rewrites historical attendance.
|--------------------------------------------------------------------------
*/

router.get(
  "/custom-shifts/filters",

  requirePermission(
    "reports.view"
  ),

  customShiftFilters
);

router.get(
  "/custom-shifts",

  requirePermission(
    "reports.view"
  ),

  customShiftReport
);

router.get(
  "/custom-shifts/export",

  requirePermission(
    "reports.export"
  ),

  exportCustomShiftReport
);


module.exports =
  router;
