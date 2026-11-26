// DealCraft — token helpers. Tokens are random; never derived from user data.
const crypto = require('node:crypto');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function newId() {
  return crypto.randomUUID();
}

function expiryDate(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = { randomToken, newId, expiryDate };
