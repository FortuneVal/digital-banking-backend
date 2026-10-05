const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

async function register({ fullName, email, password, phone }) {
  if (!fullName || !email || !password) {
    const err = new Error("fullName, email and password are required.");
    err.statusCode = 400;
    throw err;
  }

  const [existing] = await pool.query("SELECT id FROM customers WHERE email = ?", [email]);
  if (existing.length > 0) {
    const err = new Error("A customer with this email already exists.");
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    "INSERT INTO customers (full_name, email, password_hash, phone) VALUES (?, ?, ?, ?)",
    [fullName, email, passwordHash, phone || null]
  );

  return { id: result.insertId, fullName, email, phone: phone || null, kycVerified: false };
}

async function login({ email, password }) {
  const [rows] = await pool.query("SELECT * FROM customers WHERE email = ?", [email]);
  const customer = rows[0];

  if (!customer) {
    const err = new Error("Invalid email or password.");
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, customer.password_hash);
  if (!valid) {
    const err = new Error("Invalid email or password.");
    err.statusCode = 401;
    throw err;
  }

  const token = jwt.sign({ sub: customer.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  return {
    token,
    customer: {
      id: customer.id,
      fullName: customer.full_name,
      email: customer.email,
      kycVerified: !!customer.kyc_verified,
    },
  };
}

module.exports = { register, login };