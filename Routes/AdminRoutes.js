const express = require("express");
const router = express.Router();
const { adminLogin } = require("../Controller/AdminController");


router.post("/login", adminLogin);

module.exports = router;