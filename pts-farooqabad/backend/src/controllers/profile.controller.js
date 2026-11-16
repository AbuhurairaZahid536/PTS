const fs =
  require("fs");

const path =
  require("path");

const {
  pool,
} = require(
  "../config/db"
);

const {
  logRequestAudit,
} = require(
  "../services/audit.service"
);

const {
  isSupportedImageMime,
  optimizeImageFile,
  safeUnlink,
} = require(
  "../services/imageOptimization.service"
);

const {
  getCompleteProfile,
} = require(
  "../models/profile.model"
);


/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const PROFILE_UPLOAD_DIRECTORY =
  path.join(
    process.cwd(),
    "uploads",
    "profiles"
  );


const MAX_PROFILE_UPLOAD_BYTES =
  2 *
  1024 *
  1024;


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeType(
  value
) {
  const type =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    type !==
      "TRAINEE" &&
    type !==
      "STAFF"
  ) {
    return null;
  }


  return type;
}


function getTableInfo(
  subjectType
) {
  if (
    subjectType ===
    "TRAINEE"
  ) {
    return {
      table:
        "trainees",

      label:
        "Trainee",
    };
  }


  return {
    table:
      "staff",

    label:
      "Staff",
  };
}


/*
|--------------------------------------------------------------------------
| GET ABSOLUTE PROFILE PHOTO PATH
|--------------------------------------------------------------------------
*/

function getAbsolutePhotoPath(
  photoPath
) {
  if (!photoPath) {
    return null;
  }


  const normalized =
    String(
      photoPath
    )
      .trim()
      .replace(
        /\\/g,
        "/"
      );


  if (
    !normalized.startsWith(
      "/uploads/profiles/"
    )
  ) {
    return null;
  }


  const filename =
    path.basename(
      normalized
    );


  return path.join(
    PROFILE_UPLOAD_DIRECTORY,
    filename
  );
}


/*
|--------------------------------------------------------------------------
| DELETE LOCAL PHOTO
|--------------------------------------------------------------------------
*/

function deleteLocalPhoto(
  photoPath
) {
  try {
    const absolutePath =
      getAbsolutePhotoPath(
        photoPath
      );


    if (!absolutePath) {
      return;
    }


    if (
      fs.existsSync(
        absolutePath
      )
    ) {
      fs.unlinkSync(
        absolutePath
      );
    }
  } catch (
    error
  ) {
    console.error(
      "Profile photo delete error:",
      error.message
    );
  }
}


/*
|--------------------------------------------------------------------------
| DELETE CURRENT REQUEST FILE
|--------------------------------------------------------------------------
*/

async function deleteRequestFile(
  file
) {
  if (
    file?.path
  ) {
    await safeUnlink(
      file.path
    );

    return;
  }


  if (
    file?.filename
  ) {
    await safeUnlink(
      path.join(
        PROFILE_UPLOAD_DIRECTORY,
        file.filename
      )
    );
  }
}


/*
|--------------------------------------------------------------------------
| PERSON PHOTO RECORD
|--------------------------------------------------------------------------
*/

