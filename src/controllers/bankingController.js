const bankingService = require("../services/bankingService");

async function enquireName(req, res, next) {
  try {
    const { accountNumber } = req.body;
    const result = await bankingService.nameEnquiry(accountNumber);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function initiateTransfer(req, res, next) {
  try {
    const txn = await bankingService.transfer(req.customerId, req.body);
    res.status(201).json({ success: true, data: txn });
  } catch (err) {
    next(err);
  }
}

async function balance(req, res, next) {
  try {
    const result = await bankingService.getBalance(req.customerId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function transactionStatus(req, res, next) {
  try {
    const txn = await bankingService.checkTransactionStatus(req.customerId, req.params.reference);
    res.status(200).json({ success: true, data: txn });
  } catch (err) {
    next(err);
  }
}

module.exports = { enquireName, initiateTransfer, balance, transactionStatus };
