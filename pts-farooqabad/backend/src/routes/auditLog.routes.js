const express =
  require("express");

const {
  authenticate,
  requirePermission,
} = require(
  "../middleware/auth"
);

const {
  listAuditLogs,
  getAuditLog,
  listAuditLogOptions,
} = require(
  "../controllers/auditLog.controller"
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
| AUDIT LOG FILTER OPTIONS
|--------------------------------------------------------------------------
|
| Audit Logs ki read access ka dedicated permission:
|
| audit.view
|
|--------------------------------------------------------------------------
*/

router.get(
  "/options",

  requirePermission(
    "audit.view"
  ),

  listAuditLogOptions
);


/*
|--------------------------------------------------------------------------
| LIST AUDIT LOGS
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requirePermission(
    "audit.view"
  ),

  listAuditLogs
);


/*
|--------------------------------------------------------------------------
| GET SINGLE AUDIT LOG
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",

  requirePermission(
    "audit.view"
  ),

  getAuditLog
);


module.exports =
  router;