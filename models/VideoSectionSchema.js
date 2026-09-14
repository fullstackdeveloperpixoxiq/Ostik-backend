const mongoose = require("mongoose");

const videoSectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    videoUrl: {
      type: String,
      required: true,
      trim: true,
    },

    buttonText: {
      type: String,
      required: true,
      trim: true,
      default: "Explore Products",
    },

    buttonLink: {
      type: String,
      required: true,
      default: "/products",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);


module.exports= mongoose.model("VideoSection", videoSectionSchema)