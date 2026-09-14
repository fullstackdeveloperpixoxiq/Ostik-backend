const mongoose = require("mongoose");

const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: {
    type: String,
    required: true,
  },

  rates: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("ExchangeRate", exchangeRateSchema);