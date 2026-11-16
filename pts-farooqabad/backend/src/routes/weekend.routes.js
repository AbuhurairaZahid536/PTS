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
  listWeekends,
  getWeekend,
  addWeekend,
  editWeekend,
  removeWeekend,
  downloadWeekendDetainTemplate,
  importWeekendDetainTrainees,
} = require(
  "../controllers/weekend.controller"
);

const router =
  express.Router();

const upload =
  multer({
    storage:
      multer.memoryStorage(),
    limits: {
      fileSize:
        5 * 1024 * 1024,
    },
    fileFilter:
      (req, file, cb) => {
        const name =
          String(
            file.originalname || ""
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
| VIEW WEEKENDS
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  requireAnyPermission(
    "timetable.view",
    "timetable.edit",
    "weekend.manage"
  ),
  listWeekends
);


router.get(
  "/tools/detained-template",
  requireAnyPermission(
    "weekend.manage",
    "timetable.edit"
  ),
  downloadWeekendDetainTemplate
);

router.post(
  "/tools/detained-import",
  requireAnyPermission(
    "weekend.manage",
    "timetable.edit"
  ),
  upload.single("file"),
  importWeekendDetainTrainees
);

router.get(
  "/:id",
  requireAnyPermission(
    "timetable.view",
    "timetable.edit",
    "weekend.manage"
  ),
  getWeekend
);

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  requireAnyPermission(
    "weekend.manage",
    "timetable.edit"
  ),
  addWeekend
);

/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

router.put(
  "/:id",
  requireAnyPermission(
    "weekend.manage",
    "timetable.edit"
  ),
  editWeekend
);

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

router.delete(
  "/:id",
  requireAnyPermission(
    "weekend.manage",
    "timetable.edit"
  ),
  removeWeekend
);

module.exports =
  router;