const express = require("express");
const { CreatePayment,VerifyPayment,GetMyPayments, GetAllPayments, GetAdminPayment } = require("../Controller/PaymentController");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const router = express.Router();



router.post("/create", authMiddleware, CreatePayment );
router.post("/verify", authMiddleware, VerifyPayment );
router.get("/my-payments", authMiddleware, GetMyPayments );

//admin
router.get("/admin/all",authMiddleware, AdminMiddleware, GetAllPayments);

router.get("/admin/:id",authMiddleware, AdminMiddleware, GetAdminPayment);



module.exports = router;