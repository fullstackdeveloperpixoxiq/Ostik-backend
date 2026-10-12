
const ShippingSettings = require("../models/ShippingSettingSchema");
const PromoCarousel = require("../models/CarouselSchema");

// Get or create shipping settings
const getShippingSettings = async (req, res) => {
  try {
    let settings = await ShippingSettings.findOne();

    if (!settings) {
      settings = await ShippingSettings.create({});
    }

    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Get shipping settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipping settings",
    });
  }
};

// Update shipping settings
const updateShippingSettings = async (req, res) => {
  try {
    const {
      freeDeliveryEnabled,
      freeDeliveryThreshold,
      standardShippingFee,
      availableCarriers,
    } = req.body;

    let settings = await ShippingSettings.findOne();

    if (!settings) {
      settings = await ShippingSettings.create({});
    }

    if (freeDeliveryEnabled !== undefined) {
      settings.freeDeliveryEnabled = freeDeliveryEnabled;
    }

    if (freeDeliveryThreshold !== undefined) {
      settings.freeDeliveryThreshold = freeDeliveryThreshold;
    }

    if (standardShippingFee !== undefined) {
      settings.standardShippingFee = standardShippingFee;
    }

    if (availableCarriers !== undefined) {
      settings.availableCarriers = availableCarriers;
    }

    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Shipping settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Update shipping settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update shipping settings",
    });
  }
};

// Get or create promo carousel settings
const getPromoCarousel = async (req, res) => {
  try {
    let carousel = await PromoCarousel.findOne();

    if (!carousel) {
      carousel = await PromoCarousel.create({});
    }

    return res.status(200).json({
      success: true,
      carousel,
    });
  } catch (error) {
    console.error("Get promo carousel error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch promo carousel",
    });
  }
};

// Update promo carousel settings
const updatePromoCarousel = async (req, res) => {
  try {
    const { isVisible, messages } = req.body;

    let carousel = await PromoCarousel.findOne();

    if (!carousel) {
      carousel = await PromoCarousel.create({});
    }

    if (isVisible !== undefined) {
      carousel.isVisible = isVisible;
    }

    if (messages !== undefined) {
      carousel.messages = messages;
    }

    await carousel.save();

    return res.status(200).json({
      success: true,
      message: "Promo carousel updated successfully",
      carousel,
    });
  } catch (error) {
    console.error("Update promo carousel error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update promo carousel",
    });
  }
};

module.exports = {
  getShippingSettings,
  updateShippingSettings,
  getPromoCarousel,
  updatePromoCarousel,
};