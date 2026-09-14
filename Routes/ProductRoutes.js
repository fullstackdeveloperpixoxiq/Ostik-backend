const express = require("express");
const { CreateProduct, GetProducts, GetProduct, UpdateProduct, DeleteProduct, GetHotSellingProducts, GetLimitedStockProducts} = require("../Controller/ProductController");
const router = express.Router();
const AdminMiddleware= require("../Middleware/AdminMiddleware");
const authMiddleware = require("../Middleware/AuthMiddleware");
const upload= require("../Middleware/Upload")



//ADMIN only
router.get("/", GetProducts );
router.get("/hot-selling", GetHotSellingProducts );
router.get("/limited-stock", GetLimitedStockProducts);
router.get("/:id", GetProduct);
router.post("/admin", authMiddleware, AdminMiddleware, upload.array("images",10), CreateProduct);
router.put("/admin/:id", authMiddleware, AdminMiddleware, upload.array("images",10), UpdateProduct);
router.delete("/admin/:id", authMiddleware, AdminMiddleware, DeleteProduct);

module.exports = router;