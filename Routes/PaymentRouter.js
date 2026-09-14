const express = require("express");
const { CreatePayment,VerifyPayment,GetMyPayments } = require("../Controller/PaymentController");
const authMiddleware = require("../Middleware/AuthMiddleware");
const router = express.Router();



router.post("/create", authMiddleware, CreatePayment );
router.post("/verify", authMiddleware, VerifyPayment );
router.get("/my-payments", authMiddleware, GetMyPayments );


module.exports = router;