const fs =
  require("fs");

const path =
  require("path");

const {
  uploadDirectory,
} = require(
  "../middleware/publicSiteUpload"
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
  getPublicSiteContent,
  savePublicSiteContent,

  getPublicSiteMedia,
  getPublicSiteMediaById,

  createPublicSiteMedia,
  updatePublicSiteMedia,
  deletePublicSiteMediaRecord,
} = require(
  "../models/publicSite.model"
);


/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const MAX_IMAGE_UPLOAD_BYTES =
  2 *
  1024 *
  1024;


const MEDIA_CATEGORIES =
  new Set([
    "BRAND",
    "HERO",
    "ABOUT",
    "PRINCIPAL",
    "LEADERSHIP",
    "FACILITY",
    "GALLERY",
    "TENDER",
    "VIDEO",
    "OTHER",
  ]);


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeCategory(
  value
) {
  const category =
    String(
      value ||
      "GALLERY"
    )
      .trim()
      .toUpperCase();

  return MEDIA_CATEGORIES.has(
    category
  )
    ? category
    : "OTHER";
}


function normalizeText(
  value,
  maxLength = 1000
) {
  return String(
    value ||
    ""
  )
    .trim()
    .slice(
      0,
      maxLength
    );
}


function parseBoolean(
  value,
  fallback = true
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(
      value
    ).toLowerCase() ===
      "true"
  ) {
    return true;
  }

  return false;
}


function deleteFile(
  filePath
) {
  try {
    if (!filePath) {
      return;
    }

    const filename =
      path.basename(
        filePath
      );

    const absolutePath =
      path.join(
        uploadDirectory,
        filename
      );

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
      "Public site media delete error:",
      error.message
    );
  }
}


function publicMediaRow(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id:
      row.id,

    media_type:
      row.media_type,

    category:
      row.category,

    title:
      row.title,

    caption:
      row.caption,

    mime_type:
      row.mime_type,

    file_size:
      row.file_size,

    sort_order:
      row.sort_order,

    is_active:
      Boolean(
        row.is_active
      ),

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,

    url:
      `/public-site/media/${path.basename(
        row.file_path
      )}`,
  };
}


/*
|--------------------------------------------------------------------------
| CENTRAL AUDIT
|--------------------------------------------------------------------------
*/

