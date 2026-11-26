// DealCraft — AppLink LIVE adapter (real API spec).
// Spec: https://dev.applink.com.bd/docs (read 2026-11-26).
//   Base URL (same host for sandbox and live — there is no separate sandbox
//   host): https://api.applink.com.bd
//   Every call is POST, Content-Type: application/json, over HTTPS.
//   There is NO Authorization header and NO token endpoint: credentials go
//   in the JSON body of every call as `applicationId` + `password` (the
//   app's API key, called "password" by AppLink).
//   Judge success by the response body's `statusCode`, NEVER by the HTTP
//   status — AppLink returns HTTP 200 even for errors. Success is "S1000".
//   CaaS charge returns "P1003" (OTP sent) — that is NOT a completed
//   charge. Money has only moved when /caas/verify returns "S1000".
// Credentials come from the environment only (APPLINK_APP_ID and
// APPLINK_PASSWORD), server-side only. They are never logged, never
// returned to the browser, and never committed (.env is gitignored).
// The live adapter NEVER returns an OTP code: AppLink generates the OTP
// and sends it by SMS; DealCraft only ever sees the otpTransactionId.
// Same interfaces as the sandbox adapters (see server/src/applink/index.js).
// Live calls return Promises — callers must await adapter results.
const { appendLog } = require('./log');
const { checkOtpAttempt, recordOtpAttempt, checkOtpSend, recordOtpSend } = require('./otp-rate-limit');

const DEFAULT_BASE_URL = 'https://api.applink.com.bd';
const TIMEOUT_MS = 15000;

// Friendly explanations for the status codes DealCraft is most likely to
// hit. Full list: https://dev.applink.com.bd/docs/status-codes
const STATUS_HELP = {
  S1000: 'Success',
  S1001: 'Partial success',
  P1003: 'OTP sent — charge is NOT complete until /caas/verify returns S1000',
  E1003: 'Not registered (no subscription / OTP transaction for this number)',
  E1313: 'Authentication failed — check APPLINK_APP_ID / APPLINK_PASSWORD, or the app is inactive',
  E1323: 'Application is not approved / not registered in the AppLink portal',
  E1343: 'Number not whitelisted for testing in sandbox — whitelist it in the portal first',
  E1381: 'Charging not allowed in sandbox',
  E1850: 'OTP transaction expired (codes are valid for 5 minutes)',
  E1851: 'OTP code mismatch',
  E1855: 'OTP generation limit exceeded — wait before sending another code',
};

class AppLinkError extends Error {
  constructor(statusCode, statusDetail) {
    const help = STATUS_HELP[statusCode];
    super(
      'AppLink ' + statusCode + ': ' + (statusDetail || help || 'AppLink error')
      + (help && statusDetail && help !== statusDetail ? ' (' + help + ')' : '')
    );
    this.name = 'AppLinkError';
    this.statusCode = statusCode;
    this.statusDetail = statusDetail || null;
  }
}

// '01700000001' -> 'tel:8801700000001'; '8801700000001' -> 'tel:8801700000001'.
function toTel(phone) {
  const digits = String(phone).replace(/[^0-9]/g, '');
  const national = digits.startsWith('880') ? digits.slice(3) : digits.replace(/^0/, '');
  return 'tel:880' + national;
}

function requireConfig() {
  const applicationId = process.env.APPLINK_APP_ID;
  // APPLINK_API_KEY is accepted as the password only for backwards
  // compatibility with the first version of .env.example; the documented
  // variable is APPLINK_PASSWORD.
  const password = process.env.APPLINK_PASSWORD || process.env.APPLINK_API_KEY;
  if (!applicationId || !password) {
    throw new Error(
      'live credentials not configured: set APPLINK_APP_ID and APPLINK_PASSWORD '
      + '(from your AppLink portal: create an application, enable the APIs, '
      + 'and use the API key emailed after approval). No app exists yet, so '
      + 'there is nothing to configure against — see README.md.'
    );
  }
  const baseUrl = (process.env.APPLINK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return { baseUrl, applicationId, password };
}

async function liveCall(path, body) {
  const { baseUrl, applicationId, password } = requireConfig();
  const payload = { applicationId, password, ...body };
  let res;
  try {
    res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e && e.name === 'TimeoutError') {
      throw new Error('AppLink call timed out after ' + TIMEOUT_MS + 'ms: ' + path);
    }
    throw new Error('AppLink call failed (network): ' + path + ' — ' + (e && e.message ? e.message : e));
  }
  let data = null;
  try { data = await res.json(); } catch (_e) { /* fall through to the check below */ }
  // AppLink returns HTTP 200 even for errors, so the body is the truth.
  // If there is no usable body at all, the HTTP status is all we have.
  if (!data || typeof data.statusCode !== 'string') {
    throw new Error('AppLink call failed: ' + path + ' HTTP ' + res.status + ' (no statusCode in response)');
  }
  return data;
}

// Log only safe fields: never the password, never an OTP code.
function log(api, request, response) {
  appendLog({ api, request, response, mode: 'live' });
}

