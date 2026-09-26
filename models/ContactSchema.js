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
      trim: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["unread", "read", "replied"],
      default: "unread"
    },

    //admin replies
    replies: [
      {
        message: {
          type: String,
          required: true,
        },

        repliedAt: {
          type: Date,
          default: Date.now,
        },

        repliedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "ContactMesage", ContactSchema);