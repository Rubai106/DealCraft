// DealCraft routes — worker link + live location. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, getAdapter, err, addEvent, getJob, getCurrentVersion, jobDetail, findWorkerToken, otpError, billingSatisfied, getLocationShare, clearLocation, locationView, validLatLng, sendAgreementSummarySms, requireAuth, upsertUser, randomToken, newId, expiryDate, expireBids, addBiddingEvent, passportData, TEST_MODE } = require('../src/shared');
const router = express.Router();

// Worker profile facts — one shared shape, verified data only. No phone
// number is ever included. photoUrl is null until a photo is ever stored
// (there is no photo upload for workers); the card renders an initials
// tile instead. completedJobs/distinctHirers reuse passportData's exact
// count logic (mutually closed jobs only). memberSince is the User
// account creation date, month + year.
function formatMemberSince(createdAt) {
  try {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } catch (_e) { return null; }
}
function workerProfileFor(phone, trade, nameFallback) {
  const user = db.prepare('SELECT name, created_at FROM User WHERE phone = ?').get(phone);
  const pass = passportData(phone);
  return {
    name: (user && user.name) || nameFallback || null,
    trade: trade || null,
    photoUrl: null,
    phoneVerified: true,
    completedJobs: pass.completedJobs,
    distinctHirers: pass.distinctHirers,
    memberSince: formatMemberSince(user && user.created_at),
  };
}


// ---------------------------------------------------------------- worker
// Worker "My jobs": jobs where the logged-in user is the worker, newest
// first. Same job summary shape as GET /api/jobs items (raw Job rows);
// the hirer list stays GET /api/jobs. Registered BEFORE the :token route
// below, so 'jobs' is never mistaken for a worker token.
router.get('/api/worker/jobs', requireAuth, (req, res) => {
  const jobs = db.prepare('SELECT * FROM Job WHERE worker_phone = ? ORDER BY created_at DESC').all(req.user.phone);
  // Same list shape as GET /api/jobs: current version's price/deadline
  // plus the worker name, so no detail fetch per row. everWorker is
  // true when this phone has ever been the worker on any job.
  const everWorker = db.prepare('SELECT COUNT(*) AS n FROM Job WHERE worker_phone = ?').get(req.user.phone).n > 0;
  res.json({
    jobs: jobs.map((job) => {
      const version = getCurrentVersion(job);
      return {
        ...job,
        price: version ? version.price : null,
        deadline: version ? version.deadline : null,
        worker_name: job.worker_name || null,
      };
    }),
    everWorker,
  });
});

router.get('/api/worker/:token', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const detail = jobDetail(job);
  // The worker must know who they are confirming with: the hirer's name
  // and phone travel in the payload (the worker page renders them above
  // the confirm button). Never expose hirer OTP codes or secrets here;
  // detail contains only the record.
  const hirer = db.prepare('SELECT name, phone FROM User WHERE id = ?').get(job.hirer_id);
  detail.job.hirerName = hirer ? hirer.name : null;
  detail.job.hirerPhone = hirer ? hirer.phone : null;
  res.json({ job: detail.job, version: getCurrentVersion(job), events: detail.events, balance: detail.balance, milestones: detail.milestones, payments: detail.payments, workerProfile: workerProfileFor(job.worker_phone, job.trade, job.worker_name) });
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
    if (adapter.mode === 'sandbox' && TEST_MODE) out.sandbox = { otp: result.code, note: 'SANDBOX — not a live AppLink call' };
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
  // CLOSED is final: a closed job can never be confirmed back to ACTIVE.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — a closed job cannot be confirmed again');
  // Confirmations only in DRAFT/PENDING: an ACTIVE job is already
  // confirmed by both sides (a second confirm would duplicate the
  // CONFIRMED_BY_WORKER event and re-send the agreement summary SMS),
  // and a DISPUTED job returns to ACTIVE through mutual resolution,
  // not through re-confirmation.
  if (job.status !== 'DRAFT' && job.status !== 'PENDING') {
    return err(res, 409, 'job is ' + job.status + ' — confirmations are only for DRAFT or PENDING jobs');
  }
  const { otpCode } = req.body || {};
  if (!otpCode) return err(res, 400, 'otpCode is required');
  const hirerConfirmed = db.prepare(
    "SELECT 1 FROM Event WHERE job_id = ? AND type = 'CONFIRMED_BY_HIRER' LIMIT 1"
  ).get(job.id);
  // Billing is checked BEFORE the OTP is verified, so a 402 does not burn
  // the worker's code: the same code still works once the fee is paid.
  if (hirerConfirmed && !billingSatisfied(job)) {
    return err(res, 402, 'record fee unpaid — the hirer must pay ৳10 via CaaS or subscribe ৳70/month before the job can become ACTIVE');
  }
  const adapter = getAdapter();
  let ok = false;
  try { ok = await adapter.verifyOtp(job.worker_phone, String(otpCode), 'worker-confirm'); }
  catch (e) { return otpError(res, e); }
  if (!ok) return err(res, 401, 'invalid or expired code');
  addEvent(job.id, 'CONFIRMED_BY_WORKER', 'worker:' + job.worker_phone, {});
  const status = hirerConfirmed ? 'ACTIVE' : 'PENDING';
  db.prepare('UPDATE Job SET status = ? WHERE id = ?').run(status, job.id);
  if (status === 'ACTIVE') await sendAgreementSummarySms(getJob(job.id));
  // The SMS link lands the worker straight in their account: a
  // successful confirm creates/finds the worker's User (keyed by phone)
  // and issues a 7-day session, exactly as POST /api/auth/verify-otp
  // does. The per-job token flow above is unchanged — this only adds
  // sessionToken to the response.
  upsertUser(job.worker_phone, job.worker_name || null, 'worker');
  const sessionToken = randomToken();
  db.prepare('INSERT INTO Session (id, token, phone, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(newId(), sessionToken, job.worker_phone, now(), expiryDate(7));
  res.json({ job: getJob(job.id), sessionToken });
});

// ---------------------------------------------------------------- withdraw bid
// A worker takes back their own bid. Only the bid's own worker (session
// phone == bid worker_phone), only while the bid is LIVE — an expired bid
// is lazily expired first, so it reads EXPIRED and is refused. Logged in
// the same Event log as BID_PLACED / BID_NOT_SELECTED (addBiddingEvent,
// under the bid-job id).
router.post('/api/worker/bids/:bidId/withdraw', requireAuth, (req, res) => {
  const bid = db.prepare('SELECT * FROM Bid WHERE id = ?').get(req.params.bidId);
  if (!bid) return err(res, 404, 'bid not found');
  expireBids(bid.bid_job_id);
  const live = db.prepare('SELECT * FROM Bid WHERE id = ?').get(req.params.bidId);
  if (live.worker_phone !== req.user.phone) return err(res, 403, 'only the worker who placed this bid can withdraw it');
  if (live.status !== 'LIVE') return err(res, 400, 'this bid is ' + live.status.toLowerCase() + ' — only a live bid can be withdrawn');
  db.prepare("UPDATE Bid SET status = 'WITHDRAWN' WHERE id = ?").run(live.id);
  addBiddingEvent(live.bid_job_id, 'BID_WITHDRAWN', 'worker:' + req.user.phone, {
    bidJobId: live.bid_job_id, bidId: live.id, amount: live.amount,
  });
  res.json({ ok: true, status: 'WITHDRAWN' });
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