// otpTransactionId per phone+purpose, kept server-side only. AppLink's
// verify call needs it, and the DealCraft routes only pass (phone, code,
// purpose), so the adapter remembers it from the matching send call.
const otpTransactions = new Map(); // `${phone}|${purpose}` -> { otpTransactionId, sentAt }
const subscriptions = new Map(); // phone -> { subscriptionId, phone, plan, status }

async function sendOtp(phone, purpose = 'login') {
  // Same send cap as sandbox: 5 codes per phone+purpose per 15 minutes.
  checkOtpSend(phone, purpose);
  recordOtpSend(phone, purpose);
  const destinationAddress = toTel(phone);
  // AppLink generates the OTP and sends it by SMS; DealCraft never sees
  // the code. The message is the template text sent with it.
  const message = process.env.APPLINK_OTP_MESSAGE
    || 'Your DealCraft verification code is valid for 5 minutes.';
  const r = await liveCall('/otp/send', {
    destinationAddress,
    message,
    senderName: 'AppLink',
    length: 6,
  });
  if (r.statusCode !== 'S1000') throw new AppLinkError(r.statusCode, r.statusDetail);
  otpTransactions.set(phone + '|' + purpose, { otpTransactionId: r.otpTransactionId, sentAt: Date.now() });
  log('otp.send', { phone, purpose }, { statusCode: r.statusCode, requestId: r.requestId });
  // No `code` field here — deliberately. Live OTP codes are never returned.
  return { messageId: r.requestId || null, status: 'SENT', otpTransactionId: r.otpTransactionId };
}

async function verifyOtp(phone, code, purpose = 'login') {
  // 429 when this phone+purpose has failed too many times in the window.
  checkOtpAttempt(phone, purpose);
  const entry = otpTransactions.get(phone + '|' + purpose);
  if (!entry || !entry.otpTransactionId) {
    throw new Error('no live OTP was sent to this number for "' + purpose + '" — request a new code first');
  }
  let r;
  try {
    r = await liveCall('/otp/verify', {
      otpTransactionId: entry.otpTransactionId,
      otp: String(code),
      destinationAddress: toTel(phone),
    });
  } catch (e) {
    recordOtpAttempt(phone, purpose, false);
    throw e;
  }
  if (r.statusCode === 'S1000') {
    otpTransactions.delete(phone + '|' + purpose);
    recordOtpAttempt(phone, purpose, true);
    log('otp.verify', { phone, purpose }, { statusCode: r.statusCode, ok: true });
    return true;
  }
  // Wrong / expired code is a verification failure, not a server error:
  // the caller answers 401 "invalid or expired code", same as sandbox.
  if (r.statusCode === 'E1850' || r.statusCode === 'E1851') {
    recordOtpAttempt(phone, purpose, false);
    log('otp.verify', { phone, purpose }, { statusCode: r.statusCode, ok: false });
    return false;
  }
  recordOtpAttempt(phone, purpose, false);
  throw new AppLinkError(r.statusCode, r.statusDetail);
}

async function sendSms(phone, message) {
  const body = {
    message,
    destinationAddresses: [toTel(phone)],
  };
  if (process.env.APPLINK_DELIVERY_REPORT_URL) {
    body.deliveryReportURL = process.env.APPLINK_DELIVERY_REPORT_URL;
  }
  const r = await liveCall('/sms/send', body);
  if (r.statusCode !== 'S1000') throw new AppLinkError(r.statusCode, r.statusDetail);
  log('sms.send', { phone, message }, { statusCode: r.statusCode, requestId: r.requestId });
  return { messageId: r.requestId || null, status: 'SENT', requestId: r.requestId || null };
}

async function getSmsDeliveryStatus(requestId) {
  const r = await liveCall('/sms/get-delivery-status', { requestId });
  if (r.statusCode !== 'S1000') throw new AppLinkError(r.statusCode, r.statusDetail);
  log('sms.get-delivery-status', { requestId }, { statusCode: r.statusCode, deliveryStatus: r.deliveryStatus });
  return { requestId: r.requestId || requestId, deliveryStatus: r.deliveryStatus };
}

// CaaS: charge() only ever returns PENDING. The transactionId AppLink
// returns IS the charge id DealCraft stores (Billing.id) so verifyCharge()
// can find it again. P1003 = OTP sent, money has NOT moved.
async function charge(phone, amount, jobId) {
  const externalTrxId = 'DC-' + String(jobId).slice(0, 8) + '-' + Date.now().toString(36)
    + '-' + Math.random().toString(36).slice(2, 8);
  const r = await liveCall('/caas/charge', {
    subscriberId: toTel(phone),
    amount: Number(amount),
    currency: 'BDT',
    externalTrxId,
    chargingMetaData: { channel: 'APP' },
  });
  if (r.statusCode === 'P1003') {
    log('caas.charge', { phone, amount, jobId }, { statusCode: r.statusCode, transactionId: r.transactionId });
    return { chargeId: r.transactionId, status: 'PENDING', transactionId: r.transactionId };
  }
  if (r.statusCode === 'S1000') {
    // Charged without an OTP step (some price points behave this way).
    log('caas.charge', { phone, amount, jobId }, { statusCode: r.statusCode, transactionId: r.transactionId });
    return { chargeId: r.transactionId, status: 'VERIFIED', transactionId: r.transactionId };
  }
  throw new AppLinkError(r.statusCode, r.statusDetail);
}

