const express =
  require("express");

const {
  authenticate,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
  traineeRoster,
  staffRoster,
  openContinuousAbsences,
  dashboardSnapshot,
} = require(
  "../controllers/dashboardRoster.controller"
);

const router =
  express.Router();

router.use(
  authenticate
);

const dashboardAccess =
  requireAnyPermission(
    "dashboard.view",
    "trainees.view",
    "staff.view",
    "attendance.view",
    "reports.view"
  );

router.get(
  "/snapshot",
  dashboardAccess,
  dashboardSnapshot
);

router.get(
  "/open-absences",
  dashboardAccess,
  openContinuousAbsences
);

router.get(
  "/trainees",
  dashboardAccess,
  traineeRoster
);

router.get(
  "/staff",
  dashboardAccess,
  staffRoster
);

module.exports =
  router;
