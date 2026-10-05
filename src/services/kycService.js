const pool = require("../config/db");
const nibss = require("../integrations/nibssClient");

async function submitKyc(
  customerId,
  { kycType, kycId, firstName, lastName, dob, phone },
) {
  if (!["BVN", "NIN"].includes(kycType)) {
    const err = new Error("kycType must be 'BVN' or 'NIN'.");
    err.statusCode = 400;
    throw err;
  }
  if (!kycId || !firstName || !lastName || !dob) {
    const err = new Error("kycId, firstName, lastName and dob are required.");
    err.statusCode = 400;
    throw err;
  }

  const [rows] = await pool.query("SELECT * FROM customers WHERE id = ?", [
    customerId,
  ]);
  const customer = rows[0];
  if (!customer) {
    const err = new Error("Customer not found.");
    err.statusCode = 404;
    throw err;
  }
  if (customer.kyc_verified) {
    const err = new Error("This customer is already KYC-verified.");
    err.statusCode = 409;
    throw err;
  }

  if (kycType === "BVN") {
    await nibss.insertBvn({
      bvn: kycId,
      firstName,
      lastName,
      dob,
      phone: phone || customer.phone,
    });
    await nibss.validateBvn(kycId);
  } else {
    await nibss.insertNin({ nin: kycId, firstName, lastName, dob });
    await nibss.validateNin(kycId);
  }

  await pool.query(
    "UPDATE customers SET kyc_type = ?, kyc_id = ?, dob = ?, kyc_verified = TRUE WHERE id = ?",
    [kycType, kycId, dob, customerId],
  );

  return { id: customerId, kycType, kycId, kycVerified: true };
}

module.exports = { submitKyc };
