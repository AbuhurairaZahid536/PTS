const express =
  require("express");

const {
  authenticate,
  requirePermission,
} = require(
  "../middleware/auth"
);

const {
  publicSiteUpload,
} = require(
  "../middleware/publicSiteUpload"
);

const {
  getPublicSite,
  getPublicMedia,

  getAdminPublicSite,
  saveAdminPublicSiteContent,

  uploadPublicSiteMedia,
  editPublicSiteMedia,
  replacePublicSiteMediaFile,
  removePublicSiteMedia,
} = require(
  "../controllers/publicSite.controller"
);


const rateLimit = require("express-rate-limit");
const { submitSuggestion, getSuggestionNotifications, markNotificationRead } =
  require("../controllers/publicSuggestions.controller");

const suggestionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many submissions. Please try again later." },
});

const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| PUBLIC
|--------------------------------------------------------------------------
|
| Login required nahi.
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  getPublicSite
);


router.post("/suggestions", suggestionLimiter, submitSuggestion);

router.get(
  "/media/:filename",
  getPublicMedia
);


/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

router.use(
  "/admin",
  authenticate,
  requirePermission(
    "public_site.manage"
  )
);


router.get("/admin/suggestions", getSuggestionNotifications);
router.patch("/admin/suggestions/:id/read", markNotificationRead);

router.get(
  "/admin",
  getAdminPublicSite
);


router.put(
  "/admin/content",
  saveAdminPublicSiteContent
);


router.post(
  "/admin/media",

  publicSiteUpload.single(
    "file"
  ),

  uploadPublicSiteMedia
);


router.put(
  "/admin/media/:id",
  editPublicSiteMedia
);


router.post(
  "/admin/media/:id/replace",

  publicSiteUpload.single(
    "file"
  ),

  replacePublicSiteMediaFile
);


router.delete(
  "/admin/media/:id",
  removePublicSiteMedia
);


module.exports =
  router;