async function getPersonPhotoRecord({
  subjectType,
  subjectId,
}) {
  const {
    table,
  } =
    getTableInfo(
      subjectType
    );


  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,
          employee_id,
          photo_path

        FROM ${table}

        WHERE
          id =
            :subjectId

          AND
          is_deleted = 0

        LIMIT 1
      `,
      {
        subjectId,
      }
    );


  return (
    rows[0] ||
    null
  );
}


/*
|--------------------------------------------------------------------------
| GET COMPLETE PROFILE
|--------------------------------------------------------------------------
*/

async function getDetailedProfile(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeType(
        req.params.subjectType
      );


    const subjectId =
      Number(
        req.params.id
      );


    if (!subjectType) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Profile type must be TRAINEE or STAFF.",
        });
    }


    if (
      !Number.isInteger(
        subjectId
      ) ||
      subjectId <
        1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid profile record ID.",
        });
    }


    const data =
      await getCompleteProfile({
        subjectType,

        subjectId,
      });


    if (!data) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            `${
              subjectType ===
              "TRAINEE"
                ? "Trainee"
                : "Staff"
            } profile not found.`,
        });
    }


    return res.json({
      success:
        true,

      data,
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| GET PROFILE PHOTO
|--------------------------------------------------------------------------
*/

async function getProfilePhoto(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeType(
        req.params.subjectType
      );


    const subjectId =
      Number(
        req.params.id
      );


    if (!subjectType) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Profile type must be TRAINEE or STAFF.",
        });
    }


    if (
      !Number.isInteger(
        subjectId
      ) ||
      subjectId <
        1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid profile record ID.",
        });
    }


    const {
      label,
    } =
      getTableInfo(
        subjectType
      );


    const person =
      await getPersonPhotoRecord({
        subjectType,

        subjectId,
      });


    if (!person) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            `${label} profile not found.`,
        });
    }


    if (
      !person.photo_path
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Profile photo not available.",
        });
    }


    const absolutePath =
      getAbsolutePhotoPath(
        person.photo_path
      );


    if (
      !absolutePath ||
      !fs.existsSync(
        absolutePath
      )
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Profile photo file not found on server.",
        });
    }


    res.setHeader(
      "Cache-Control",
      "private, max-age=300"
    );


    return res.sendFile(
      absolutePath
    );
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| UPLOAD / CHANGE PROFILE PHOTO
|--------------------------------------------------------------------------
|
| Applies to:
|
| TRAINEE
| STAFF
|
|--------------------------------------------------------------------------
*/

async function uploadProfilePhoto(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeType(
        req.params.subjectType
      );


    const subjectId =
      Number(
        req.params.id
      );


    if (!subjectType) {
      await deleteRequestFile(
        req.file
      );

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Profile type must be TRAINEE or STAFF.",
        });
    }


    if (
      !Number.isInteger(
        subjectId
      ) ||
      subjectId <
        1
    ) {
      await deleteRequestFile(
        req.file
      );

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid profile record ID.",
        });
    }


    if (!req.file) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Please select a profile photo.",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | MIME CHECK
    |--------------------------------------------------------------------------
    */

    if (
      !isSupportedImageMime(
        req.file.mimetype
      )
    ) {
      await deleteRequestFile(
        req.file
      );

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Profile photo must be JPG, PNG or WEBP.",
        });
    }


    /*
    |--------------------------------------------------------------------------
    | ORIGINAL MAXIMUM 2 MB
    |--------------------------------------------------------------------------
    */

    if (
      Number(
        req.file.size ||
        0
      ) >
      MAX_PROFILE_UPLOAD_BYTES
    ) {
      await deleteRequestFile(
        req.file
      );

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Profile photo must be 2 MB or smaller.",
        });
    }


    const {
      table,
      label,
    } =
      getTableInfo(
        subjectType
      );


    const person =
      await getPersonPhotoRecord({
        subjectType,

        subjectId,
      });


    if (!person) {
      await deleteRequestFile(
        req.file
      );

      return res
        .status(404)
        .json({
          success:
            false,

          message:
            `${label} profile not found.`,
        });
    }


    /*
    |--------------------------------------------------------------------------
    | OPTIMIZE PROFILE PHOTO
    |--------------------------------------------------------------------------
    |
    | Maximum rendered dimensions:
    |
    | 800 x 1000
    |
    | Aspect ratio is preserved.
    |
    | Target:
    |
    | ~250 KB
    |
    |--------------------------------------------------------------------------
    */

    const optimized =
      await optimizeImageFile({
        inputPath:
          req.file.path,

        outputDirectory:
          PROFILE_UPLOAD_DIRECTORY,

        filenamePrefix:
          `${subjectType.toLowerCase()}-profile-${subjectId}`,

        maxWidth:
          800,

        maxHeight:
          1000,

        targetBytes:
          250 *
          1024,

        startQuality:
          82,

        minQuality:
          58,
      });


    /*
    |--------------------------------------------------------------------------
    | UPDATE REQUEST FILE REFERENCE
    |--------------------------------------------------------------------------
    */

    req.file.filename =
      optimized.filename;

    req.file.path =
      optimized.path;

    req.file.mimetype =
      optimized.mimeType;

    req.file.size =
      optimized.size;


    const oldPhotoPath =
      person.photo_path ||
      null;


    const newPhotoPath =
      `/uploads/profiles/${optimized.filename}`;


    /*
    |--------------------------------------------------------------------------
    | DATABASE
    |--------------------------------------------------------------------------
    */

    await pool.query(
      `
        UPDATE ${table}

        SET
          photo_path =
            :photoPath

        WHERE
          id =
            :subjectId
      `,
      {
        subjectId,

        photoPath:
          newPhotoPath,
      }
    );


    /*
    |--------------------------------------------------------------------------
    | REMOVE PREVIOUS PHOTO
    |--------------------------------------------------------------------------
    */

    if (
      oldPhotoPath &&
      oldPhotoPath !==
        newPhotoPath
    ) {
      deleteLocalPhoto(
        oldPhotoPath
      );
    }


    /*
    |--------------------------------------------------------------------------
    | CENTRAL AUDIT
    |--------------------------------------------------------------------------
    */

    await logRequestAudit(
      req,
      {
        action:
          "UPDATE_PHOTO",

        module:
          subjectType,

        recordId:
          subjectId,

        description:
          `${label} ${person.employee_id} profile photo updated.`,

        oldData: {
          photo_path:
            oldPhotoPath,
        },

        newData: {
          photo_path:
            newPhotoPath,

          mime_type:
            "image/webp",

          file_size:
            optimized.size,

          width:
            optimized.width,

          height:
            optimized.height,
        },
      }
    );


    return res.json({
      success:
        true,

      message:
        "Profile photo uploaded and optimized successfully.",

      data: {
        photo_path:
          newPhotoPath,

        photo_endpoint:
          `/profiles/${subjectType}/${subjectId}/photo`,

        mime_type:
          "image/webp",

        file_size:
          optimized.size,

        width:
          optimized.width,

        height:
          optimized.height,
      },
    });
  } catch (
    error
  ) {
    await deleteRequestFile(
      req.file
    );


    if (
      error.status ===
      400
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            error.message,
        });
    }


    return next(
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| REMOVE PROFILE PHOTO
|--------------------------------------------------------------------------
*/

async function removeProfilePhoto(
  req,
  res,
  next
) {
  try {
    const subjectType =
      normalizeType(
        req.params.subjectType
      );


    const subjectId =
      Number(
        req.params.id
      );


    if (!subjectType) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Profile type must be TRAINEE or STAFF.",
        });
    }


    if (
      !Number.isInteger(
        subjectId
      ) ||
      subjectId <
        1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid profile record ID.",
        });
    }


    const {
      table,
      label,
    } =
      getTableInfo(
        subjectType
      );


    const person =
      await getPersonPhotoRecord({
        subjectType,

        subjectId,
      });


    if (!person) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            `${label} profile not found.`,
        });
    }


    const oldPhotoPath =
      person.photo_path ||
      null;


    await pool.query(
      `
        UPDATE ${table}

        SET
          photo_path =
            NULL

        WHERE
          id =
            :subjectId
      `,
      {
        subjectId,
      }
    );


    deleteLocalPhoto(
      oldPhotoPath
    );


    await logRequestAudit(
      req,
      {
        action:
          "REMOVE_PHOTO",

        module:
          subjectType,

        recordId:
          subjectId,

        description:
          `${label} ${person.employee_id} profile photo removed.`,

        oldData: {
          photo_path:
            oldPhotoPath,
        },

        newData: {
          photo_path:
            null,
        },
      }
    );


    return res.json({
      success:
        true,

      message:
        "Profile photo removed successfully.",
    });
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


module.exports = {
  getDetailedProfile,

  getProfilePhoto,

  uploadProfilePhoto,

  removeProfilePhoto,
};