const express = require("express");

const {
  subscribeNewsletter,
} = require("../Controller/NewsletterController");

const router = express.Router();

router.post("/subscribe", subscribeNewsletter);

module.exports = router;