async function writeAudit({
  req,

  action,

  recordId,

  description,

  oldData = null,

  newData = null,
}) {
  try {
    await logRequestAudit(
      req,
      {
        action,

        module:
          "PUBLIC_SITE",

        recordId:
          recordId !==
            null &&
          recordId !==
            undefined
            ? String(
                recordId
              )
            : null,

        description,

        oldData,

        newData,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Public site audit error:",
      error.message
    );
  }
}


/*
|--------------------------------------------------------------------------
| PUBLIC SITE IMAGE PROFILE
|--------------------------------------------------------------------------
*/

function getPublicImageProfile(
  category
) {
  const normalized =
    normalizeCategory(
      category
    );


  if (
    normalized ===
    "HERO"
  ) {
    return {
      maxWidth:
        1920,

      maxHeight:
        1080,

      targetBytes:
        800 *
        1024,

      startQuality:
        84,

      prefix:
        "hero",
    };
  }


  if (
    normalized ===
    "BRAND"
  ) {
    return {
      maxWidth:
        800,

      maxHeight:
        800,

      targetBytes:
        250 *
        1024,

      startQuality:
        84,

      prefix:
        "brand",
    };
  }


  if (
    [
      "PRINCIPAL",
      "LEADERSHIP",
    ].includes(
      normalized
    )
  ) {
    return {
      maxWidth:
        900,

      maxHeight:
        1200,

      targetBytes:
        350 *
        1024,

      startQuality:
        82,

      prefix:
        normalized.toLowerCase(),
    };
  }


  // Tender notices are text-heavy scanned advertisements; preserve readability.
  if (normalized === "TENDER") {
    return {
      maxWidth: 2600,
      maxHeight: 3600,
      targetBytes: 2500 * 1024,
      startQuality: 90,
      minQuality: 76,
      prefix: "tender",
    };
  }

  return {
    maxWidth:
      1600,

    maxHeight:
      1200,

    targetBytes:
      600 *
      1024,

    startQuality:
      82,

    prefix:
      normalized.toLowerCase(),
  };
}


/*
|--------------------------------------------------------------------------
| OPTIMIZE REQUEST IMAGE
|--------------------------------------------------------------------------
*/

async function optimizePublicRequestImage(
  file,
  category
) {
  if (!file) {
    return null;
  }


  if (
    !isSupportedImageMime(
      file.mimetype
    )
  ) {
    return file;
  }


  /*
  |--------------------------------------------------------------------------
  | 2 MB ORIGINAL IMAGE LIMIT
  |--------------------------------------------------------------------------
  */

  if (
    Number(
      file.size ||
      0
    ) >
    (normalizeCategory(category) === "TENDER" ? 8 * 1024 * 1024 : MAX_IMAGE_UPLOAD_BYTES)
  ) {
    await safeUnlink(
      file.path
    );

    const error =
      new Error(
        normalizeCategory(category) === "TENDER"
          ? "Tender image must be 8 MB or smaller."
          : "Image file must be 2 MB or smaller."
      );

    error.status =
      400;

    throw error;
  }


  const profile =
    getPublicImageProfile(
      category
    );


  const optimized =
    await optimizeImageFile({
      inputPath:
        file.path,

      outputDirectory:
        uploadDirectory,

      filenamePrefix:
        profile.prefix,

      maxWidth:
        profile.maxWidth,

      maxHeight:
        profile.maxHeight,

      targetBytes:
        profile.targetBytes,

      startQuality:
        profile.startQuality,

      minQuality:
        profile.minQuality || 58,
    });


  /*
  |--------------------------------------------------------------------------
  | MAKE MULTER FILE OBJECT POINT TO FINAL WEBP
  |--------------------------------------------------------------------------
  */

  file.filename =
    optimized.filename;

  file.path =
    optimized.path;

  file.mimetype =
    optimized.mimeType;

  file.size =
    optimized.size;


  return file;
}


/*
|--------------------------------------------------------------------------
| REMOVE MEDIA REFERENCES
|--------------------------------------------------------------------------
*/

function removeMediaReferences(
  value,
  mediaId
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      (
        item
      ) =>
        removeMediaReferences(
          item,
          mediaId
        )
    );
  }


  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return value;
  }


  const output = {};


  for (
    const [
      key,
      currentValue,
    ] of Object.entries(
      value
    )
  ) {
    if (
      [
        "media_id",
        "photo_media_id",
        "logo_media_id",
        "department_logo_media_id",
        "main_media_id",
        "secondary_media_id",
        "image_media_id",
      ].includes(
        key
      ) &&
      Number(
        currentValue
      ) ===
        Number(
          mediaId
        )
    ) {
      output[key] =
        null;

      continue;
    }


    if (
      key ===
        "media_ids" &&
      Array.isArray(
        currentValue
      )
    ) {
      output[key] =
        currentValue.filter(
          (
            id
          ) =>
            Number(
              id
            ) !==
            Number(
              mediaId
            )
        );

      continue;
    }


    output[key] =
      removeMediaReferences(
        currentValue,
        mediaId
      );
  }


  return output;
}


/*
|--------------------------------------------------------------------------
| PUBLIC DATA
|--------------------------------------------------------------------------
*/

