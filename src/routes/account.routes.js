const express = require("express");
const requireAuth = require("../middleware/auth");
const accountController = require("../controllers/accountController");

const router = express.Router();

router.post("/", requireAuth, accountController.create);
router.get("/me", requireAuth, accountController.getMine);

module.exports = router;
