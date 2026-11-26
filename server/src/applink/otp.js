// DealCraft — AppLink OTP adapter (sandbox).
// Sandbox behaviour: generates a 6-digit code, stores it in the Otp table,
// logs the call, and RETURNS the code flagged sandbox:true so the demo can
// proceed without a live SMS. The live adapter must NEVER return the code.
const crypto = require('node:crypto');
const { db, now } = require('../db');
const { newId } = require('../tokens');
const { appendLog } = require('./log');

const OTP_TTL_MS = 10 * 60 * 1000;

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function sendOtp(phone, purpose = 'login') {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO Otp (id, phone, purpose, code, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(newId(), phone, purpose, code, expiresAt);
  const result = {
    messageId: 'sandbox-' + crypto.randomBytes(8).toString('hex'),
    status: 'SENT',
    sandbox: true,
    code, // sandbox only — the live adapter never returns the code
  };
  appendLog({ api: 'otp.send', request: { phone, purpose }, response: { messageId: result.messageId, status: result.status }, mode: 'sandbox' });
  return result;
}

function verifyOtp(phone, code, purpose = 'login') {
  const row = db.prepare(
    `SELECT * FROM Otp WHERE phone = ? AND purpose = ? AND code = ? AND used = 0
     ORDER BY expires_at DESC LIMIT 1`
  ).get(phone, purpose, String(code));
  let ok = false;
  if (row && new Date(row.expires_at).getTime() > Date.now()) {
    db.prepare('UPDATE Otp SET used = 1 WHERE id = ?').run(row.id);
    ok = true;
  }
  appendLog({ api: 'otp.verify', request: { phone, purpose }, response: { ok }, mode: 'sandbox' });
  return ok;
}

module.exports = { sendOtp, verifyOtp };