async function getPublicSite(
  req,
  res,
  next
) {
  try {
    const [
      content,
      mediaRows,
    ] =
      await Promise.all([
        getPublicSiteContent(),

        getPublicSiteMedia({
          includeInactive:
            false,
        }),
      ]);

    
    res.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=300"
    );


    // Do not expose tender drafts or their media URLs via the public API.
    const publishedTenders = (Array.isArray(content.tenders) ? content.tenders : [])
      .filter((item) => item && item.is_active === true && String(item.title || "").trim());
    const publishedMediaIds = new Set(
      publishedTenders.map((item) => Number(item.image_media_id)).filter(Boolean)
    );
    const publicContent = {
      ...content,
      news_updates: (Array.isArray(content.news_updates) ? content.news_updates : [])
        .filter((item) => typeof item === "string" ? Boolean(item.trim()) :
          item && item.is_active !== false && String(item.text || "").trim()),
      tenders: publishedTenders,
    };

    return res.json({
      success: true,
      data: {
        content: publicContent,
        media: mediaRows.filter((item) => item.category !== "TENDER" || publishedMediaIds.has(Number(item.id)))
          .map(publicMediaRow),
      },
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
| PUBLIC MEDIA FILE
|--------------------------------------------------------------------------
*/

async function getPublicMedia(
  req,
  res,
  next
) {
  try {
    const filename =
      path.basename(
        String(
          req.params.filename ||
          ""
        )
      );


    if (
      !filename ||
      filename !==
        req.params.filename ||
      !/^[a-zA-Z0-9._-]+$/.test(
        filename
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid media filename.",
        });
    }


    const absolutePath =
      path.join(
        uploadDirectory,
        filename
      );


    if (
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
            "Media file not found.",
        });
    }

    res.setHeader(
      "Cross-Origin-Resource-Policy",
      "cross-origin"
    );
    res.setHeader(
      "Cache-Control",
      "public, max-age=31536000, immutable"
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
| ADMIN DATA
|--------------------------------------------------------------------------
*/

async function getAdminPublicSite(
  req,
  res,
  next
) {
  try {
    const [
      content,
      mediaRows,
    ] =
      await Promise.all([
        getPublicSiteContent(),

        getPublicSiteMedia({
          includeInactive:
            true,
        }),
      ]);


    return res.json({
      success:
        true,

      data: {
        content,

        media:
          mediaRows.map(
            publicMediaRow
          ),
      },
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
| SAVE CONTENT
|--------------------------------------------------------------------------
*/

async function saveAdminPublicSiteContent(
  req,
  res,
  next
) {
  try {
    if (
      !req.body.content ||
      typeof req.body
        .content !==
        "object" ||
      Array.isArray(
        req.body.content
      )
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Valid public website content is required.",
        });
    }


    const oldContent =
      await getPublicSiteContent();


    const content =
      await savePublicSiteContent(
        req.body.content,

        req.user?.id ||
        null
      );


    await writeAudit({
      req,

      action:
        "UPDATE",

      recordId:
        "CONTENT",

      description:
        "Public website content updated.",

      oldData:
        oldContent,

      newData:
        content,
    });


    return res.json({
      success:
        true,

      message:
        "Public website content updated successfully.",

      data:
        content,
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
| UPLOAD MEDIA
|--------------------------------------------------------------------------
*/

async function uploadPublicSiteMedia(
  req,
  res,
  next
) {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Please select a media file.",
        });
    }


    const isImage =
      req.file.mimetype
        .startsWith(
          "image/"
        );


    const isVideo =
      req.file.mimetype
        .startsWith(
          "video/"
        );


    if (
      !isImage &&
      !isVideo
    ) {
      deleteFile(
        req.file.filename
      );

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Unsupported media type.",
        });
    }


    const category =
      normalizeCategory(
        req.body.category
      );


    /*
    |--------------------------------------------------------------------------
    | AUTO OPTIMIZE IMAGE
    |--------------------------------------------------------------------------
    */

    if (
      isImage
    ) {
      await optimizePublicRequestImage(
        req.file,
        category
      );
    }


    const row =
      await createPublicSiteMedia({
        mediaType:
          isVideo
            ? "VIDEO"
            : "IMAGE",

        category,

        title:
          normalizeText(
            req.body.title,
            200
          ) ||
          req.file.originalname,

        caption:
          normalizeText(
            req.body.caption,
            1000
          ),

        filePath:
          `/uploads/public-site/${req.file.filename}`,

        mimeType:
          req.file.mimetype,

        fileSize:
          req.file.size,

        sortOrder:
          Number(
            req.body.sort_order ||
            0
          ) ||
          0,

        isActive:
          parseBoolean(
            req.body.is_active,
            true
          ),

        userId:
          req.user?.id ||
          null,
      });


    await writeAudit({
      req,

      action:
        "MEDIA_UPLOAD",

      recordId:
        row.id,

      description:
        `Public website media "${row.title || row.id}" uploaded.`,

      newData: {
        id:
          row.id,

        category:
          row.category,

        media_type:
          row.media_type,

        file_path:
          row.file_path,

        mime_type:
          row.mime_type,

        file_size:
          row.file_size,
      },
    });


    return res
      .status(201)
      .json({
        success:
          true,

        message:
          isImage
            ? "Image uploaded and optimized successfully."
            : "Media uploaded successfully.",

        data:
          publicMediaRow(
            row
          ),
      });
  } catch (
    error
  ) {
    if (
      req.file?.path
    ) {
      await safeUnlink(
        req.file.path
      );
    }


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
| UPDATE MEDIA METADATA
|--------------------------------------------------------------------------
*/

async function editPublicSiteMedia(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        id
      ) ||
      id <
        1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid media ID.",
        });
    }


    const existing =
      await getPublicSiteMediaById(
        id
      );


    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Media not found.",
        });
    }


    const row =
      await updatePublicSiteMedia(
        id,
        {
          category:
            req.body.category !==
            undefined
              ? normalizeCategory(
                  req.body.category
                )
              : undefined,

          title:
            req.body.title !==
            undefined
              ? normalizeText(
                  req.body.title,
                  200
                )
              : undefined,

          caption:
            req.body.caption !==
            undefined
              ? normalizeText(
                  req.body.caption,
                  1000
                )
              : undefined,

          sortOrder:
            req.body.sort_order !==
            undefined
              ? Number(
                  req.body.sort_order
                ) ||
                0
              : undefined,

          isActive:
            req.body.is_active !==
            undefined
              ? parseBoolean(
                  req.body.is_active,
                  true
                )
              : undefined,

          userId:
            req.user?.id ||
            null,
        }
      );


    await writeAudit({
      req,

      action:
        "MEDIA_UPDATE",

      recordId:
        id,

      description:
        `Public website media "${row.title || id}" updated.`,

      oldData: {
        category:
          existing.category,

        title:
          existing.title,

        caption:
          existing.caption,

        sort_order:
          existing.sort_order,

        is_active:
          Boolean(
            existing.is_active
          ),
      },

      newData: {
        category:
          row.category,

        title:
          row.title,

        caption:
          row.caption,

        sort_order:
          row.sort_order,

        is_active:
          Boolean(
            row.is_active
          ),
      },
    });


    return res.json({
      success:
        true,

      message:
        "Media updated successfully.",

      data:
        publicMediaRow(
          row
        ),
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
| REPLACE MEDIA FILE
|--------------------------------------------------------------------------
*/

async function replacePublicSiteMediaFile(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        id
      ) ||
      id <
        1
    ) {
      if (
        req.file?.path
      ) {
        await safeUnlink(
          req.file.path
        );
      }

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid media ID.",
        });
    }


    if (!req.file) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Please select the replacement file.",
        });
    }


    const existing =
      await getPublicSiteMediaById(
        id
      );


    if (!existing) {
      await safeUnlink(
        req.file.path
      );

      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Media not found.",
        });
    }


    const isVideo =
      req.file.mimetype
        .startsWith(
          "video/"
        );


    const isImage =
      req.file.mimetype
        .startsWith(
          "image/"
        );


    if (
      !isVideo &&
      !isImage
    ) {
      await safeUnlink(
        req.file.path
      );

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Unsupported media type.",
        });
    }


    if (
      isImage
    ) {
      await optimizePublicRequestImage(
        req.file,

        existing.category
      );
    }


    const row =
      await updatePublicSiteMedia(
        id,
        {
          filePath:
            `/uploads/public-site/${req.file.filename}`,

          mimeType:
            req.file.mimetype,

          fileSize:
            req.file.size,

          mediaType:
            isVideo
              ? "VIDEO"
              : "IMAGE",

          userId:
            req.user?.id ||
            null,
        }
      );


    deleteFile(
      existing.file_path
    );


    await writeAudit({
      req,

      action:
        "MEDIA_REPLACE",

      recordId:
        id,

      description:
        `Public website media "${row.title || id}" file replaced.`,

      oldData: {
        media_type:
          existing.media_type,

        file_path:
          existing.file_path,

        mime_type:
          existing.mime_type,

        file_size:
          existing.file_size,
      },

      newData: {
        media_type:
          row.media_type,

        file_path:
          row.file_path,

        mime_type:
          row.mime_type,

        file_size:
          row.file_size,
      },
    });


    return res.json({
      success:
        true,

      message:
        isImage
          ? "Image replaced and optimized successfully."
          : "Media file replaced successfully.",

      data:
        publicMediaRow(
          row
        ),
    });
  } catch (
    error
  ) {
    if (
      req.file?.path
    ) {
      await safeUnlink(
        req.file.path
      );
    }


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
| DELETE MEDIA
|--------------------------------------------------------------------------
*/

async function removePublicSiteMedia(
  req,
  res,
  next
) {
  try {
    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        id
      ) ||
      id <
        1
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid media ID.",
        });
    }


    const existing =
      await getPublicSiteMediaById(
        id
      );


    if (!existing) {
      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "Media not found.",
        });
    }


    const content =
      await getPublicSiteContent();


    const cleanedContent =
      removeMediaReferences(
        content,
        id
      );


    await savePublicSiteContent(
      cleanedContent,

      req.user?.id ||
      null
    );


    await deletePublicSiteMediaRecord(
      id
    );


    deleteFile(
      existing.file_path
    );


    await writeAudit({
      req,

      action:
        "MEDIA_DELETE",

      recordId:
        id,

      description:
        `Public website media "${existing.title || id}" deleted.`,

      oldData: {
        id:
          existing.id,

        media_type:
          existing.media_type,

        category:
          existing.category,

        title:
          existing.title,

        caption:
          existing.caption,

        file_path:
          existing.file_path,

        mime_type:
          existing.mime_type,

        file_size:
          existing.file_size,

        sort_order:
          existing.sort_order,

        is_active:
          Boolean(
            existing.is_active
          ),
      },

      newData:
        null,
    });


    return res.json({
      success:
        true,

      message:
        "Media deleted successfully.",
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
  getPublicSite,
  getPublicMedia,

  getAdminPublicSite,
  saveAdminPublicSiteContent,

  uploadPublicSiteMedia,
  editPublicSiteMedia,
  replacePublicSiteMediaFile,
  removePublicSiteMedia,
};