// DealCraft — OTP verify rate limiting (shared by the sandbox and live adapters).
// Max 5 FAILED verify attempts per phone+purpose per 15 minutes; the 6th
// attempt in the window is refused with a 429 error. A successful verify
// clears the counter. This is the brute-force guard for the 6-digit code:
// without it, unlimited guesses are possible inside the code's 5-minute
// window, and in live mode every OTP send costs money.
// In-memory only: the counters live as long as the process does. That is
// enough for a single-server demo; a multi-server deployment would need a
// shared store (the DB) instead.
const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
// OTP sends are capped too: a phone can be sprayed with (paid, in live
// mode) codes otherwise. Same window, separate counter.
const MAX_SENDS = 5;

const attempts = new Map();
const sends = new Map(); // key -> { count: number, windowStart: number }

function rateLimitError() {
  const e = new Error(
    'Too many wrong codes. Please wait 15 minutes and request a new code. / অনেকবার ভুল কোড দেওয়া হয়েছে। ১৫ মিনিট অপেক্ষা করে নতুন কোড নিন।'
  );
  e.status = 429;
  return e;
}

function checkOtpAttempt(phone, purpose) {
  const key = phone + '|' + purpose;
  const entry = attempts.get(key);
  if (!entry) return;
  if (Date.now() - entry.windowStart >= WINDOW_MS) {
    attempts.delete(key);
    return;
  }
  if (entry.failed >= MAX_FAILED_ATTEMPTS) throw rateLimitError();
}

function recordOtpAttempt(phone, purpose, ok) {
  const key = phone + '|' + purpose;
  if (ok) {
    attempts.delete(key);
    return;
  }
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.windowStart >= WINDOW_MS) {
    attempts.set(key, { failed: 1, windowStart: Date.now() });
  } else {
    entry.failed += 1;
  }
}

function checkOtpSend(phone, purpose) {
  const key = phone + '|' + purpose;
  const entry = sends.get(key);
  if (!entry) return;
  if (Date.now() - entry.windowStart >= WINDOW_MS) {
    sends.delete(key);
    return;
  }
  if (entry.count >= MAX_SENDS) {
    const e = new Error(
      'Too many codes sent to this number. Please wait 15 minutes and try again. / এই নম্বরে অনেকবার কোড পাঠানো হয়েছে। ১৫ মিনিট অপেক্ষা করুন।'
    );
    e.status = 429;
    throw e;
  }
}

function recordOtpSend(phone, purpose) {
  const key = phone + '|' + purpose;
  const entry = sends.get(key);
  if (!entry || Date.now() - entry.windowStart >= WINDOW_MS) {
    sends.set(key, { count: 1, windowStart: Date.now() });
  } else {
    entry.count += 1;
  }
}

module.exports = { checkOtpAttempt, recordOtpAttempt, checkOtpSend, recordOtpSend, MAX_FAILED_ATTEMPTS, MAX_SENDS, WINDOW_MS };
