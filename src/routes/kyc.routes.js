const express = require("express");
const requireAuth = require("../middleware/auth");
const kycController = require("../controllers/kycController");

const router = express.Router();

router.post("/submit", requireAuth, kycController.submitKyc);

module.exports = router;
