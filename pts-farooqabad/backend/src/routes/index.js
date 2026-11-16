const express =
  require("express");

const healthRoutes =
  require("./health.routes");

const authRoutes =
  require("./auth.routes");

const zkbiotimeRoutes =
  require("./zkbiotime.routes");

const traineeRoutes =
  require("./trainee.routes");

const courseRoutes =
  require("./course.routes");

const platoonRoutes =
  require("./platoon.routes");

const staffRoutes =
  require("./staff.routes");

const timetableRoutes =
  require("./timetable.routes");

const userManagementRoutes =
  require("./userManagement.routes");

const leaveRoutes =
  require("./leave.routes");

const osdRoutes =
  require("./osd.routes");

const outdoorRoutes =
  require("./outdoor.routes");

const attendanceRoutes =
  require("./attendance.routes");

const dataManagementRoutes =
  require("./dataManagement.routes");

const biometricRoutes =
  require("./biometric.routes");

const reportRoutes =
  require("./report.routes");

const manualAbsenceRoutes =
  require("./manualAbsence.routes");

const trainingDropRoutes =
  require("./trainingDrop.routes");

const publicSiteRoutes =
  require("./publicSite.routes");

const auditLogRoutes =
  require("./auditLog.routes");

const settingsRoutes =
  require("./settings.routes");

const dutyRestRoutes =
  require("./dutyRest.routes");

const dashboardRosterRoutes =
  require("./dashboardRoster.routes");


const dutyRosterRoutes =
  require("./dutyRoster.routes");

const customShiftRoutes =
  require("./customShift.routes");


const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

router.use(
  "/health",
  healthRoutes
);


/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

router.use(
  "/auth",
  authRoutes
);


/*
|--------------------------------------------------------------------------
| PUBLIC WEBSITE
|--------------------------------------------------------------------------
*/

router.use(
  "/public-site",
  publicSiteRoutes
);


/*
|--------------------------------------------------------------------------
| ZKBIOTIME
|--------------------------------------------------------------------------
*/

router.use(
  "/zkbiotime",
  zkbiotimeRoutes
);


/*
|--------------------------------------------------------------------------
| TRAINEES
|--------------------------------------------------------------------------
*/

router.use(
  "/trainees",
  traineeRoutes
);


/*
|--------------------------------------------------------------------------
| COURSES
|--------------------------------------------------------------------------
*/

router.use(
  "/courses",
  courseRoutes
);


/*
|--------------------------------------------------------------------------
| PLATOONS
|--------------------------------------------------------------------------
*/

router.use(
  "/platoons",
  platoonRoutes
);


/*
|--------------------------------------------------------------------------
| STAFF
|--------------------------------------------------------------------------
*/

router.use(
  "/staff",
  staffRoutes
);


/*
|--------------------------------------------------------------------------
| TIMETABLE
|--------------------------------------------------------------------------
*/

router.use(
  "/timetables",
  timetableRoutes
);


/*
|--------------------------------------------------------------------------
| OSD / PERMISSION
|--------------------------------------------------------------------------
*/

router.use(
  "/osd-permissions",
  osdRoutes
);


/*
|--------------------------------------------------------------------------
| OUTDOOR / MEDICAL
|--------------------------------------------------------------------------
*/

router.use(
  "/outdoor",
  outdoorRoutes
);


/*
|--------------------------------------------------------------------------
| ATTENDANCE
|--------------------------------------------------------------------------
*/

router.use(
  "/attendance",
  attendanceRoutes
);


/*
|--------------------------------------------------------------------------
| DATA MANAGEMENT
|--------------------------------------------------------------------------
*/

router.use(
  "/data-management",
  dataManagementRoutes
);


/*
|--------------------------------------------------------------------------
| BIOMETRIC
|--------------------------------------------------------------------------
*/

router.use(
  "/biometric",
  biometricRoutes
);


/*
|--------------------------------------------------------------------------
| REPORTS
|--------------------------------------------------------------------------
*/

router.use(
  "/reports",
  reportRoutes
);


/*
|--------------------------------------------------------------------------
| MANUAL ABSENCE
|--------------------------------------------------------------------------
*/

router.use(
  "/manual-absence",
  manualAbsenceRoutes
);


/*
|--------------------------------------------------------------------------
| TRAINING DROP
|--------------------------------------------------------------------------
*/

router.use(
  "/training-drops",
  trainingDropRoutes
);


/*
|--------------------------------------------------------------------------
| AUDIT LOGS
|--------------------------------------------------------------------------
*/

router.use(
  "/audit-logs",
  auditLogRoutes
);


/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

router.use(
  "/settings",
  settingsRoutes
);


/*
|--------------------------------------------------------------------------
| STAFF DUTY REST
|--------------------------------------------------------------------------
*/

router.use(
  "/duty-rest",
  dutyRestRoutes
);


/*
|--------------------------------------------------------------------------
| DASHBOARD ROSTER SOURCE
|--------------------------------------------------------------------------
*/

router.use(
  "/dashboard",
  dashboardRosterRoutes
);


/*
|--------------------------------------------------------------------------
| SHIFT DUTY / DUTY ROSTER
|--------------------------------------------------------------------------
*/

router.use(
  "/duty-rosters",
  dutyRosterRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOM STAFF SHIFT DUTY
|--------------------------------------------------------------------------
*/

router.use(
  "/custom-shifts",
  customShiftRoutes
);


/*
|--------------------------------------------------------------------------
| LEAVE MANAGEMENT
|--------------------------------------------------------------------------
*/

router.use(
  "/leaves",
  leaveRoutes
);


/*
|--------------------------------------------------------------------------
| USER / ROLE MANAGEMENT
|--------------------------------------------------------------------------
|
| Keep this last because it is mounted on "/".
|
|--------------------------------------------------------------------------
*/

router.use(
  "/",
  userManagementRoutes
);


module.exports =
  router;