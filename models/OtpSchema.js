const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },

  otp: {
    type: String,
    required: true,
  },

  purpose: {
    type: String,
    enum: ["emailVerification", "forgotPassword", "changeEmail"],
    required: true,
  },

  expiresAt: {
    type: Date,
    required: true,
  },

  isUsed: {
    type: Boolean,
    default: false,
  },

  registrationData: {
    name: {
        type: String,
    },
    password: {
        type: String,
    },
},
  
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("OTP", otpSchema);