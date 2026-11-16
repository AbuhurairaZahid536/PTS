const express = require("express");

const {
  authenticate,
  requirePermission,
} = require("../middleware/auth");

const {
  listRecords,
  addRecord,
  editRecord,
  cancelRecordController,
} = require("../controllers/manualAbsence.controller");

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("manual_absence.view"),
  listRecords
);

router.post(
  "/",
  requirePermission("manual_absence.create"),
  addRecord
);

router.put(
  "/:subjectType/:id",
  requirePermission("manual_absence.edit"),
  editRecord
);

router.put(
  "/:subjectType/:id/cancel",
  requirePermission("manual_absence.cancel"),
  cancelRecordController
);

module.exports = router;