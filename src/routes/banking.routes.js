const express = require("express");
const requireAuth = require("../middleware/auth");
const bankingController = require("../controllers/bankingController");

const router = express.Router();

router.post("/name-enquiry", requireAuth, bankingController.enquireName);
router.post("/transfer", requireAuth, bankingController.initiateTransfer);
router.get("/balance", requireAuth, bankingController.balance);
router.get("/transaction-status/:reference", requireAuth, bankingController.transactionStatus);

module.exports = router;
