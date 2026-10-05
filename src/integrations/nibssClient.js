require("dotenv").config();
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
const axios = require("axios");

const client = axios.create({
  baseURL: process.env.NIBSS_BASE_URL,
  timeout: 15000,
});

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const { data } = await client.post("/api/auth/token", {
    apiKey: process.env.NIBSS_API_KEY,
    apiSecret: process.env.NIBSS_API_SECRET,
  });

  const token = data.token || data.accessToken || data.access_token || data.jwt;
  if (!token) {
    throw new Error(
      "NIBSS /api/auth/token did not return a recognizable token.",
    );
  }

  cachedToken = token;
  cachedTokenExpiresAt = Date.now() + 10 * 60 * 1000; // cache 10 min
  return cachedToken;
}

async function authedRequest(method, url, data, _retried = false) {
  const token = await getToken();
  try {
    return await client.request({
      method,
      url,
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    if (err.response && err.response.status === 401 && !_retried) {
      await getToken({ forceRefresh: true });
      return authedRequest(method, url, data, true);
    }
    throw err;
  }
}

module.exports = {
  onboardFintech: (name, email) =>
    client.post("/api/fintech/onboard", { name, email }),
  insertBvn: (payload) => authedRequest("post", "/api/insertBvn", payload),
  insertNin: (payload) => authedRequest("post", "/api/insertNin", payload),
  validateBvn: (bvn) => authedRequest("post", "/api/validateBvn", { bvn }),
  validateNin: (nin) => authedRequest("post", "/api/validateNin", { nin }),
  createAccount: (payload) =>
    authedRequest("post", "/api/account/create", payload),
  nameEnquiry: (accountNumber) =>
    authedRequest("get", `/api/account/name-enquiry/${accountNumber}`),
  transfer: (payload) => authedRequest("post", "/api/transfer", payload),
  getTransactionByRef: (ref) => authedRequest("get", `/api/transaction/${ref}`),
  getAllAccounts: () => authedRequest("get", "/api/accounts"),
  getBalance: (accountNumber) =>
    authedRequest("get", `/api/account/balance/${accountNumber}`),
};
