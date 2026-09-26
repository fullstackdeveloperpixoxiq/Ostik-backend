const express = require("express");
const router = express.Router();
const {createVideoSection,getVideoSection,updateVideoSection,deleteVideoSection, getAdminVideoSection,} = require("../Controller/VideoSectionController");
const upload = require("../Middleware/Upload");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");


router.get("/", getVideoSection);

//admin
router.get("/admin",authMiddleware,AdminMiddleware,getAdminVideoSection);
router.post("/admin",authMiddleware,AdminMiddleware, upload.single("video"),createVideoSection);
router.put("/admin/:id", upload.single("video"), updateVideoSection);
router.delete("/", deleteVideoSection);




module.exports = router;

