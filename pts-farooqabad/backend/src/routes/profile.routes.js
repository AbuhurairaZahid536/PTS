const express =
  require(
    "express"
  );

const {
  authenticate,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/auth"
);

const {
  getDetailedProfile,
  getProfilePhoto,

  uploadProfilePhoto,
  removeProfilePhoto,
} = require(
  "../controllers/profile.controller"
);

const {
  profilePhotoUpload,
} = require(
  "../middleware/profilePhotoUpload"
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
| PROFILE PHOTO - VIEW
|--------------------------------------------------------------------------
|
| profiles.view OR profiles.edit
|
| Edit permission wala user naturally profile/photo ko
| read bhi kar sakega.
|--------------------------------------------------------------------------
*/

router.get(
  "/:subjectType/:id/photo",

  requireAnyPermission(
    "profiles.view",
    "profiles.edit"
  ),

  getProfilePhoto
);


/*
|--------------------------------------------------------------------------
| COMPLETE PROFILE - VIEW
|--------------------------------------------------------------------------
*/

router.get(
  "/:subjectType/:id",

  requireAnyPermission(
    "profiles.view",
    "profiles.edit"
  ),

  getDetailedProfile
);


/*
|--------------------------------------------------------------------------
| PROFILE PHOTO - EDIT
|--------------------------------------------------------------------------
*/

router.post(
  "/:subjectType/:id/photo",

  requirePermission(
    "profiles.edit"
  ),

  profilePhotoUpload.single(
    "photo"
  ),

  uploadProfilePhoto
);


router.delete(
  "/:subjectType/:id/photo",

  requirePermission(
    "profiles.edit"
  ),

  removeProfilePhoto
);


module.exports =
  router;