const mongoose = require("mongoose");

const adminNotificationReadSchema =
  new mongoose.Schema(
    {
      admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      notificationId: {
        type: String,
        required: true,
      },

      readAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      timestamps: true,
    }
  );

adminNotificationReadSchema.index(
  {
    admin: 1,
    notificationId: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "AdminNotificationRead",
  adminNotificationReadSchema
);