// DealCraft routes — auth + session. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, setPendingProfile, takePendingProfile, randomToken, newId, expiryDate, getAdapter, err, authedUser, otpError, normalizeBdPhone, upsertUser, TEST_MODE } = require('../src/shared');
const router = express.Router();

// Name/role supplied at OTP request time are held in the pending_profiles
// table (SQLite) until the code is verified — the User row is created /
// updated ONLY after a successful verification, never before. Persisted,
// not in-memory, so a profile started before a restart still completes
// after it. No expiry: an entry lives until the matching verify consumes
// it (get-then-delete), exactly as the old in-memory Map behaved.

router.post('/api/auth/request-otp', async (req, res) => {
  const { phone, name, role, purpose } = req.body || {};
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return err(res, 400, 'phone must be a Bangladesh mobile number (01XXXXXXXXX)');
  if (name || role) setPendingProfile(normalized, name || null, role || null);
  const adapter = getAdapter();
  try {
    const result = await adapter.sendOtp(normalized, purpose || 'login');
    const out = { ok: true, via: adapter.mode === 'sandbox' ? 'applink-otp-sandbox' : 'applink-otp-live' };
    if (adapter.mode === 'sandbox' && TEST_MODE) {
      out.sandbox = { otp: result.code, note: 'SANDBOX — not a live AppLink call' };
    }
    return res.json(out);
  } catch (e) {
    return otpError(res, e);
  }
});

router.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, code } = req.body || {};
  if (!phone || !code) return err(res, 400, 'phone and code are required');
  // Normalised the same way as request-otp, BEFORE anything else: a code
  // requested with +88017… verifies with 017… and vice versa.
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return err(res, 400, 'phone must be a Bangladesh mobile number (01XXXXXXXXX)');
  const adapter = getAdapter();
  let ok = false;
  try {
    ok = await adapter.verifyOtp(normalized, String(code), 'login');
  } catch (e) {
    return otpError(res, e);
  }
  if (!ok) return err(res, 401, 'invalid or expired code');
  const profile = takePendingProfile(normalized);
  const user = upsertUser(normalized, profile.name || null, profile.role || null);
  const token = randomToken();
  // Sessions last 7 days; authedUser() rejects anything older.
  db.prepare('INSERT INTO Session (id, token, phone, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(newId(), token, normalized, now(), expiryDate(7));
  res.json({ ok: true, token, user });
});

router.post('/api/auth/logout', (req, res) => {
  const user = authedUser(req);
  if (!user) return err(res, 401, 'authentication required');
  const h = req.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (m) db.prepare('DELETE FROM Session WHERE token = ?').run(m[1]);
  res.json({ ok: true });
});

router.get('/api/me', (req, res) => {
  const user = authedUser(req);
  if (!user) return err(res, 401, 'authentication required');
  res.json({ user });
});

module.exports = router;
