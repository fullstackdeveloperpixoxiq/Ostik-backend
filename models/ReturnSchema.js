const mongoose = require("mongoose");

const returnSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The specific product/catalog item from Order.items
    item: {
      orderItemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },

      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },

      variantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Variant",
        default: null,
      },

      name: {
        type: String,
        required: true,
      },

      variantName: {
        type: String,
        default: "",
      },

      sku: {
        type: String,
        default: "",
      },

      image: {
        type: String,
        default: "",
      },

      quantity: {
        type: Number,
        required: true,
        min: 1,
      },

      price: {
        type: Number,
        required: true,
      },

      finalPrice: {
        type: Number,
        required: true,
      },
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    comment: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
        "Picked Up",
        "Received",
        "Refunded",
        "Cancelled",
      ],
      default: "Pending",
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    adminComment: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Return", returnSchema);