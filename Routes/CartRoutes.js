const express = require("express");
const { AddToCart, GetCart, UpdateCartItem, RemoveFromCart, ClearCart } = require("../Controller/CartController");
const authMiddleware = require("../Middleware/AuthMiddleware");

const router = express.Router();



router.post("/", authMiddleware, AddToCart);
router.get("/", authMiddleware, GetCart);
router.put("/:variantId", authMiddleware, UpdateCartItem);
router.delete("/:variantId", authMiddleware, RemoveFromCart);
router.delete("/", authMiddleware, ClearCart);




module.exports = router;