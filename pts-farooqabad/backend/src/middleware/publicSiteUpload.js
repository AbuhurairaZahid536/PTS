const fs =
  require("fs");

const path =
  require("path");

const crypto =
  require("crypto");

const multer =
  require("multer");


const uploadDirectory =
  path.join(
    process.cwd(),
    "uploads",
    "public-site"
  );


if (
  !fs.existsSync(
    uploadDirectory
  )
) {
  fs.mkdirSync(
    uploadDirectory,
    {
      recursive:
        true,
    }
  );
}


const extensionMap = {
  "image/jpeg":
    ".jpg",

  "image/png":
    ".png",

  "image/webp":
    ".webp",

  "video/mp4":
    ".mp4",

  "video/webm":
    ".webm",
};


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
        const extension =
          extensionMap[
            file.mimetype
          ];

        const filename =
          `${Date.now()}-${crypto.randomBytes(
            12
          ).toString(
            "hex"
          )}${extension}`;

        callback(
          null,
          filename
        );
      },
  });


function fileFilter(
  req,
  file,
  callback
) {
  if (
    !extensionMap[
      file.mimetype
    ]
  ) {
    const error =
      new Error(
        "Only JPG, PNG, WEBP, MP4 and WEBM files are allowed."
      );

    error.status =
      400;

    return callback(
      error
    );
  }

  return callback(
    null,
    true
  );
}


const publicSiteUpload =
  multer({
    storage,

    fileFilter,

    limits: {
      fileSize:
        80 *
        1024 *
        1024,
    },
  });


module.exports = {
  publicSiteUpload,
  uploadDirectory,
};