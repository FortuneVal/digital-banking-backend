const { randomUUID } = require("crypto");
const pool = require("../config/db");
const nibss = require("../integrations/nibssClient");

function apiError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Looks up an account_number in OUR OWN accounts table (joined to the owning
 * customer). Covers every one of our bank's customers, whether or not their
 * account also exists on Nibss's side — so transfers/enquiries within our
 * own bank never depend on Nibss being up.
 */
async function findLocalAccount(accountNumber) {
  const [rows] = await pool.query(
    `SELECT accounts.*, customers.full_name
     FROM accounts
     JOIN customers ON customers.id = accounts.customer_id
     WHERE accounts.account_number = ?`,
    [accountNumber],
  );
  return rows[0] || null;
}

/** Name enquiry — check our own bank first, only ask Nibss for accounts we don't recognize. */
async function nameEnquiry(accountNumber) {
  const local = await findLocalAccount(accountNumber);
  if (local) {
    return {
      accountNumber: local.account_number,
      accountName: local.full_name,
      bankCode: process.env.BANK_CODE,
      bankName: process.env.BANK_NAME,
      source: "local",
    };
  }

  try {
    const { data } = await nibss.nameEnquiry(accountNumber);
    return { ...data, source: "nibss" };
  } catch (err) {
    const nibssMessage = err.response?.data?.message || err.message;
    throw apiError(502, `Name enquiry failed: ${nibssMessage}`);
  }
}

/**
 * Funds transfer. If the destination is one of our own accounts (checked locally
 * first), move the money directly in our own database — no Nibss round-trip needed.
 * Otherwise, it's a genuine inter-bank transfer, so we call Nibss.
 */
async function transfer(
  customerId,
  { destinationAccountNumber, amount, narration },
) {
  if (!amount || amount <= 0)
    throw apiError(400, "Amount must be greater than zero");

  const [accountRows] = await pool.query(
    "SELECT * FROM accounts WHERE customer_id = ?",
    [customerId],
  );
  const sourceAccount = accountRows[0];
  if (!sourceAccount) throw apiError(404, "Source account not found");
  if (sourceAccount.account_number === destinationAccountNumber) {
    throw apiError(400, "Cannot transfer to your own account");
  }
  if (Number(sourceAccount.balance) < amount)
    throw apiError(400, "Insufficient balance");

  const destinationLocal = await findLocalAccount(destinationAccountNumber);

  if (destinationLocal) {
    // --- Intra-bank: handle entirely in our own database ---
    const reference = randomUUID();

    await pool.query(
      `INSERT INTO transactions
         (reference, account_id, counterparty_account, amount, narration, type, category, status)
       VALUES (?, ?, ?, ?, ?, 'debit', 'transfer', 'successful')`,
      [
        reference,
        sourceAccount.id,
        destinationAccountNumber,
        amount,
        narration || null,
      ],
    );
    // Also record the credit leg on the recipient's own history
    await pool.query(
      `INSERT INTO transactions
         (reference, account_id, counterparty_account, amount, narration, type, category, status)
       VALUES (?, ?, ?, ?, ?, 'credit', 'transfer', 'successful')`,
      [
        randomUUID(),
        destinationLocal.id,
        sourceAccount.account_number,
        amount,
        narration || null,
      ],
    );

    await pool.query("UPDATE accounts SET balance = balance - ? WHERE id = ?", [
      amount,
      sourceAccount.id,
    ]);
    await pool.query("UPDATE accounts SET balance = balance + ? WHERE id = ?", [
      amount,
      destinationLocal.id,
    ]);

    const [updated] = await pool.query(
      "SELECT * FROM transactions WHERE reference = ?",
      [reference],
    );
    return updated[0];
  }

  // --- Inter-bank: destination isn't one of ours, so go through Nibss ---
  const reference = randomUUID();
  await pool.query(
    `INSERT INTO transactions
       (reference, account_id, counterparty_account, amount, narration, type, category, status)
     VALUES (?, ?, ?, ?, ?, 'debit', 'transfer', 'pending')`,
    [
      reference,
      sourceAccount.id,
      destinationAccountNumber,
      amount,
      narration || null,
    ],
  );

  try {
    const { data: result } = await nibss.transfer({
      from: sourceAccount.account_number,
      to: destinationAccountNumber,
      amount,
    });

    const success = result.status === "SUCCESSFUL" || result.success === true;
    const newStatus = success ? "successful" : "failed";

    if (success) {
      await pool.query(
        "UPDATE accounts SET balance = balance - ? WHERE id = ?",
        [amount, sourceAccount.id],
      );
    }

    await pool.query(
      "UPDATE transactions SET status = ?, nibss_response = ? WHERE reference = ?",
      [newStatus, JSON.stringify(result), reference],
    );

    const [updated] = await pool.query(
      "SELECT * FROM transactions WHERE reference = ?",
      [reference],
    );
    return updated[0];
  } catch (err) {
    const nibssMessage = err.response?.data?.message || err.message;
    await pool.query(
      "UPDATE transactions SET status = 'failed', nibss_response = ? WHERE reference = ?",
      [JSON.stringify({ error: nibssMessage }), reference],
    );
    throw apiError(502, `Transfer failed: ${nibssMessage}`);
  }
}

/** Balance check — our own database is authoritative for our own accounts. */
async function getBalance(customerId) {
  const [accountRows] = await pool.query(
    "SELECT * FROM accounts WHERE customer_id = ?",
    [customerId],
  );
  const account = accountRows[0];
  if (!account) throw apiError(404, "Account not found");
  return { accountNumber: account.account_number, balance: account.balance };
}

/** Transaction status — scoped to the caller's own account for privacy. */
async function checkTransactionStatus(customerId, reference) {
  const [accountRows] = await pool.query(
    "SELECT * FROM accounts WHERE customer_id = ?",
    [customerId],
  );
  const account = accountRows[0];
  if (!account) throw apiError(404, "Account not found");

  const [txnRows] = await pool.query(
    "SELECT * FROM transactions WHERE reference = ? AND account_id = ?",
    [reference, account.id],
  );
  const txn = txnRows[0];
  if (!txn) throw apiError(404, "Transaction not found");

  if (txn.status === "pending") {
    try {
      const { data } = await nibss.getTransactionByRef(reference);
      if (data.status) {
        await pool.query(
          "UPDATE transactions SET status = ? WHERE reference = ?",
          [data.status, reference],
        );
        txn.status = data.status;
      }
    } catch (err) {
      // If Nibss check fails, just return what we have locally
    }
  }

  return txn;
}

module.exports = { nameEnquiry, transfer, getBalance, checkTransactionStatus };
