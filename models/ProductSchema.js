const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    images: {
      type: [String],
      default: [],
    },

    specs: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ratingAverage: {
      type: Number,
      default: 0,
    },

    ratingCount: {
      type: Number,
      default: 0,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },

    isNewArrival: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: [
        "active",
        "inactive",
        "pending",
        "approved",
        "rejected",
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);


// Indexes for storefront read paths (built automatically on startup).
// category listing, newest first
productSchema.index({ category: 1, createdAt: -1 });
// full listing / latest products, newest first
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);