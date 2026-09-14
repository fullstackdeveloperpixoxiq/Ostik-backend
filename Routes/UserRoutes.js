const express= require("express");
const { RegiterUser, VerifyOTP, LoginUser, ForgotPassword, verifyForgotPasswordOTP, ResetPassword, ProtectedTest, GetProfile, AddAddress, DeleteAddress, ResendOTP, UpdateAddress, UpdateProfile } = require("../Controller/UserController");
const authMiddleware = require("../Middleware/AuthMiddleware");
const router= express.Router();
const upload= require("../Middleware/Upload")


router.post("/register", RegiterUser)
router.post("/verify-otp", VerifyOTP)
router.post("/resend-otp", ResendOTP);
router.post("/login", LoginUser)
router.post("/forgot-password", ForgotPassword)
router.post("/verify-forgot-otp", verifyForgotPasswordOTP)
router.post("/reset-password", ResetPassword)
router.get("/protected-test", authMiddleware, ProtectedTest)


router.get("/profile", authMiddleware, GetProfile)
router.put("/profile", authMiddleware, upload.single("profileImage"), UpdateProfile)
router.post("/profile", authMiddleware, AddAddress)
router.put("/profile/address/:addressId", authMiddleware, UpdateAddress)
router.delete("/profile/address/:addressId", authMiddleware, DeleteAddress)


module.exports= router;