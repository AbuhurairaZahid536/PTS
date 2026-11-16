const express = require("express");

const {
  testConnection,
  listEmployees,
  listAreas,
  listDepartments,
  listPositions,
  syncEmployeeRecords,
  syncAllEmployeeRecords,
} = require("../controllers/zkbiotime.controller");

const router = express.Router();

router.get("/status", testConnection);

router.get("/employees", listEmployees);
router.get("/areas", listAreas);
router.get("/departments", listDepartments);
router.get("/positions", listPositions);

router.post("/employees/sync", syncEmployeeRecords);
router.post("/employees/sync-all", syncAllEmployeeRecords);

module.exports = router;