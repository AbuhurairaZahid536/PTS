const fs =
  require("fs");

const path =
  require("path");

const multer =
  require("multer");

/*
|--------------------------------------------------------------------------
| DIRECTORY
|--------------------------------------------------------------------------
*/

const uploadDirectory =
  path.join(
    process.cwd(),
    "uploads",
    "profiles"
  );

if (
  !fs.existsSync(
    uploadDirectory
  )
) {
  fs.mkdirSync(
    uploadDirectory,
    {
      recursive: true,
    }
  );
}

/*
|--------------------------------------------------------------------------
| STORAGE
|--------------------------------------------------------------------------
*/

const storage =
  multer.diskStorage({
    destination:
      (
        req,
        file,
        callback
      ) => {
        callback(
          null,
          uploadDirectory
        );
      },

    filename:
      (
        req,
        file,
        callback
      ) => {
        const subjectType =
          String(
            req.params.subjectType ||
              "person"
          )
            .trim()
            .toLowerCase();

        const subjectId =
          String(
            req.params.id ||
              Date.now()
          )
            .trim()
            .replace(
              /[^a-zA-Z0-9_-]/g,
              ""
            );

        const extension =
          path
            .extname(
              file.originalname ||
                ""
            )
            .toLowerCase() ||
          ".jpg";

        const filename =
          `${subjectType}-${subjectId}-${Date.now()}${extension}`;

        callback(
          null,
          filename
        );
      },
  });

/*
|--------------------------------------------------------------------------
| FILE FILTER
|--------------------------------------------------------------------------
*/

function fileFilter(
  req,
  file,
  callback
) {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (
    !allowedMimeTypes.includes(
      file.mimetype
    )
  ) {
    return callback(
      new Error(
        "Only JPG, JPEG, PNG or WEBP profile photos are allowed."
      )
    );
  }

  return callback(
    null,
    true
  );
}

/*
|--------------------------------------------------------------------------
| MULTER
|--------------------------------------------------------------------------
*/

const profilePhotoUpload =
  multer({
    storage,

    limits: {
      fileSize:
        5 *
        1024 *
        1024,
    },

    fileFilter,
  });

module.exports = {
  profilePhotoUpload,
  uploadDirectory,
};