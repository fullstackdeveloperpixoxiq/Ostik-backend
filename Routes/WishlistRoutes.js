const express = require("express");
const { AddToWishlist, GetWishlist, RemoveFromWishlist, ClearWishlist } = require("../Controller/WishlistController");
const authMiddleware = require("../Middleware/AuthMiddleware");

const router = express.Router();



router.post("/", authMiddleware, AddToWishlist);
router.get("/", authMiddleware, GetWishlist);
router.delete("/:productId", authMiddleware, RemoveFromWishlist);
router.delete("/", authMiddleware, ClearWishlist);



module.exports = router;