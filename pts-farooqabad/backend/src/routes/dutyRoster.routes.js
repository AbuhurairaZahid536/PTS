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
  getRecord,
  addRecord,
  editRecord,
  deleteRecord,
  attendanceSummary,
  staffDutyStatus,
} = require(
  "../controllers/dutyRoster.controller"
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


router.get(
  "/attendance-summary",
  requireAnyPermission(
    "duty_roster.view",
    "dashboard.view",
    "timetable.view",
    "timetable.edit"
  ),
  attendanceSummary
);


/*
|--------------------------------------------------------------------------
| INSTANT STAFF DUTY STATUS
|--------------------------------------------------------------------------
| Must stay before /:id so Express does not treat "staff-status" as an ID.
*/
router.get(
  "/staff-status",
  requireAnyPermission(
    "duty_roster.view",
    "duty_roster.manage",
    "timetable.view",
    "timetable.edit"
  ),
  staffDutyStatus
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
  "/:id",
  requireAnyPermission(
    "duty_roster.manage",
    "timetable.edit"
  ),
  deleteRecord
);


module.exports =
  router;