async function verifyCharge(chargeId, otpCode) {
  const r = await liveCall('/caas/verify', {
    transactionId: chargeId,
    otp: String(otpCode),
  });
  if (r.statusCode === 'S1000') {
    log('caas.verify', { chargeId }, { statusCode: r.statusCode, status: 'VERIFIED' });
    return { status: 'VERIFIED', chargeId };
  }
  // Wrong / expired OTP: charge stays PENDING, caller does not mark paid.
  if (r.statusCode === 'E1850' || r.statusCode === 'E1851') {
    log('caas.verify', { chargeId }, { statusCode: r.statusCode, status: 'PENDING' });
    return { status: 'PENDING', chargeId };
  }
  throw new AppLinkError(r.statusCode, r.statusDetail);
}

// Subscription: the ৳70/month price, validity and service name are
// configured on the application in the AppLink portal when the app is
// provisioned — the API call itself only registers / unregisters the
// subscriber (action "1" / "0").
async function subscribe(phone, plan = 'monthly') {
  const r = await liveCall('/subscription/register', {
    subscriberId: toTel(phone),
    action: '1',
    version: '1.0',
  });
  if (r.statusCode !== 'S1000' || r.subscriptionStatus !== 'REGISTERED') {
    throw new AppLinkError(r.statusCode, r.statusDetail || ('subscriptionStatus: ' + r.subscriptionStatus));
  }
  const sub = { subscriptionId: 'applink-' + String(phone).replace(/[^0-9]/g, ''), phone, plan, status: 'ACTIVE' };
  subscriptions.set(phone, sub);
  log('subscription.register', { phone, plan }, { statusCode: r.statusCode, subscriptionStatus: r.subscriptionStatus });
  return { subscriptionId: sub.subscriptionId, status: 'ACTIVE' };
}

async function unsubscribe(phone) {
  const r = await liveCall('/subscription/unregister', {
    subscriberId: toTel(phone),
    action: '0',
    version: '1.0',
  });
  if (r.statusCode !== 'S1000' || r.subscriptionStatus !== 'UNREGISTERED') {
    throw new AppLinkError(r.statusCode, r.statusDetail || ('subscriptionStatus: ' + r.subscriptionStatus));
  }
  subscriptions.delete(phone);
  log('subscription.unregister', { phone }, { statusCode: r.statusCode, subscriptionStatus: r.subscriptionStatus });
  return { status: 'UNREGISTERED' };
}

async function getSubscription(phone) {
  const cached = subscriptions.get(phone);
  if (cached) return cached;
  const r = await liveCall('/subscription/get-charging-info', { subscriberId: toTel(phone) });
  if (r.statusCode !== 'S1000') {
    if (r.statusCode === 'E1003') return null; // not registered
    throw new AppLinkError(r.statusCode, r.statusDetail);
  }
  const sub = {
    subscriptionId: 'applink-' + String(phone).replace(/[^0-9]/g, ''),
    phone,
    plan: 'monthly',
    status: 'ACTIVE',
    amount: r.amount,
    currency: r.currency,
    chargeAt: r.chargeAt,
    frequency: r.frequency,
    serviceName: r.serviceName,
  };
  subscriptions.set(phone, sub);
  log('subscription.get-charging-info', { phone }, { statusCode: r.statusCode, status: 'ACTIVE' });
  return sub;
}

async function getChargingInfo(phone) {
  const r = await liveCall('/subscription/get-charging-info', { subscriberId: toTel(phone) });
  if (r.statusCode !== 'S1000') throw new AppLinkError(r.statusCode, r.statusDetail);
  log('subscription.get-charging-info', { phone }, { statusCode: r.statusCode });
  return r;
}

async function getBaseSize() {
  const r = await liveCall('/subscription/get-base-size', {});
  if (r.statusCode !== 'S1000') throw new AppLinkError(r.statusCode, r.statusDetail);
  log('subscription.get-base-size', {}, { statusCode: r.statusCode, subscriberCount: r.subscriberCount });
  return { subscriberCount: Number(r.subscriberCount) };
}

// Live SMS content is not stored locally, so there is no "last SMS" to
// show in the demo UI the way sandbox does.
function getLastSms(_phone) {
  return null;
}

module.exports = {
  sendOtp, verifyOtp, sendSms, getSmsDeliveryStatus,
  charge, verifyCharge,
  subscribe, unsubscribe, getSubscription, getChargingInfo, getBaseSize,
  getLastSms,
  // Exported for tests / diagnostics only.
  toTel, AppLinkError, requireConfig, DEFAULT_BASE_URL,
};
