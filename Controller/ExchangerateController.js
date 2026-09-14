const ExchangeRateSchema = require("../models/ExchangerateSchema");


// CREATE / UPDATE EXCHANGE RATE
const UpdateExchangeRate = async (req, res) => {
    try {

        const { baseCurrency, rates } = req.body;

        if (!baseCurrency || !rates) {
            return res.status(400).json({
                message: "Base currency and rates are required"
            });
        }

        const exchangeRate = await ExchangeRateSchema.findOneAndUpdate(
            { baseCurrency },
            {
                baseCurrency,
                rates,
                lastUpdated: new Date()
            },
            {
                new: true,
                upsert: true
            }
        );

        res.status(200).json({
            message: "Exchange rate updated successfully",
            exchangeRate
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// GET EXCHANGE RATES
const GetExchangeRate = async (req, res) => {
    try {

        const { baseCurrency } = req.params;

        const exchangeRate = await ExchangeRateSchema.findOne({
            baseCurrency: baseCurrency.toUpperCase()
        });

        if (!exchangeRate) {
            return res.status(404).json({
                message: "Exchange rate not found"
            });
        }

        res.status(200).json({
            message: "Exchange rate fetched successfully",
            exchangeRate
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


module.exports = {UpdateExchangeRate,GetExchangeRate};