const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const kycRoutes = require("./routes/kyc.routes");
const accountRoutes = require("./routes/account.routes");
const bankingRoutes = require("./routes/banking.routes");
const transactionRoutes = require("./routes/transaction.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Digital banking backend is alive." });
});

app.use("/api/auth", authRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/banking", bankingRoutes);
app.use("/api/transactions", transactionRoutes);

// Error handler must be LAST — after all routes are registered
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Something went wrong.",
  });
});

module.exports = app;