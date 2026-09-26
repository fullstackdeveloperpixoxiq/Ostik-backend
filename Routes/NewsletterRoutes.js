const express = require("express");

const {
  subscribeNewsletter,
  GetAllNewsletterSubscribers,
  GetNewsletterSubscriber,
  ToggleNewsletterStatus,
} = require("../Controller/NewsletterController");
const authMiddleware= require("../Middleware/AuthMiddleware")
const AdminMiddleware= require("../Middleware/AdminMiddleware")

const router = express.Router();

//user
router.post("/subscribe", subscribeNewsletter);

//admin
router.get("/admin",authMiddleware,AdminMiddleware, GetAllNewsletterSubscribers);

router.get("/admin/:id",authMiddleware,AdminMiddleware, GetNewsletterSubscriber);

router.put("/admin/:id/toggle-status",authMiddleware,AdminMiddleware, ToggleNewsletterStatus);


module.exports = router;