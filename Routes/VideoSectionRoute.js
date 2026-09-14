const express = require("express");
const router = express.Router();
const {createVideoSection,getVideoSection,updateVideoSection,deleteVideoSection,} = require("../Controller/VideoSectionController");
const upload = require("../Middleware/Upload");



router.post("/", upload.single("video"), createVideoSection);
router.get("/", getVideoSection);
router.put("/", upload.single("video"), updateVideoSection);
router.delete("/", deleteVideoSection);




module.exports = router;

