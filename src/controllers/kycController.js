const kycService = require("../services/kycService");

async function submitKyc(req, res, next) {
  try {
    const result = await kycService.submitKyc(req.customerId, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitKyc };
