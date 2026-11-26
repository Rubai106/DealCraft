// DealCraft routes — worker link + live location. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, getAdapter, err, addEvent, getJob, getCurrentVersion, jobDetail, findWorkerToken, otpError, billingSatisfied, getLocationShare, clearLocation, locationView, validLatLng, sendAgreementSummarySms } = require('../src/shared');
const router = express.Router();


// ---------------------------------------------------------------- worker
router.get('/api/worker/:token', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const detail = jobDetail(job);
  // Never expose hirer OTP codes or secrets here; detail contains only the record.
  res.json({ job: detail.job, version: getCurrentVersion(job), events: detail.events, balance: detail.balance, milestones: detail.milestones, payments: detail.payments });
});

router.post('/api/worker/:token/request-otp', async (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const { purpose } = req.body || {};
  const adapter = getAdapter();
  try {
    const result = await adapter.sendOtp(job.worker_phone, purpose || 'worker-confirm');
    const out = { ok: true, via: adapter.mode === 'sandbox' ? 'applink-otp-sandbox' : 'applink-otp-live' };
    if (adapter.mode === 'sandbox') out.sandbox = { otp: result.code, note: 'SANDBOX — not a live AppLink call' };
    return res.json(out);
  } catch (e) {
    return err(res, 502, e.message);
  }
});

router.post('/api/worker/:token/confirm', async (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const { otpCode } = req.body || {};
  if (!otpCode) return err(res, 400, 'otpCode is required');
  const adapter = getAdapter();
  let ok = false;
  try { ok = await adapter.verifyOtp(job.worker_phone, String(otpCode), 'worker-confirm'); }
  catch (e) { return otpError(res, e); }
  if (!ok) return err(res, 401, 'invalid or expired code');
  const hirerConfirmed = db.prepare(
    "SELECT 1 FROM Event WHERE job_id = ? AND type = 'CONFIRMED_BY_HIRER' LIMIT 1"
  ).get(job.id);
  if (hirerConfirmed && !billingSatisfied(job)) {
    return err(res, 402, 'record fee unpaid — the hirer must pay ৳10 via CaaS or subscribe ৳70/month before the job can become ACTIVE');
  }
  addEvent(job.id, 'CONFIRMED_BY_WORKER', 'worker:' + job.worker_phone, {});
  const status = hirerConfirmed ? 'ACTIVE' : 'PENDING';
  db.prepare('UPDATE Job SET status = ? WHERE id = ?').run(status, job.id);
  if (status === 'ACTIVE') await sendAgreementSummarySms(getJob(job.id));
  res.json({ job: getJob(job.id) });
});

// ---------------------------------------------------------------- live location
// Worker side: token-authenticated. Sharing is opt-in per job, off by
// default, and only while the job is ACTIVE. Stop/pause any time.
router.post('/api/worker/:token/location/start', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  if (job.status !== 'ACTIVE') return err(res, 403, 'job is not ACTIVE — location sharing is only for active jobs');
  db.prepare(
    `INSERT INTO LocationShare (job_id, lat, lng, accuracy, sharing_on, paused, simulated, updated_at, arrived_at)
     VALUES (?, 0, 0, NULL, 1, 0, 0, ?, NULL)
     ON CONFLICT(job_id) DO UPDATE SET sharing_on = 1, paused = 0, updated_at = excluded.updated_at`
  ).run(job.id, now());
  res.json({ ok: true, sharing: true, paused: false });
});

router.post('/api/worker/:token/location/pause', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const share = getLocationShare(job.id);
  if (!share || !share.sharing_on) return err(res, 404, 'location sharing is not on');
  db.prepare('UPDATE LocationShare SET paused = 1, updated_at = ? WHERE job_id = ?').run(now(), job.id);
  res.json({ ok: true, sharing: true, paused: true });
});

