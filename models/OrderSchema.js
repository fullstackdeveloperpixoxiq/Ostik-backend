const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Address snapshot at the time of order
    shippingAddress: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Product snapshots at the time of order
    items: [
      {
        // Reference to the original product
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        // Reference to the selected variant
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Variant",
          default: null,
        },

        // Snapshot data
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

        price: {
          type: Number,
          required: true,
        },

        discountPercent: {
          type: Number,
          default: 0,
        },

        finalPrice: {
          type: Number,
          required: true,
        },

        quantity: {
          type: Number,
          required: true,
          min: 1,
        },

        // Complete snapshot if you want to preserve
        // all relevant product information at order time
        snapshot: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    ],

    paymentMethod: {
      type: String,
      enum: ["cod", "razorpay"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },

    subtotal: {
      type: Number,
      required: true,
    },

    discount: {
      type: Number,
      default: 0,
    },

    shippingFee: {
      type: Number,
      default: 0,
    },

    total: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    exchangeRateUsed: {
      type: Number,
      default: 1,
    },

    orderStatus: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Returned",
        "Cancelled",
      ],
      default: "Pending",
    },

    trackingNumber: {
      type: String,
      default: "",
    },

    carrier: {
      type: String,
      default: "",
    },

    estimatedDelivery: {
      type: Date,
      default: null,
    },

    trackingHistory: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    placedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);