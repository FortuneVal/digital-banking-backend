const accountService = require("../services/accountService");

async function create(req, res, next) {
  try {
    const account = await accountService.createAccount(req.customerId);
    res.status(201).json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
}

async function getMine(req, res, next) {
  try {
    const account = await accountService.getAccountByCustomer(req.customerId);
    res.status(200).json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getMine };
