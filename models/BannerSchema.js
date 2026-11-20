const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    subtitle: {
      type: String,
      default: "",
      trim: true,
    },

    image: {
      type: String,
      required: true,
    },

    // Optional artwork for phones (<=480px). Falls back to `image` when empty.
    mobileImage: {
      type: String,
      default: "",
    },

    // CSS object-position used when the image is cropped to fit the banner,
    // e.g. "center", "left center", "70% 50%".
    imagePosition: {
      type: String,
      default: "center",
      trim: true,
    },

    mobileImagePosition: {
      type: String,
      default: "center",
      trim: true,
    },

    buttonText: {
      type: String,
      default: "Shop Now",
      trim: true,
    },

    buttonLink: {
      type: String,
      default: "/products",
      trim: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    displayOrder: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Banner", bannerSchema);