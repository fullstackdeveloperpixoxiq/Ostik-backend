
const express = require("express");
const router = express.Router();

const {
  getShippingSettings,
  updateShippingSettings,
  getPromoCarousel,
  updatePromoCarousel,
} = require("../Controller/ShippingSettingsController");

// Shipping settings
router.get("/shipping", getShippingSettings);
router.put("/shipping", updateShippingSettings);

// Promo carousel settings
router.get("/promo-carousel", getPromoCarousel);
router.put("/promo-carousel", updatePromoCarousel);

module.exports = router;