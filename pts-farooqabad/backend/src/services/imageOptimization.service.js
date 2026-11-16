const fs =
  require("fs/promises");

const path =
  require("path");

const crypto =
  require("crypto");

const sharp =
  require("sharp");


/*
|--------------------------------------------------------------------------
| SUPPORTED IMAGE TYPES
|--------------------------------------------------------------------------
*/

const IMAGE_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function isSupportedImageMime(
  mimeType
) {
  return IMAGE_MIME_TYPES.has(
    String(
      mimeType ||
      ""
    )
      .trim()
      .toLowerCase()
  );
}


async function safeUnlink(
  filePath
) {
  try {
    if (!filePath) {
      return;
    }

    await fs.unlink(
      filePath
    );
  } catch (
    error
  ) {
    if (
      error.code !==
      "ENOENT"
    ) {
      console.error(
        "Image cleanup error:",
        error.message
      );
    }
  }
}


function makeWebpFilename(
  prefix = "image"
) {
  const cleanPrefix =
    String(
      prefix ||
      "image"
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      ) ||
    "image";

  return `${cleanPrefix}-${Date.now()}-${crypto
    .randomBytes(10)
    .toString("hex")}.webp`;
}


/*
|--------------------------------------------------------------------------
| OPTIMIZE IMAGE FILE
|--------------------------------------------------------------------------
|
| - EXIF orientation fixed automatically
| - Aspect ratio preserved
| - No enlargement
| - WEBP output
| - Adaptive quality reduction
|
|--------------------------------------------------------------------------
*/

async function optimizeImageFile({
  inputPath,

  outputDirectory,

  filenamePrefix =
    "image",

  maxWidth =
    1600,

  maxHeight =
    1200,

  targetBytes =
    600 *
    1024,

  startQuality =
    82,

  minQuality =
    58,
}) {
  if (!inputPath) {
    const error =
      new Error(
        "Uploaded image file is missing."
      );

    error.status =
      400;

    throw error;
  }


  await fs.mkdir(
    outputDirectory,
    {
      recursive:
        true,
    }
  );


  let quality =
    startQuality;

  let outputBuffer =
    null;


  /*
  |--------------------------------------------------------------------------
  | ADAPTIVE WEBP COMPRESSION
  |--------------------------------------------------------------------------
  */

  while (true) {
    outputBuffer =
      await sharp(
        inputPath
      )
        .rotate()
        .resize({
          width:
            maxWidth,

          height:
            maxHeight,

          fit:
            "inside",

          withoutEnlargement:
            true,
        })
        .webp({
          quality,

          effort:
            4,
        })
        .toBuffer();


    if (
      outputBuffer.length <=
        targetBytes ||
      quality <=
        minQuality
    ) {
      break;
    }


    quality =
      Math.max(
        minQuality,
        quality - 7
      );
  }


  const filename =
    makeWebpFilename(
      filenamePrefix
    );


  const outputPath =
    path.join(
      outputDirectory,
      filename
    );


  await fs.writeFile(
    outputPath,
    outputBuffer
  );


  /*
  |--------------------------------------------------------------------------
  | GET FINAL DIMENSIONS
  |--------------------------------------------------------------------------
  */

  const metadata =
    await sharp(
      outputBuffer
    ).metadata();


  /*
  |--------------------------------------------------------------------------
  | REMOVE ORIGINAL UPLOAD
  |--------------------------------------------------------------------------
  */

  if (
    path.resolve(
      inputPath
    ) !==
    path.resolve(
      outputPath
    )
  ) {
    await safeUnlink(
      inputPath
    );
  }


  return {
    filename,

    path:
      outputPath,

    mimeType:
      "image/webp",

    size:
      outputBuffer.length,

    width:
      metadata.width ||
      null,

    height:
      metadata.height ||
      null,

    quality,
  };
}


module.exports = {
  isSupportedImageMime,

  optimizeImageFile,

  safeUnlink,
};