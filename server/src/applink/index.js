// DealCraft — AppLink adapter selector.
// APPLINK_MODE env: 'sandbox' (default) or 'live'.
// Live mode needs APPLINK_APP_ID + APPLINK_PASSWORD (see live.js and
// README.md); without them the live adapter throws a clear error on first
// use instead of silently falling back to sandbox.
// Both adapters expose identical interfaces for the core calls:
//   sendOtp(phone, purpose) -> {messageId, status} (+ sandbox code, sandbox only)
//   verifyOtp(phone, code, purpose) -> bool
//   sendSms(phone, message) -> {messageId, status}
//   charge(phone, amount, jobId) -> {chargeId, status:'PENDING'}
//   verifyCharge(chargeId, otpCode) -> {status:'VERIFIED'|'PENDING'}
//   subscribe(phone, plan) -> {subscriptionId, status}
//   getSubscription(phone) -> subscription | null
// Sandbox calls are synchronous; live calls return Promises — callers must
// await adapter results.
const sandboxOtp = require('./otp');
const sandboxSms = require('./sms');
const sandboxCaas = require('./caas');
const sandboxSubscription = require('./subscription');
const live = require('./live');

function getMode() {
  const m = (process.env.APPLINK_MODE || 'sandbox').toLowerCase();
  return m === 'live' ? 'live' : 'sandbox';
}

function getAdapter() {
  const mode = getMode();
  if (mode === 'live') {
    return {
      mode,
      ...live,
      // Live has no local "last SMS" store; getLastSms() returns null.
      unsubscribe: live.unsubscribe,
      getChargingInfo: live.getChargingInfo,
      getBaseSize: live.getBaseSize,
      getSmsDeliveryStatus: live.getSmsDeliveryStatus,
    };
  }
  return {
    mode: 'sandbox',
    sendOtp: sandboxOtp.sendOtp,
    verifyOtp: sandboxOtp.verifyOtp,
    sendSms: sandboxSms.sendSms,
    getLastSms: sandboxSms.getLastSms,
    charge: sandboxCaas.charge,
    verifyCharge: sandboxCaas.verifyCharge,
    subscribe: sandboxSubscription.subscribe,
    getSubscription: sandboxSubscription.getSubscription,
    unsubscribe: sandboxSubscription.unsubscribe,
  };
}

module.exports = { getAdapter, getMode };
