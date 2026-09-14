const express = require("express");

const {UpdateExchangeRate,GetExchangeRate} = require("../Controller/ExchangerateController");

const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");

const router = express.Router();


// ADMIN - CREATE / UPDATE EXCHANGE RATE
router.put("/",authMiddleware,AdminMiddleware,UpdateExchangeRate);


// USER /
router.get("/admin/:baseCurrency",GetExchangeRate);


module.exports = router;