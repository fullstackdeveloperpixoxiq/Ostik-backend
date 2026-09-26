const express = require("express");
const {CreateOrder,GetMyOrders,GetSavedAddresses,GetSingleOrder,CancelOrder, UpdateOrder, GetAllOrders, GetAdminSingleOrder, AdminCancelOrder} = require("../Controller/OrderController");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const router = express.Router();


router.post("/", authMiddleware, CreateOrder);
router.get("/", authMiddleware, GetMyOrders);
router.get("/addresses", authMiddleware, GetSavedAddresses);
router.put("/:id/cancel", authMiddleware, CancelOrder);


//admin side
router.get("/admin", authMiddleware, AdminMiddleware, GetAllOrders)
router.get("/admin/:id", authMiddleware, AdminMiddleware, GetAdminSingleOrder)
router.get("/:id", authMiddleware, GetSingleOrder);
router.put("/admin/:id", authMiddleware, AdminMiddleware, UpdateOrder);
router.put("/admin/:id/cancel",authMiddleware,AdminMiddleware,AdminCancelOrder);


module.exports = router;
