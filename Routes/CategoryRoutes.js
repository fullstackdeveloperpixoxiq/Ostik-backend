const express= require("express");
const { CreateCategory, GetCategories, GetCategory, DeleteCategory, UpdateCategory, GetMainCategories } = require("../Controller/CategoryController");
const upload= require("../Middleware/Upload");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const memoryCache = require("../Utils/memoryCache");
const router= express.Router();

// Any category write clears the cached category list, both before the write
// runs and once the response is sent, so the next read is always fresh.
router.use((req, res, next) => {
    if (req.method !== "GET") {
        memoryCache.invalidate("category:");
        res.on("finish", () => memoryCache.invalidate("category:"));
    }
    next();
});


router.post("/admin",authMiddleware,AdminMiddleware,upload.single("image"),CreateCategory);
router.get("/", GetCategories);
router.get("/main", GetMainCategories);
router.get("/:id", GetCategory );
router.put("/admin/:id", authMiddleware,AdminMiddleware,upload.single("image"), UpdateCategory );
router.delete("/admin/:id", DeleteCategory );


module.exports= router;