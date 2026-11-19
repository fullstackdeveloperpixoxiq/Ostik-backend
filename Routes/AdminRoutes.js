const express = require("express");
const router = express.Router();
const { adminLogin } = require("../Controller/AdminController");
const AdminMiddleware= require("../Middleware/AdminMiddleware")
const authMiddleware = require("../Middleware/AuthMiddleware");
const { GetChatbotSettings, UpdateChatbotSettings, GetChatbotStats, GetCustomerUsageList, TestChatbot } = require("../Controller/ChatbotAdminController");
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

// AI chatbot settings ("Limits & Privacy") - one global monthly limit for every customer
router.get("/chatbot/settings", authMiddleware, AdminMiddleware, GetChatbotSettings);
router.put("/chatbot/settings", authMiddleware, AdminMiddleware, UpdateChatbotSettings);
router.get("/chatbot/stats", authMiddleware, AdminMiddleware, GetChatbotStats);
router.get("/chatbot/usage", authMiddleware, AdminMiddleware, GetCustomerUsageList);
router.post("/chatbot/test", authMiddleware, AdminMiddleware, TestChatbot);

module.exports = router;