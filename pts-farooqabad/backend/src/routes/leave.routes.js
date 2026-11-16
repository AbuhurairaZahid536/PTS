const express =
  require("express");

const multer =
  require("multer");

const {
  authenticate,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
  listLeaves,
  getLeave,

  addNormalLeave,
  submitEmergencyLeave,

  downloadLeaveTemplate,
  importLeavesExcel,
  exportLeavesExcel,

  editLeave,

  approveLeave,
  rejectLeave,

  cancelLeaveRecord,
} = require(
  "../controllers/leave.controller"
);

const {
  searchLeaveSubjects,
} = require(
  "../controllers/leaveLookup.controller"
);


const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| EXCEL UPLOAD
|--------------------------------------------------------------------------
*/

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        10 *
        1024 *
        1024,
    },

    fileFilter:
      (
        req,
        file,
        cb
      ) => {
        const name =
          String(
            file.originalname ||
              ""
          )
            .trim()
            .toLowerCase();

        if (
          name.endsWith(
            ".xlsx"
          )
        ) {
          return cb(
            null,
            true
          );
        }

        return cb(
          new Error(
            "Only .xlsx Excel files are allowed."
          )
        );
      },
  });


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
| SHARED SUBJECT SEARCH
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Ye lookup sirf Leave module ka nahi hai.
|
| Is endpoint ko ye modules use karte hain:
|
| - Leave
| - Emergency Leave
| - OSD
| - Short Permission
| - Outdoor / Medical
| - Manual Absence
| - Training Drop
|
| Is liye leave.view ko compulsory rakhna ghalat tha.
|
| User ke paas in modules mein se kisi relevant module ka View/Create/Edit
| permission ho to subject search allow hogi.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/subjects/search",

  requireAnyPermission(
    "leave.view",
    "leave.create",
    "leave.edit",
    "leave.emergency.submit",

    "osd.view",
    "osd.create",
    "osd.edit",

    "short_permission.create",
    "short_permission.edit",

    "outdoor.view",
    "outdoor.create",
    "outdoor.edit",

    "manual_absence.view",
    "manual_absence.create",
    "manual_absence.edit",

    "training_drop.view",
    "training_drop.create",

    "duty_rest.manage",
    "weekend.manage",
    "duty_roster.manage",
    "timetable.edit"
  ),

  searchLeaveSubjects
);


/*
|--------------------------------------------------------------------------
| EXCEL TEMPLATE
|--------------------------------------------------------------------------
*/

router.get(
  "/template",

  requirePermission(
    "leave.view"
  ),

  downloadLeaveTemplate
);


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

router.get(
  "/export",

  requirePermission(
    "leave.view"
  ),

  exportLeavesExcel
);


/*
|--------------------------------------------------------------------------
| IMPORT NORMAL LEAVE
|--------------------------------------------------------------------------
|
| Controller req.params.mode read karta hai.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/import/normal",

  requirePermission(
    "leave.create"
  ),

  upload.single(
    "file"
  ),

  (
    req,
    res,
    next
  ) => {
    req.params.mode =
      "NORMAL";

    return importLeavesExcel(
      req,
      res,
      next
    );
  }
);


/*
|--------------------------------------------------------------------------
| IMPORT EMERGENCY LEAVE
|--------------------------------------------------------------------------
*/

router.post(
  "/import/emergency",

  requirePermission(
    "leave.emergency.submit"
  ),

  upload.single(
    "file"
  ),

  (
    req,
    res,
    next
  ) => {
    req.params.mode =
      "EMERGENCY";

    return importLeavesExcel(
      req,
      res,
      next
    );
  }
);


/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requirePermission(
    "leave.view"
  ),

  listLeaves
);


/*
|--------------------------------------------------------------------------
| CREATE NORMAL LEAVE
|--------------------------------------------------------------------------
*/

router.post(
  "/normal",

  requirePermission(
    "leave.create"
  ),

  addNormalLeave
);


/*
|--------------------------------------------------------------------------
| CREATE EMERGENCY LEAVE
|--------------------------------------------------------------------------
*/

router.post(
  "/emergency",

  requirePermission(
    "leave.emergency.submit"
  ),

  submitEmergencyLeave
);


/*
|--------------------------------------------------------------------------
| SINGLE
|--------------------------------------------------------------------------
*/

router.get(
  "/:subjectType/:id",

  requirePermission(
    "leave.view"
  ),

  getLeave
);


/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id",

  requirePermission(
    "leave.edit"
  ),

  editLeave
);


/*
|--------------------------------------------------------------------------
| APPROVE
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id/approve",

  requirePermission(
    "leave.approve"
  ),

  approveLeave
);


/*
|--------------------------------------------------------------------------
| REJECT
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id/reject",

  requirePermission(
    "leave.reject"
  ),

  rejectLeave
);


/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id/cancel",

  requirePermission(
    "leave.cancel"
  ),

  cancelLeaveRecord
);


module.exports =
  router;