// DealCraft routes — CaaS record fee + subscription. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, newId, getAdapter, getMode, err, getJob, requireAuth, feeStateForJob } = require('../src/shared');
const router = express.Router();


// ---------------------------------------------------------------- billing
router.post('/api/billing/caas', requireAuth, async (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId) return err(res, 400, 'jobId is required');
  const job = getJob(jobId);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer pays for the job');
  // Idempotent: a pending or verified charge already exists for this job,
  // so return it instead of charging again. (A failed/expired charge has
  // no local row to reuse — only PENDING/VERIFIED rows count.)
  const existing = db.prepare(
    "SELECT * FROM Billing WHERE job_id = ? AND kind = 'caas' AND status IN ('PENDING','VERIFIED') ORDER BY created_at DESC LIMIT 1"
  ).get(jobId);
  if (existing) {
    const out = { chargeId: existing.id, status: existing.status, existing: true };
    if (getMode() === 'sandbox') {
      // The sandbox OTP for a reused PENDING charge is the one the adapter
      // generated at charge time; it is not stored locally, so a reused
      // charge asks the hirer to request a fresh code via the verify step.
      out.note = 'charge already exists for this job — no second charge was made';
    }
    return res.json(out);
  }
  const adapter = getAdapter();
  let result;
  try {
    result = await adapter.charge(req.user.phone, 10, jobId);
  } catch (e) {
    return err(res, 502, e.message);
  }
  // Billing.id carries the charge id so verify can find it.
  db.prepare("INSERT INTO Billing (id, job_id, kind, amount, status, created_at, user_phone) VALUES (?, ?, 'caas', 10, 'PENDING', ?, ?)")
    .run(result.chargeId, jobId, now(), req.user.phone);
  const out = { chargeId: result.chargeId, status: 'PENDING' };
  if (adapter.mode === 'sandbox' && result.otp) out.sandboxOtp = result.otp;
  res.json(out);
});

router.post('/api/billing/caas/:chargeId/verify', requireAuth, async (req, res) => {
  const billing = db.prepare("SELECT * FROM Billing WHERE id = ? AND kind = 'caas'").get(req.params.chargeId);
  if (!billing) return err(res, 404, 'charge not found');
  // Ownership: the charge must belong to the authenticated hirer.
  if (billing.user_phone && billing.user_phone !== req.user.phone) {
    return err(res, 403, 'this charge belongs to another hirer');
  }
  // A charge already verified stays VERIFIED (idempotent success); a
  // charge cancelled after a failed code is dead — the hirer must start
  // a fresh charge for a fresh code.
  if (billing.status === 'VERIFIED') return res.json({ chargeId: req.params.chargeId, status: 'VERIFIED' });
  if (billing.status === 'CANCELLED') {
    return err(res, 400, 'this charge was cancelled after a wrong code — request a new charge to get a fresh code');
  }
  const { otpCode } = req.body || {};
  if (!otpCode) return err(res, 400, 'otpCode is required');
  const adapter = getAdapter();
  let result;
  try {
    result = await adapter.verifyCharge(req.params.chargeId, String(otpCode));
  } catch (e) {
    return err(res, 502, e.message);
  }
  if (result.status === 'VERIFIED') {
    db.prepare("UPDATE Billing SET status = 'VERIFIED', verified_at = ? WHERE id = ?").run(now(), req.params.chargeId);
    db.prepare('UPDATE Job SET billing_paid = 1 WHERE id = ?').run(billing.job_id);
    return res.json({ chargeId: req.params.chargeId, status: 'VERIFIED' });
  }
  // Wrong code is an explicit error, not a silent 200 PENDING — and the
  // failed attempt is closed (CANCELLED), so the next POST /api/billing/caas
  // issues a NEW charge with a NEW code instead of returning the same
  // stuck pending charge. Idempotency is keyed on the payment intent
  // (the job's fee), not on the failed attempt: only one charge can ever
  // verify a job, because a verified charge sets billing_paid.
  db.prepare("UPDATE Billing SET status = 'CANCELLED' WHERE id = ?").run(req.params.chargeId);
  return err(res, 400, 'incorrect code — this charge attempt is closed; request a new charge to get a fresh code');
});

router.post('/api/billing/subscribe', requireAuth, async (req, res) => {
  const { plan } = req.body || {};
  // No duplicate rows: an ACTIVE subscription is returned as-is.
  const existing = db.prepare(
    "SELECT * FROM Billing WHERE kind = 'subscription' AND status = 'ACTIVE' AND user_phone = ? ORDER BY created_at DESC LIMIT 1"
  ).get(req.user.phone);
  if (existing) {
    return res.json({ subscriptionId: existing.id, status: 'ACTIVE', plan: plan || 'monthly', amount: 70, existing: true });
  }
  const adapter = getAdapter();
  let result;
  try {
    result = await adapter.subscribe(req.user.phone, plan || 'monthly');
  } catch (e) {
    return err(res, 502, e.message);
  }
  const subId = result.subscriptionId || newId();
  db.prepare("INSERT INTO Billing (id, job_id, kind, amount, status, created_at, user_phone) VALUES (?, '', 'subscription', 70, 'ACTIVE', ?, ?)")
    .run(subId, now(), req.user.phone);
  res.json({ subscriptionId: subId, status: result.status, plan: plan || 'monthly', amount: 70 });
});

// Cancel the hirer's subscription (adapter + Billing row). A cancelled
// subscription no longer satisfies the billing gate for new activations.
router.post('/api/billing/unsubscribe', requireAuth, async (req, res) => {
  const adapter = getAdapter();
  let result = { status: 'CANCELLED' };
  try {
    if (typeof adapter.unsubscribe === 'function') result = await adapter.unsubscribe(req.user.phone);
  } catch (e) {
    return err(res, 502, e.message);
  }
  db.prepare("UPDATE Billing SET status = 'CANCELLED' WHERE kind = 'subscription' AND status = 'ACTIVE' AND user_phone = ?")
    .run(req.user.phone);
  res.json({ status: result.status || 'CANCELLED' });
});

// Billing status for the billing tab: fees, subscription state, and which
// of the hirer's jobs are paid. MT SMS costs 2.00 BDT per message, charged
// to the subscriber (AppLink portal default).
router.get('/api/billing/status', requireAuth, (req, res) => {
  const sub = db.prepare(
    "SELECT * FROM Billing WHERE kind = 'subscription' AND status = 'ACTIVE' AND user_phone = ? ORDER BY created_at DESC LIMIT 1"
  ).get(req.user.phone);
  const jobs = db.prepare('SELECT id, status, billing_paid FROM Job WHERE hirer_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({
    recordFee: 10,
    subscriptionFee: 70,
    subscriptionPeriod: 'monthly',
    smsCostNote: 'MT SMS 2.00 BDT per message, charged to the subscriber (AppLink portal default).',
    subscriptionActive: !!sub,
    subscriptionId: sub ? sub.id : null,
    // Per-job record-fee state, from the live CaaS row for that job —
    // read-only: reading this never creates a charge. `paid` is kept
    // unchanged for backward compatibility; feePaid is the same fact
    // from the Billing row, plus amount/status/verification time.
    jobs: jobs.map((j) => {
      const fee = feeStateForJob(j.id);
      return { jobId: j.id, status: j.status, paid: !!j.billing_paid, feePaid: fee.paid, feeAmount: fee.amount, feeStatus: fee.status, feeVerifiedAt: fee.verifiedAt };
    }),
    paidJobs: jobs.filter((j) => j.billing_paid).length,
    unpaidJobs: jobs.filter((j) => !j.billing_paid).length,
  });
});

module.exports = router;
