const pool = require("../config/db");

async function getHistory(req, res, next) {
  try {
    const [accountRows] = await pool.query("SELECT * FROM accounts WHERE customer_id = ?", [
      req.customerId,
    ]);
    const account = accountRows[0];
    if (!account) {
      const err = new Error("Account not found");
      err.statusCode = 404;
      throw err;
    }

    // Privacy: scoped strictly to this customer's own account, never anyone else's
    const [transactions] = await pool.query(
      "SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC",
      [account.id]
    );

    res.status(200).json({ success: true, data: transactions });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHistory };
