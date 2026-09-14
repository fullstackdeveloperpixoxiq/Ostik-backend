const express = require("express");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const upload= require("../Middleware/Upload")
const { GetAllBanners, GetActiveBanners, CreateBanner, UpdateBanner, DeleteBanner } = require("../Controller/BannerController");
const router = express.Router();


router.get("/", GetActiveBanners);

//admin
router.get("/admin", authMiddleware,AdminMiddleware, GetAllBanners );
router.post("/admin", authMiddleware, AdminMiddleware, upload.single("image"), CreateBanner);
router.put("/admin/:id", authMiddleware,AdminMiddleware, upload.single("image"), UpdateBanner);
router.delete("/admin/:id", authMiddleware,AdminMiddleware, DeleteBanner);



module.exports = router;