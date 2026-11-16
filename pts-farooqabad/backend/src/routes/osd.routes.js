const express =
  require("express");

const multer =
  require("multer");

const {
  authenticate,
  requirePermission,
} = require("../middleware/auth");

const {
  downloadOsdTemplate,
  importOsdExcel,

  listRecords,

  addOsd,
  addShortPermission,

  editOsd,
  editShortPermission,

  cancelOsdPermission,
} = require("../controllers/osd.controller");

const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| OSD EXCEL UPLOAD
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

router.use(authenticate);



/*
|--------------------------------------------------------------------------
| OSD EXCEL TEMPLATE
|--------------------------------------------------------------------------
*/

router.get(
  "/template",
  requirePermission(
    "osd.view"
  ),
  downloadOsdTemplate
);

/*
|--------------------------------------------------------------------------
| OSD EXCEL IMPORT
|--------------------------------------------------------------------------
|
| subject_type is submitted as multipart form-data and must be TRAINEE or
| STAFF. The controller preserves the existing OSD validation and audit flow.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/import",
  requirePermission(
    "osd.create"
  ),
  upload.single(
    "file"
  ),
  importOsdExcel
);


/*
|--------------------------------------------------------------------------
| VIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  requirePermission(
    "osd.view"
  ),
  listRecords
);

/*
|--------------------------------------------------------------------------
| CREATE OSD
|--------------------------------------------------------------------------
*/

router.post(
  "/osd",
  requirePermission(
    "osd.create"
  ),
  addOsd
);

/*
|--------------------------------------------------------------------------
| CREATE SHORT PERMISSION
|--------------------------------------------------------------------------
*/

router.post(
  "/short-permission",
  requirePermission(
    "short_permission.create"
  ),
  addShortPermission
);

/*
|--------------------------------------------------------------------------
| EDIT OSD
|--------------------------------------------------------------------------
*/

router.put(
  "/osd/:subjectType/:id",
  requirePermission(
    "osd.edit"
  ),
  editOsd
);

/*
|--------------------------------------------------------------------------
| EDIT SHORT PERMISSION
|--------------------------------------------------------------------------
*/

router.put(
  "/short-permission/:subjectType/:id",
  requirePermission(
    "short_permission.edit"
  ),
  editShortPermission
);

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

router.put(
  "/:subjectType/:id/cancel",
  requirePermission(
    "osd.cancel"
  ),
  cancelOsdPermission
);

module.exports =
  router;