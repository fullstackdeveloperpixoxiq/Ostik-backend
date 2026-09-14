const express= require("express");
const { CreateCategory, GetCategories, GetCategory, DeleteCategory, UpdateCategory } = require("../Controller/CategoryController");
const upload= require("../Middleware/Upload");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const router= express.Router();


router.post("/admin",authMiddleware,AdminMiddleware,upload.single("image"),CreateCategory);
router.get("/", GetCategories);
router.get("/:id", GetCategory );
router.put("/admin/:id", authMiddleware,AdminMiddleware,upload.single("image"), UpdateCategory );
router.delete("/admin/:id", DeleteCategory );


module.exports= router;