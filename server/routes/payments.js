// DealCraft routes — payment acknowledgements. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, newId, getAdapter, err, addEvent, getJob, workerTokenForJob, otpError, requireAuth } = require('../src/shared');
const router = express.Router();


// ---------------------------------------------------------------- payments
router.post('/api/jobs/:id/payments', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer records payments');
  const { amount, method, date } = req.body || {};
  if (typeof amount !== 'number' || amount <= 0) return err(res, 400, 'amount must be a positive number (BDT)');
  if (!['Cash', 'bKash', 'Nagad'].includes(method)) return err(res, 400, 'method must be Cash, bKash or Nagad');
  const paymentId = newId();
  db.prepare(
    'INSERT INTO Payment (id, job_id, amount, method, recorded_by, ack_status, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(paymentId, job.id, amount, method, 'hirer:' + req.user.phone, 'AWAITING', date || now().slice(0, 10), now());
  addEvent(job.id, 'PAYMENT_RECORDED', 'hirer:' + req.user.phone, { paymentId, amount, method });
  const payment = db.prepare('SELECT * FROM Payment WHERE id = ?').get(paymentId);
  const wt = db.prepare('SELECT * FROM WorkerToken WHERE job_id = ? ORDER BY expires_at DESC LIMIT 1').get(job.id);
  const ackLink = wt ? '/worker.html?token=' + wt.token + '&action=ack-payment&paymentId=' + paymentId : null;
  res.status(201).json({ payment, ackLink });
});

router.post('/api/payments/:paymentId/ack', async (req, res) => {
  const payment = db.prepare('SELECT * FROM Payment WHERE id = ?').get(req.params.paymentId);
  if (!payment) return err(res, 404, 'payment not found');
  const job = getJob(payment.job_id);
  const wt = workerTokenForJob(req, job.id);
  if (!wt) return err(res, 401, 'a valid worker token is required');
  if (payment.ack_status !== 'AWAITING') return err(res, 400, 'payment already ' + payment.ack_status.toLowerCase());
  const { decision, otpCode } = req.body || {};
  if (!['received', 'incorrect'].includes(decision)) {
    return err(res, 400, "decision must be 'received' or 'incorrect'");
  }
  if (!otpCode) return err(res, 400, 'otpCode is required');
  const adapter = getAdapter();
  let ok = false;
  try { ok = await adapter.verifyOtp(job.worker_phone, String(otpCode), 'payment-ack'); }
  catch (e) { return otpError(res, e); }
  if (!ok) return err(res, 401, 'invalid or expired code');
  if (decision === 'received') {
    db.prepare("UPDATE Payment SET ack_status = 'ACKNOWLEDGED' WHERE id = ?").run(payment.id);
    addEvent(job.id, 'PAYMENT_ACKNOWLEDGED', 'worker:' + job.worker_phone, { paymentId: payment.id, amount: payment.amount });
  } else {
    db.prepare("UPDATE Payment SET ack_status = 'DISPUTED' WHERE id = ?").run(payment.id);
    addEvent(job.id, 'PAYMENT_DISPUTED', 'worker:' + job.worker_phone, { paymentId: payment.id, amount: payment.amount });
  }
  res.json({ payment: db.prepare('SELECT * FROM Payment WHERE id = ?').get(payment.id) });
});

module.exports = router;
