// DealCraft — general write rate limiting (item 4 of the technical
// hardening pass). Dependency-free, in-memory, fixed window per IP:
// 1000 mutating API requests per 15 minutes per IP, 429 in the app's
// existing { error } shape when exceeded.
//
// Why 1000 / 15 min: the regression suite fires ~190 mutating requests
// from one IP inside a single run (105 call sites plus the 55-point
// location-trail loop), a full demo flow is a few dozen writes, and a
// worker sharing live location posts at most ~90 points per 15 minutes
// at a 10-second cadence — 1000 leaves more than 5x headroom over the
// heaviest legitimate traffic while still capping a flood. The OTP
// routes keep their own stricter per-phone limiter
// (server/src/applink/otp-rate-limit.js, 5 failed verifies / 5 sends
// per phone+purpose per 15 min) on top of this one.
//
// EXEMPTION: the AppLink callback endpoints (/api/applink/*) are not
// counted — they are server-to-server delivery reports that must not be
// dropped, and their payloads are log-only. Every other mutating /api
// route is counted, including the demo endpoints.
const { err } = require('./shared');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_WRITES = 1000;
const MUTATING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// ip -> { count, windowStart }
const counts = new Map();

function rateLimit(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  if (!req.path.startsWith('/api/')) return next();
  // AppLink callbacks are server-to-server webhooks: exempt (see above).
  if (req.path.startsWith('/api/applink/')) return next();
  // Key on the real client IP: req.ip honours Express 'trust proxy', so
  // behind a PaaS it is the leftmost X-Forwarded-For address; direct, it
  // is the socket address exactly as before.
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  const nowMs = Date.now();
  let entry = counts.get(ip);
  if (!entry || nowMs - entry.windowStart >= WINDOW_MS) {
    counts.set(ip, { count: 1, windowStart: nowMs });
    return next();
  }
  entry.count += 1;
  if (entry.count > MAX_WRITES) {
    return err(res, 429, 'too many requests — please wait a few minutes and try again');
  }
  next();
}

// Prune stale windows so the map cannot grow without bound. Unref'd so
// it never holds the process open on its own.
setInterval(() => {
  const nowMs = Date.now();
  for (const [ip, entry] of counts) {
    if (nowMs - entry.windowStart >= WINDOW_MS) counts.delete(ip);
  }
}, WINDOW_MS).unref();

module.exports = { rateLimit, RATE_LIMIT_WINDOW_MS: WINDOW_MS, RATE_LIMIT_MAX_WRITES: MAX_WRITES };
