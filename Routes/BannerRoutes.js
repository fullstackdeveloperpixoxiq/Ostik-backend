const express = require("express");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const upload= require("../Middleware/Upload")
const { GetAllBanners, GetActiveBanners, CreateBanner, UpdateBanner, DeleteBanner } = require("../Controller/BannerController");
const router = express.Router();

const bannerUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "mobileImage", maxCount: 1 },
]);


router.get("/", GetActiveBanners);

//admin
router.get("/admin", authMiddleware,AdminMiddleware, GetAllBanners );
router.post("/admin", authMiddleware, AdminMiddleware, bannerUpload, CreateBanner);
router.put("/admin/:id", authMiddleware,AdminMiddleware, bannerUpload, UpdateBanner);
router.delete("/admin/:id", authMiddleware,AdminMiddleware, DeleteBanner);



module.exports = router;