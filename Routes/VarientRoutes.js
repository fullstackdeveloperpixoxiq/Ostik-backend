const express = require("express");
const {CreateVariant,UpdateVariant,DeleteVariant,GetAllVariants, GetProductVariants, GetSingleVariant,} = require("../Controller/VariantController");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const { GetProducts, GetProduct } = require("../Controller/ProductController");
const upload = require("../Middleware/Upload");

const router = express.Router();


//admin side
router.post("/admin",authMiddleware,AdminMiddleware,upload.array("images",5),CreateVariant);
router.get("/admin",authMiddleware,AdminMiddleware,GetAllVariants);
router.put("/admin/:id",authMiddleware,AdminMiddleware, upload.array("images",5),UpdateVariant);
router.delete("/admin/:id",authMiddleware,AdminMiddleware,DeleteVariant);


//user side
router.get("/product/:productId",GetProductVariants);
router.get("/:id",GetSingleVariant);



module.exports = router;