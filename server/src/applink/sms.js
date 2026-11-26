// DealCraft — AppLink SMS adapter (sandbox).
// Sandbox behaviour: logs the call and keeps the last SMS per phone in
// memory so the demo UI can show what the worker would have received.
// No real SMS is sent in sandbox mode.
const crypto = require('node:crypto');
const { appendLog } = require('./log');

const lastSmsByPhone = new Map();

function sendSms(phone, message) {
  const result = {
    messageId: 'sandbox-sms-' + crypto.randomBytes(8).toString('hex'),
    status: 'SENT',
    sandbox: true,
  };
  lastSmsByPhone.set(phone, { phone, message, ts: new Date().toISOString(), messageId: result.messageId });
  appendLog({ api: 'sms.send', request: { phone, message }, response: result, mode: 'sandbox' });
  return result;
}

function getLastSms(phone) {
  return lastSmsByPhone.get(phone) || null;
}

module.exports = { sendSms, getLastSms };
