const express= require("express");
const { CreateContactMessage, GetContactMessages, UpdateContactStatus, GetSingleContactMessage, DeleteContactMessage, ReplyToContactMessage } = require("../Controller/ContactController");
const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const router= express.Router();

//user
router.post("/", CreateContactMessage)

//admin
router.get("/admin", authMiddleware, AdminMiddleware, GetContactMessages)
router.get("/admin/:id", authMiddleware, AdminMiddleware, GetSingleContactMessage)
router.put("/admin/:id/status", authMiddleware, AdminMiddleware,UpdateContactStatus)
router.post("/admin/:id/reply", authMiddleware, AdminMiddleware,ReplyToContactMessage)
router.delete("/admin/:id", authMiddleware, AdminMiddleware, DeleteContactMessage)


module.exports= router