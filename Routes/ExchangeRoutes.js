const express = require("express");

const {
  CreateExchange,
  GetMyExchanges,
  GetSingleExchange,
  CancelExchange,
  GetAllExchanges,
  UpdateExchangeStatus,
  GetAdminSingleExchange,
} = require("../Controller/ExchangeController");

const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");

const router = express.Router();

router.post("/", authMiddleware, CreateExchange);

router.get("/", authMiddleware, GetMyExchanges);

router.get("/:id", authMiddleware, GetSingleExchange);

router.put("/:id/cancel", authMiddleware, CancelExchange);


// Admin
router.get("/admin/all",authMiddleware,AdminMiddleware,GetAllExchanges);

router.get("/admin/:id",authMiddleware,AdminMiddleware,GetAdminSingleExchange);

router.put("/admin/:id/status",authMiddleware,AdminMiddleware,UpdateExchangeStatus);

module.exports = router;