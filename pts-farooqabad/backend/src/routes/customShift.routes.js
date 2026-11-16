const express =
  require("express");

const {
  authenticate,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
  listRecords,
  recordsForDate,
  attendanceSummary,
  getRecord,
  addRecord,
  editRecord,
  deleteRecord,
  permanentDeleteRecord,
} = require(
  "../controllers/customShift.controller"
);

const router =
  express.Router();

router.use(
  authenticate
);


router.get(
  "/",
  requireAnyPermission(
    "duty_roster.view",
    "duty_roster.manage",
    "timetable.view",
    "timetable.edit"
  ),
  listRecords
);


/*
| Keep named route before /:id.
| Returns only groups/assignments applicable to the selected attendance date.
*/
router.get(
  "/for-date",
  requireAnyPermission(
    "duty_roster.view",
    "duty_roster.manage",
    "dashboard.view",
    "timetable.view",
    "timetable.edit"
  ),
  recordsForDate
);


router.get(
  "/attendance-summary",
  requireAnyPermission(
    "duty_roster.view",
    "duty_roster.manage",
    "dashboard.view",
    "timetable.view",
    "timetable.edit"
  ),
  attendanceSummary
);


router.get(
  "/:id",
  requireAnyPermission(
    "duty_roster.view",
    "duty_roster.manage",
    "timetable.view",
    "timetable.edit"
  ),
  getRecord
);


router.post(
  "/",
  requireAnyPermission(
    "duty_roster.manage",
    "timetable.edit"
  ),
  addRecord
);


router.put(
  "/:id",
  requireAnyPermission(
    "duty_roster.manage",
    "timetable.edit"
  ),
  editRecord
);


router.delete(
  "/:id/permanent",
  requireAnyPermission(
    "duty_roster.manage",
    "timetable.edit"
  ),
  permanentDeleteRecord
);


router.delete(
  "/:id",
  requireAnyPermission(
    "duty_roster.manage",
    "timetable.edit"
  ),
  deleteRecord
);


module.exports =
  router;
