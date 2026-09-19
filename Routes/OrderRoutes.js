const express = require("express");
const {CreateOrder,GetMyOrders,GetSavedAddresses,GetSingleOrder,CancelOrder, UpdateOrder} = require("../Controller/OrderController");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const router = express.Router();


router.post("/", authMiddleware, CreateOrder);
router.get("/", authMiddleware, GetMyOrders);
router.get("/addresses", authMiddleware, GetSavedAddresses);
router.get("/:id", authMiddleware, GetSingleOrder);
router.put("/:id/cancel", authMiddleware, CancelOrder);

//admin side
router.put("/admin/:id", authMiddleware, AdminMiddleware, UpdateOrder);


module.exports = router;
