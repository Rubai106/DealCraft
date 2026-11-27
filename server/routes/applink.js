// DealCraft routes — AppLink mode/log + callbacks (adapter code untouched in server/src/applink/). Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, getMode, readLog, err, authedUser, normalizeBdPhone, maskLogEntry, applinkCallback } = require('../src/shared');
const router = express.Router();
const callbacksRouter = express.Router();


router.get('/api/applink/mode', (req, res) => {
  // credentialsConfigured is a boolean only — no secret ever leaves the server.
  // The hero pill shows "Live" only when the mode is live AND credentials
  // are configured; anything else is shown as a sandbox demo.
  const live = getMode() === 'live';
  const credentialsConfigured = live
    && !!(process.env.APPLINK_APP_ID && (process.env.APPLINK_PASSWORD || process.env.APPLINK_API_KEY));
  res.json({ mode: getMode(), credentialsConfigured, note: 'AppLink reaches Banglalink subscribers only.' });
});

router.get('/api/applink/log', (req, res) => {
  const user = authedUser(req);
  if (!user) return err(res, 401, 'authentication required');
  // Scoped to the authenticated user only: entries are tagged with the
  // subscriber they belong to (ownerPhone); entries with no owner (e.g.
  // delivery reports that carry no phone) stay server-side only.
  const mine = readLog(50).filter((e) => e.ownerPhone === user.phone);
  res.json({ entries: mine.map(maskLogEntry) });
});
callbacksRouter.post('/api/applink/sms-report', (req, res) => {
  applinkCallback(req, res, 'sms.delivery-report', () => {});
});
callbacksRouter.post('/api/applink/mo-sms', (req, res) => {
  applinkCallback(req, res, 'sms.mo-inbound', () => {});
});
callbacksRouter.post('/api/applink/caas-notify', (req, res) => {
  applinkCallback(req, res, 'caas.notify', (body) => {
    // A CaaS notification naming a charge we hold: mark it VERIFIED only
    // when the notification itself says the charge succeeded.
    const chargeId = body.transactionId || body.chargeId || null;
    const ok = body.statusCode === 'S1000' || body.status === 'VERIFIED' || body.status === 'CHARGED';
    if (chargeId && ok) {
      const row = db.prepare("SELECT * FROM Billing WHERE id = ? AND kind = 'caas'").get(chargeId);
      if (row) {
        db.prepare("UPDATE Billing SET status = 'VERIFIED', verified_at = ? WHERE id = ?").run(now(), chargeId);
        db.prepare('UPDATE Job SET billing_paid = 1 WHERE id = ?').run(row.job_id);
      }
    }
  });
});
callbacksRouter.post('/api/applink/subscription-notify', (req, res) => {
  applinkCallback(req, res, 'subscription.notify', (body) => {
    // Reconciliation: a notification that a subscription ended cancels
    // the local ACTIVE row for that phone. A local ACTIVE subscription is
    // NOT proof of auto-renewal — it is reconciled against AppLink
    // callbacks, and the billing gate re-checks it on every activation.
    const raw = body.subscriberId || body.phone || null;
    const phone = raw ? normalizeBdPhone(String(raw).replace(/^tel:/, '')) : null;
    const ended = body.status === 'UNREGISTERED' || body.subscriptionStatus === 'UNREGISTERED'
      || body.statusCode === 'E1003';
    if (phone && ended) {
      db.prepare("UPDATE Billing SET status = 'CANCELLED' WHERE kind = 'subscription' AND status = 'ACTIVE' AND user_phone = ?").run(phone);
    }
  });
});

module.exports = { router, callbacksRouter };
