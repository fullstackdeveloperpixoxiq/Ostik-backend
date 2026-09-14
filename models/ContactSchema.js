const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
    },

    subject: {
      type: String,
      required: true
    },

    message: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["unread", "read", "replied"],
      default: "unread"
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "ContactMesage", ContactSchema);