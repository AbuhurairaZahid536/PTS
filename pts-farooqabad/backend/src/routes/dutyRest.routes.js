const express =
  require("express");

const multer =
  require("multer");

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
  cancelRecord,
  downloadDutyRestTemplate,
  importDutyRestExcel,
} = require(
  "../controllers/dutyRest.controller"
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


router.use(
  authenticate
);


/*
|--------------------------------------------------------------------------
| Compatibility note
|--------------------------------------------------------------------------
|
| New dedicated Duty Rest permissions are preferred.
| Existing Staff / Manual Absence permissions remain accepted so current
| deployed roles do not break during this portal upgrade.
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| EXCEL TEMPLATE
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Keep fixed routes before /:id so Express never treats "template" or
| "import" as a Duty Rest record id.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/template",
  requireAnyPermission(
    "duty_rest.view",
    "duty_rest.manage",
    "staff.view",
    "manual_absence.view"
  ),
  downloadDutyRestTemplate
);


/*
|--------------------------------------------------------------------------
| EXCEL IMPORT
|--------------------------------------------------------------------------
*/

router.post(
  "/import",
  requireAnyPermission(
    "duty_rest.manage",
    "staff.edit",
    "manual_absence.create"
  ),
  upload.single(
    "file"
  ),
  importDutyRestExcel
);


router.get(
  "/",
  requireAnyPermission(
    "duty_rest.view",
    "duty_rest.manage",
    "staff.view",
    "manual_absence.view"
  ),
  listRecords
);


router.get(
  "/:id",
  requireAnyPermission(
    "duty_rest.view",
    "duty_rest.manage",
    "staff.view",
    "manual_absence.view"
  ),
  getRecord
);


router.post(
  "/",
  requireAnyPermission(
    "duty_rest.manage",
    "staff.edit",
    "manual_absence.create"
  ),
  addRecord
);


router.put(
  "/:id",
  requireAnyPermission(
    "duty_rest.manage",
    "staff.edit",
    "manual_absence.edit"
  ),
  editRecord
);


router.put(
  "/:id/cancel",
  requireAnyPermission(
    "duty_rest.manage",
    "staff.edit",
    "manual_absence.cancel"
  ),
  cancelRecord
);


module.exports =
  router;
