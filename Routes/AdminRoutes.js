const express = require("express");
const router = express.Router();
const { adminLogin } = require("../Controller/AdminController");
const AdminMiddleware= require("../Middleware/AdminMiddleware")
const authMiddleware = require("../Middleware/AuthMiddleware");
const { GetDashboardStates, GetRevenueUpdates, GetYearlyBreakup, GetMonthlyEarning, GetRecentTransactions, GetProductPerformance, GetAdminNotifications, MarkAdminNotificationAsRead } = require("../Controller/AdminDashboardController");


router.post("/login", adminLogin);
router.get("/dashboard", authMiddleware, AdminMiddleware, GetDashboardStates);
router.get("/revenue-updates", authMiddleware, AdminMiddleware, GetRevenueUpdates);
router.get("/yearly-breakup", authMiddleware, AdminMiddleware, GetYearlyBreakup);
router.get("/monthly-earning", authMiddleware, AdminMiddleware, GetMonthlyEarning);
router.get("/recent-transactions", authMiddleware, AdminMiddleware, GetRecentTransactions);
router.get("/product-performance", authMiddleware, AdminMiddleware, GetProductPerformance);
router.get("/notification", authMiddleware, AdminMiddleware, GetAdminNotifications);
router.post("/notification/:id/read",authMiddleware,AdminMiddleware, MarkAdminNotificationAsRead);

module.exports = router;