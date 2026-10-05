const pool = require("../config/db");
const nibss = require("../integrations/nibssClient");

/**
 * Generates a mock 10-digit account number locally, in case Nibss's response
 * doesn't include one (useful fallback given their /api/account/create
 * endpoint has been unreliable in testing — see README).
 */
function generateFallbackAccountNumber() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

/**
 * MySQL returns DATE columns as JS Date objects, which serialize to a full
 * ISO timestamp (e.g. "2002-04-27T00:00:00.000Z") when sent in a JSON request.
 * Nibss expects the exact plain string it was originally given ("2002-04-27"),
 * so we re-format it here before sending it back for account creation.
 */
function formatDob(dob) {
  if (dob instanceof Date) {
    return dob.toISOString().split("T")[0];
  }
  return String(dob).split("T")[0]; // already a string — just strip any time part
}

async function createAccount(customerId) {
  const [rows] = await pool.query("SELECT * FROM customers WHERE id = ?", [customerId]);
  const customer = rows[0];
  if (!customer) {
    const err = new Error("Customer not found.");
    err.statusCode = 404;
    throw err;
  }

  // Rule: account creation only allowed after successful KYC verification
  if (!customer.kyc_verified) {
    const err = new Error("Customer is not KYC-verified — cannot create account.");
    err.statusCode = 403;
    throw err;
  }

  // Rule: maximum of 1 account per customer (also enforced by the UNIQUE constraint on customer_id)
  const [existing] = await pool.query("SELECT id FROM accounts WHERE customer_id = ?", [customerId]);
  if (existing.length > 0) {
    const err = new Error("Customer already has an account.");
    err.statusCode = 409;
    throw err;
  }

  // Try Nibss's real account creation first — this is the correct integration path.
  // KNOWN ISSUE: as of testing (confirmed on multiple dates), Nibss's /api/account/create
  // reliably fails (500 or timeout) on this shared sandbox, even with a verified KYC
  // record and a payload matching their documented schema exactly. See README for the
  // full evidence trail. Rather than blocking account creation entirely because of a
  // third-party sandbox bug, we fall back to creating the account locally — still
  // enforcing every rule the assignment requires (1 per customer, ₦15,000 opening
  // balance) — so the rest of the system (transfers, balance, history) stays testable.
  let nibssResult = null;
  let nibssFailureReason = null;
  try {
    const { data } = await nibss.createAccount({
      kycType: customer.kyc_type,
      kycID: customer.kyc_id,
      dob: formatDob(customer.dob),
    });
    nibssResult = data;
  } catch (err) {
    nibssFailureReason = err.response?.data?.message || err.message;
    console.warn(
      `[accountService] Nibss account/create failed, falling back to local account creation: ${nibssFailureReason}`
    );
  }

  // TODO: adjust these field names once we see a real successful response from Nibss
  const accountNumber =
    nibssResult?.accountNumber || nibssResult?.account?.accountNumber || generateFallbackAccountNumber();
  const balance =
    nibssResult?.balance ?? nibssResult?.account?.balance ?? Number(process.env.ACCOUNT_OPENING_BALANCE);

  const [result] = await pool.query(
    "INSERT INTO accounts (customer_id, account_number, balance) VALUES (?, ?, ?)",
    [customerId, accountNumber, balance]
  );

  return {
    id: result.insertId,
    customerId,
    accountNumber,
    balance,
    currency: "NGN",
    nibssAccountCreated: nibssResult !== null,
    ...(nibssFailureReason && { note: `Created locally — Nibss account creation failed: ${nibssFailureReason}` }),
  };
}

async function getAccountByCustomer(customerId) {
  const [rows] = await pool.query("SELECT * FROM accounts WHERE customer_id = ?", [customerId]);
  const account = rows[0];
  if (!account) {
    const err = new Error("No account found for this customer.");
    err.statusCode = 404;
    throw err;
  }
  return account;
}

module.exports = { createAccount, getAccountByCustomer };