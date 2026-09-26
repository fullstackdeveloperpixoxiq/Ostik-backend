const express = require("express");

const {
  CreateReturn,
  GetMyReturns,
  GetSingleReturn,
  CancelReturn,
  GetAllReturns,
  UpdateReturnStatus,
  GetAdminSingleReturn,
} = require("../Controller/ReturnController");

const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");

const router = express.Router();

// User
router.post("/", authMiddleware, CreateReturn);

router.get("/", authMiddleware, GetMyReturns);

// Admin
router.get("/admin/all",authMiddleware,AdminMiddleware,GetAllReturns);

router.get("/admin/:id",authMiddleware,AdminMiddleware,GetAdminSingleReturn);

router.put("/admin/:id/status",authMiddleware,AdminMiddleware,UpdateReturnStatus);

// User - single return
router.get("/:id", authMiddleware, GetSingleReturn);

router.put("/:id/cancel", authMiddleware, CancelReturn);

module.exports = router;