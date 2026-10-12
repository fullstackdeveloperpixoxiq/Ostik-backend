
const mongoose = require("mongoose");

const promoCarouselSchema = new mongoose.Schema(
  {
    isVisible: {
      type: Boolean,
      default: true,
    },

    messages: {
      type: [
        {
          text: {
            type: String,
            required: true,
            trim: true,
          },

          isActive: {
            type: Boolean,
            default: true,
          },
        },
      ],

      default: [
        {
          text: "Free shipping on orders above ₹100000",
          isActive: true,
        },
        {
          text: "Secure Payments",
          isActive: true,
        },
        {
          text: "Fast Delivery Across India",
          isActive: true,
        },
      ],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PromoCarousel",
  promoCarouselSchema
);