router.post('/api/worker/:token/location/resume', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const share = getLocationShare(job.id);
  if (!share || !share.sharing_on) return err(res, 404, 'location sharing is not on');
  if (job.status !== 'ACTIVE') return err(res, 403, 'job is not ACTIVE — location sharing is only for active jobs');
  db.prepare('UPDATE LocationShare SET paused = 0, updated_at = ? WHERE job_id = ?').run(now(), job.id);
  res.json({ ok: true, sharing: true, paused: false });
});

router.post('/api/worker/:token/location/stop', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const share = getLocationShare(job.id);
  if (!share || !share.sharing_on) return err(res, 404, 'location sharing is not on');
  clearLocation(job.id);
  res.json({ ok: true, sharing: false });
});

router.post('/api/worker/:token/location', async (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  if (job.status !== 'ACTIVE') return err(res, 403, 'job is not ACTIVE — location sharing is only for active jobs');
  const share = getLocationShare(job.id);
  if (!share || !share.sharing_on) return err(res, 403, 'location sharing is off — tap Share live location first');
  if (share.paused) return err(res, 409, 'location sharing is paused');
  const { lat, lng, accuracy, simulated } = req.body || {};
  if (!validLatLng(lat, lng)) return err(res, 400, 'lat/lng are required and must be in range');
  if (accuracy != null && (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 100000)) {
    return err(res, 400, 'accuracy must be a non-negative number (metres)');
  }
  const ts = now();
  db.prepare(
    'UPDATE LocationShare SET lat = ?, lng = ?, accuracy = ?, simulated = ?, updated_at = ? WHERE job_id = ?'
  ).run(lat, lng, accuracy ?? null, simulated ? 1 : 0, ts, job.id);
  db.prepare(
    'INSERT INTO LocationTrail (job_id, lat, lng, accuracy, simulated, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(job.id, lat, lng, accuracy ?? null, simulated ? 1 : 0, ts);
  // Keep only the last 50 trail points for this job.
  db.prepare(
    'DELETE FROM LocationTrail WHERE job_id = ? AND id NOT IN (SELECT id FROM LocationTrail WHERE job_id = ? ORDER BY id DESC LIMIT 50)'
  ).run(job.id, job.id);
  const view = locationView(job);
  // Geofence arrival (100 m): one event, once only, even if the worker
  // stays inside the geofence. Arriving (500 m) is a UI state, not an event.
  if (view && view.distanceKm != null && view.distanceKm <= 0.1) {
    const already = db.prepare(
      "SELECT 1 FROM Event WHERE job_id = ? AND type = 'ARRIVED_ON_SITE' LIMIT 1"
    ).get(job.id);
    if (!already) {
      // Privacy: the permanent record keeps only that the worker arrived
      // and when — never the precise coordinates. (The live trail is
      // deleted on close/dispute; the arrival event used to keep lat/lng
      // in the history, which defeated that deletion.)
      addEvent(job.id, 'ARRIVED_ON_SITE', 'worker:' + job.worker_phone, {
        status: 'ARRIVED', arrivedAt: ts, simulated: !!simulated,
      });
      db.prepare('UPDATE LocationShare SET arrived_at = ? WHERE job_id = ?').run(ts, job.id);
      // Notify the hirer in-app (the event above, on the timeline) and by
      // SMS via the AppLink adapter — sandbox-labelled in sandbox mode.
      try {
        const hirer = db.prepare('SELECT * FROM User WHERE id = ?').get(job.hirer_id);
        if (hirer) {
          const adapter = getAdapter();
          const worker = db.prepare('SELECT name FROM User WHERE phone = ?').get(job.worker_phone);
          await adapter.sendSms(hirer.phone,
            'DealCraft: ' + (worker && worker.name ? worker.name : 'Your worker')
            + ' has arrived on site for the ' + job.trade.toLowerCase() + ' job.'
            + ' — DealCraft holds no money; this record is not a legal document.');
        }
      } catch (_e) { /* arrival is recorded even if the SMS fails */ }
    }
  }
  res.json({ ok: true, status: view ? view.status : 'en-route', distanceKm: view ? view.distanceKm : null, etaMinutes: view ? view.etaMinutes : null });
});

module.exports = router;
