const express = require("express");
const requireAuth = require("../middleware/auth");
const transactionController = require("../controllers/transactionController");

const router = express.Router();

router.get("/history", requireAuth, transactionController.getHistory);

module.exports = router;
