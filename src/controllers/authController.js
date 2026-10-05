const customerService = require("../services/customerService");

async function register(req, res, next) {
  try {
    const customer = await customerService.register(req.body);
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await customerService.login(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };