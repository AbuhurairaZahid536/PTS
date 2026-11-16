const express = require(
  "express"
);

const multer = require(
  "multer"
);

const {
  authenticate,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
  listTrainees,
  getTrainee,
  addTrainee,
  editTrainee,
  deleteTraineeRecord,
  downloadImportTemplate,
  exportTraineesExcel,
  importTraineesExcel,
} = require(
  "../controllers/trainee.controller"
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

    fileFilter: (
      req,
      file,
      callback
    ) => {
      const allowed = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ];

      if (
        !allowed.includes(
          file.mimetype
        )
      ) {
        return callback(
          new Error(
            "Only Excel .xlsx or .xls files are allowed."
          )
        );
      }

      callback(
        null,
        true
      );
    },
  });


/*
|--------------------------------------------------------------------------
| EXCEL ROUTES
|--------------------------------------------------------------------------
|
| View:
| - Download Import Template
| - Export
|
| Edit:
| - Import
|
| IMPORTANT:
| Ye /:id se pehle hone chahiye.
|--------------------------------------------------------------------------
*/

router.get(
  "/import-template",

  requireAnyPermission(
    "trainees.view",
    "trainees.edit"
  ),

  downloadImportTemplate
);


router.get(
  "/export",

  requireAnyPermission(
    "trainees.view",
    "trainees.edit"
  ),

  exportTraineesExcel
);


router.post(
  "/import",

  requirePermission(
    "trainees.edit"
  ),

  upload.single(
    "file"
  ),

  importTraineesExcel
);


/*
|--------------------------------------------------------------------------
| TRAINEE VIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/",

  requireAnyPermission(
    "trainees.view",
    "trainees.edit"
  ),

  listTrainees
);


router.get(
  "/:id",

  requireAnyPermission(
    "trainees.view",
    "trainees.edit"
  ),

  getTrainee
);


/*
|--------------------------------------------------------------------------
| TRAINEE EDIT
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  requirePermission(
    "trainees.edit"
  ),

  addTrainee
);


router.put(
  "/:id",

  requireAnyPermission(
    "trainees.edit",
    "profiles.edit"
  ),

  editTrainee
);


router.delete(
  "/:id",

  requirePermission(
    "trainees.edit"
  ),

  deleteTraineeRecord
);


module.exports =
  router;