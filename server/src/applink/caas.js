// DealCraft — AppLink Carrier-as-a-Service (CaaS) charging adapter (sandbox).
// Money has NOT moved until a charge is VERIFIED. Sandbox: charge() returns
// PENDING plus a sandbox OTP; verifyCharge() flips to VERIFIED only when the
// OTP matches. No real charging happens in sandbox mode.
const crypto = require('node:crypto');
const { appendLog } = require('./log');

const charges = new Map(); // chargeId -> { phone, amount, jobId, status, otp }

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function charge(phone, amount, jobId) {
  const chargeId = 'ch_' + crypto.randomBytes(10).toString('hex');
  const otp = generateCode();
  charges.set(chargeId, { phone, amount, jobId, status: 'PENDING', otp });
  const result = { chargeId, status: 'PENDING', sandbox: true, otp };
  appendLog({ api: 'caas.charge', request: { phone, amount, jobId }, response: { chargeId, status: 'PENDING' }, mode: 'sandbox' });
  return result;
}

function verifyCharge(chargeId, otpCode) {
  const c = charges.get(chargeId);
  let status = 'PENDING';
  if (c && String(otpCode) === c.otp) {
    c.status = 'VERIFIED';
    status = 'VERIFIED';
  }
  appendLog({ api: 'caas.verify', request: { chargeId }, response: { status }, mode: 'sandbox' });
  return { status, chargeId };
}

module.exports = { charge, verifyCharge };
