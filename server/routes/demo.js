// DealCraft routes — demo endpoints (DEMO_MODE + demo-token gated). Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const fs = require('node:fs');
const { db, now, clearAllTables, fingerprint, randomToken, newId, expiryDate, getAdapter, resetRateLimits, LOG_PATH, baseUrl, addEvent, getJob, createWorkerToken, demoAllowed, upsertUser } = require('../src/shared');
const router = express.Router();

// ---------------------------------------------------------------- demo
const DEMO_SCRIPT = [
  { step: 1, title: 'Hirer signs in with phone + OTP', detail: 'POST /api/auth/request-otp with 01700000001, then verify the sandbox code.' },
  { step: 2, title: 'Hirer creates the job', detail: 'POST /api/jobs — electrician rewiring, BDT 18,000, deadline 2026-12-05, milestones Advance 5,000 / First stage 7,000 / Completion 6,000.' },
  { step: 3, title: 'FairScope check', detail: 'Wall repair was "Not decided" — the job shows it as a missing term until it is resolved to "Worker includes wall repair".' },
  { step: 4, title: 'Worker gets an SMS with the review link', detail: 'Sandbox SMS is logged; the worker opens /worker.html?token=... and confirms with their own OTP.' },
  { step: 5, title: 'Record fee, then both sides confirm', detail: 'Hirer pays the ৳10 record fee via CaaS (or subscribes ৳70/month) — a job cannot become ACTIVE until the fee is settled. Then hirer confirms with the hirer-confirm OTP, worker confirms with the worker-confirm OTP — status becomes ACTIVE.' },
  { step: 6, title: 'Change: +BDT 2,000', detail: 'Hirer proposes a change (ChangeLock, +2,000 → BDT 20,000). Worker approves with the change-approve OTP; a new version is created with a new fingerprint.' },
  { step: 7, title: 'Payment acknowledged', detail: 'Hirer records the BDT 5,000 advance; the worker acknowledges receipt with the payment-ack OTP.' },
  { step: 8, title: 'Milestones, photos, close', detail: 'Worker completes milestones and adds photos; hirer approves them; the job closes.' },
  { step: 9, title: 'ResolvePack + Passport', detail: 'Download the ResolvePack PDF — the full chronological record — and add the closed job to the worker passport.' },
  { step: 10, title: 'Billing (CaaS)', detail: 'BDT 10 per job via AppLink CaaS — PENDING until the sandbox OTP verifies it; or BDT 70/month subscription. DealCraft holds no money.' },
];


router.get('/api/demo/script', (req, res) => {
  if (!demoAllowed(req, res)) return;
  res.json({ script: DEMO_SCRIPT });
});

router.post('/api/demo/reset', (req, res) => {
  if (!demoAllowed(req, res)) return;
  clearAllTables();
  resetRateLimits();
  try { fs.writeFileSync(LOG_PATH, ''); } catch (_e) {}
  res.json({ ok: true, note: 'demo data cleared' });
});

router.post('/api/demo/seed', async (req, res) => {
  if (!demoAllowed(req, res)) return;
  clearAllTables();
  resetRateLimits();
  try { fs.writeFileSync(LOG_PATH, ''); } catch (_e) {}
  const hirerPhone = '01700000001';
  const workerPhone = '01800000002';
  const hirer = upsertUser(hirerPhone, 'Rahim Uddin', 'hirer');
  upsertUser(workerPhone, 'Karim Mistri', 'worker');
  const answers = {
    'Who buys wires/materials?': 'Worker buys, hirer pays',
    'Wire brand and specification': 'BRB 1.5mm / 2.5mm',
    'Number of points': '24 points',
    'Circuit breakers included?': 'Yes, included',
    'Wall cutting and wall repair — included?': 'Worker includes wall repair',
    'Final testing included?': 'Yes, included',
    'Transport cost': 'Included',
    'Waste removal': 'Worker removes waste',
  };
  const milestones = [
    { title: 'Advance', amount: 5000 },
    { title: 'First stage', amount: 7000 },
    { title: 'Completion', amount: 6000 },
  ];
  const scope = 'Apartment electrical rewiring — 2 bedrooms';
  const price = 18000;
  const deadline = '2026-12-05';
  const jobId = newId();
  const scopeDoc = { scope, milestones, answers, skippedTerms: [] };
  db.prepare(
    'INSERT INTO Job (id, hirer_id, worker_phone, worker_name, trade, status, current_version, site_lat, site_lng, site_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(jobId, hirer.id, workerPhone, 'Karim Mistri', 'ELECTRICIAN', 'DRAFT', 1, 23.8103, 90.4125, 'Demo flat, Dhaka', now());
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope, price, deadline, answers, skippedTerms: [], milestones });
  db.prepare(
    'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), jobId, 1, JSON.stringify(scopeDoc), price, deadline, fp, now());
  addEvent(jobId, 'AGREEMENT_CREATED', 'hirer:' + hirerPhone, {
    trade: 'ELECTRICIAN', price, deadline,
    missingTerms: [],
    note: 'Wall repair was "Not decided" at first draft; resolved to "Worker includes wall repair" before seeding.',
  });
  const workerToken = createWorkerToken(jobId, 'view');
  const workerLink = '/worker.html?token=' + workerToken;
  // Guided demo, one click: the seed also mints a real 7-day hirer
  // session, so "See the demo" lands the evaluator inside the seeded job
  // with no OTP copying and no manual login. Demo endpoints stay gated
  // (DEMO_MODE + demo token), and the sandbox OTP display on the normal
  // login flow is untouched — this token exists only in the seed response.
  const hirerToken = randomToken();
  db.prepare('INSERT INTO Session (id, token, phone, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(newId(), hirerToken, hirerPhone, now(), expiryDate(7));
  const adapter = getAdapter();
  let hirerOtp = null;
  let workerOtp = null;
  try {
    hirerOtp = (await adapter.sendOtp(hirerPhone, 'hirer-confirm')).code || null;
    workerOtp = (await adapter.sendOtp(workerPhone, 'worker-confirm')).code || null;
    await adapter.sendSms(workerPhone,
      'DealCraft: Rahim Uddin created a work record for electrical rewiring (BDT 18,000). Review it here: '
      + baseUrl(req) + workerLink + ' — DealCraft holds no money; this record is not a legal document.');
  } catch (_e) {
    // Sandbox OTP/SMS failures must not break seeding; codes stay null.
  }
  res.json({
    job: getJob(jobId),
    workerLink,
    hirerPhone,
    workerPhone,
    hirerToken,
    hirer: { phone: hirerPhone, name: 'Rahim Uddin' },
    sandboxOtps: { hirerConfirm: hirerOtp, workerConfirm: workerOtp },
  });
});

module.exports = router;
