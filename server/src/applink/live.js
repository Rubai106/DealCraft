// DealCraft — AppLink LIVE adapter (stub).
// Same interfaces as the sandbox adapters. Requires APPLINK_BASE_URL and
// APPLINK_API_KEY from the environment; throws a clear error when they are
// missing. NEVER commit secrets — keys come from env only.
// NOTE: the live adapter NEVER returns an OTP code to the caller.
const { appendLog } = require('./log');

function requireConfig() {
  const baseUrl = process.env.APPLINK_BASE_URL;
  const apiKey = process.env.APPLINK_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('live credentials not configured: set APPLINK_BASE_URL and APPLINK_API_KEY');
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

async function liveCall(path, body) {
  const { baseUrl, apiKey } = requireConfig();
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('AppLink live call failed: ' + path + ' HTTP ' + res.status);
  return res.json();
}

function sendOtp(phone, purpose = 'login') {
  // Live OTP is delivered by AppLink; the code is never returned here.
  const p = liveCall('/otp/send', { phone, purpose });
  return p.then((r) => {
    appendLog({ api: 'otp.send', request: { phone, purpose }, response: { messageId: r.messageId, status: r.status }, mode: 'live' });
    return { messageId: r.messageId, status: r.status || 'SENT' };
  });
}

function verifyOtp(phone, code, purpose = 'login') {
  const p = liveCall('/otp/verify', { phone, code, purpose });
  return p.then((r) => {
    appendLog({ api: 'otp.verify', request: { phone, purpose }, response: { ok: !!r.ok }, mode: 'live' });
    return !!r.ok;
  });
}

function sendSms(phone, message) {
  const p = liveCall('/sms/send', { phone, message });
  return p.then((r) => {
    appendLog({ api: 'sms.send', request: { phone, message }, response: { messageId: r.messageId, status: r.status }, mode: 'live' });
    return { messageId: r.messageId, status: r.status || 'SENT' };
  });
}

function charge(phone, amount, jobId) {
  const p = liveCall('/caas/charge', { phone, amount, jobId });
  return p.then((r) => {
    appendLog({ api: 'caas.charge', request: { phone, amount, jobId }, response: { chargeId: r.chargeId, status: r.status }, mode: 'live' });
    return { chargeId: r.chargeId, status: r.status || 'PENDING' };
  });
}

function verifyCharge(chargeId, otpCode) {
  const p = liveCall('/caas/verify', { chargeId, otpCode });
  return p.then((r) => {
    appendLog({ api: 'caas.verify', request: { chargeId }, response: { status: r.status }, mode: 'live' });
    return { status: r.status || 'PENDING', chargeId };
  });
}

function subscribe(phone, plan = 'monthly') {
  const p = liveCall('/subscription/subscribe', { phone, plan });
  return p.then((r) => {
    appendLog({ api: 'subscription.subscribe', request: { phone, plan }, response: { subscriptionId: r.subscriptionId, status: r.status }, mode: 'live' });
    return { subscriptionId: r.subscriptionId, status: r.status || 'PENDING' };
  });
}

function getSubscription(phone) {
  const p = liveCall('/subscription/get', { phone });
  return p.then((r) => {
    appendLog({ api: 'subscription.get', request: { phone }, response: { status: r.status || 'NONE' }, mode: 'live' });
    return r;
  });
}

module.exports = { sendOtp, verifyOtp, sendSms, charge, verifyCharge, subscribe, getSubscription };
