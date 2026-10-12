
const mongoose = require("mongoose");

const shippingSettingsSchema = new mongoose.Schema(
  {
    freeDeliveryEnabled: {
      type: Boolean,
      default: true,
    },

    freeDeliveryThreshold: {
      type: Number,
      default: 100000,
      min: 0,
    },

    standardShippingFee: {
      type: Number,
      default: 40,
      min: 0,
    },

    availableCarriers: {
      type: [String],
      default: [
        "India Post",
        "DTDC",
        "Blue Dart",
        "Delhivery",
        "XpressBees",
        "Ecom Express",
        "Ekart Logistics",
        "Professional Couriers",
      ],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "ShippingSettings",
  shippingSettingsSchema
);