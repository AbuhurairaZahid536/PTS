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
  syncTransactions,
  syncLiveTransactions,
  syncEmployeeMaster,
  transactions,
  filters,
  exportExcel,
  devices,
  deviceDetails,
  createDevice,
  updateDevice,
  deleteDevice,
  clearDeviceCommands,
  clearDeviceCapture,
  clearDeviceAll,
  uploadDeviceAll,
  uploadDeviceTransactions,
  rebootDevices,
  enrollDeviceRemotely,
  searchDeviceEmployees,
  resyncEmployeesToDevice,
  deleteBiometricTemplates,
} = require(
  "../controllers/biometric.controller"
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
| EMPLOYEE MASTER SYNC
|--------------------------------------------------------------------------
|
| Login / browser refresh par one-time employee master reconciliation.
|
| Duplicate concurrent requests ko controller level single-flight lock
| handle karega.
|--------------------------------------------------------------------------
*/

router.post(
  "/employees/master-sync",

  requirePermission(
    "biometric.sync"
  ),

  syncEmployeeMaster
);


/*
|--------------------------------------------------------------------------
| TRANSACTIONS
|--------------------------------------------------------------------------
*/

router.get(
  "/transactions",

  requireAnyPermission(
    "biometric.view",
    "attendance.view"
  ),

  transactions
);


router.get(
  "/transactions/filters",

  requireAnyPermission(
    "biometric.view",
    "attendance.view"
  ),

  filters
);


router.get(
  "/transactions/export",

  requireAnyPermission(
    "biometric.view",
    "attendance.view"
  ),

  exportExcel
);


/*
|--------------------------------------------------------------------------
| MANUAL CURRENT-DATE SYNC
|--------------------------------------------------------------------------
|
| Ye bhi automatic live sync ke same backend single-flight lock mein jayegi.
|--------------------------------------------------------------------------
*/

router.post(
  "/transactions/sync",

  requirePermission(
    "biometric.sync"
  ),

  syncTransactions
);


/*
|--------------------------------------------------------------------------
| AUTOMATIC LIVE TRANSACTION SYNC
|--------------------------------------------------------------------------
|
| Multiple logged-in users request bhej sakte hain,
| lekin backend same waqt sirf ONE ZKBioTime transaction sync run karega.
|--------------------------------------------------------------------------
*/

router.post(
  "/transactions/live-sync",

  requirePermission(
    "biometric.sync"
  ),

  syncLiveTransactions
);


/*
|--------------------------------------------------------------------------
| DEVICES
|--------------------------------------------------------------------------
*/

router.get(
  "/devices",

  requireAnyPermission(
    "devices.view",
    "devices.manage",
    "attendance.view"
  ),

  devices
);


/*
|--------------------------------------------------------------------------
| DEVICE MANAGEMENT
|--------------------------------------------------------------------------
|
| Read operations preserve the existing Device Status visibility rule.
| Every command that changes a ZKBioTime terminal or biometric state is
| restricted to devices.manage. Action routes are declared before /:id so
| Express never interprets "actions" as a device id.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/devices/employees/search",

  requirePermission(
    "devices.manage"
  ),

  searchDeviceEmployees
);

router.post(
  "/devices/actions/clear-command",

  requirePermission(
    "devices.manage"
  ),

  clearDeviceCommands
);

router.post(
  "/devices/actions/clear-capture",

  requirePermission(
    "devices.manage"
  ),

  clearDeviceCapture
);

router.post(
  "/devices/actions/clear-all",

  requirePermission(
    "devices.manage"
  ),

  clearDeviceAll
);

router.post(
  "/devices/actions/upload-all",

  requirePermission(
    "devices.manage"
  ),

  uploadDeviceAll
);

router.post(
  "/devices/actions/upload-transactions",

  requirePermission(
    "devices.manage"
  ),

  uploadDeviceTransactions
);

router.post(
  "/devices/actions/reboot",

  requirePermission(
    "devices.manage"
  ),

  rebootDevices
);

router.post(
  "/devices/actions/enroll-remotely",

  requirePermission(
    "devices.manage"
  ),

  enrollDeviceRemotely
);

router.post(
  "/devices/actions/resync-employees",

  requirePermission(
    "devices.manage"
  ),

  resyncEmployeesToDevice
);

router.post(
  "/devices/actions/delete-biometric-templates",

  requirePermission(
    "devices.manage"
  ),

  deleteBiometricTemplates
);

router.post(
  "/devices/:id/actions/enroll-remotely",

  requirePermission(
    "devices.manage"
  ),

  enrollDeviceRemotely
);

router.post(
  "/devices",

  requirePermission(
    "devices.manage"
  ),

  createDevice
);

router.get(
  "/devices/:id",

  requireAnyPermission(
    "devices.view",
    "devices.manage",
    "attendance.view"
  ),

  deviceDetails
);

router.put(
  "/devices/:id",

  requirePermission(
    "devices.manage"
  ),

  updateDevice
);

router.delete(
  "/devices/:id",

  requirePermission(
    "devices.manage"
  ),

  deleteDevice
);


module.exports =
  router;