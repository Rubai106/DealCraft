// DealCraft routes — demo endpoints (DEMO_MODE + demo-token gated). Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { db, now, fingerprint, randomToken, newId, expiryDate, getAdapter, resetRateLimits, LOG_PATH, baseUrl, addEvent, getJob, createWorkerToken, demoAllowed, upsertUser, createEventTriggers, TEST_MODE } = require('../src/shared');
// P2-8: one demo, one dataset — the seed values live in
// server/src/demo-seed.js and nowhere else.
const { DEMO_SEED } = require('../src/demo-seed');
const router = express.Router();

// ---------------------------------------------------------------- demo
const DEMO_SCRIPT = [
  { step: 1, title: 'Hirer signs in with phone + OTP', detail: 'POST /api/auth/request-otp with 01700000001, then verify the code sent by SMS (in test mode the code is returned in the response for automation).' },
  { step: 2, title: 'Hirer creates the job', detail: 'POST /api/jobs — electrician rewiring, BDT 18,000, deadline 7 days after seeding, milestones Advance 5,000 / First stage 7,000 / Completion 6,000.' },
  { step: 3, title: 'FairScope check', detail: 'Wall repair was "Not decided" — the job shows it as a missing term until it is resolved to "Worker includes wall repair".' },
  { step: 4, title: 'Worker gets an SMS with the review link', detail: 'Sandbox SMS is logged; the worker opens /worker.html?token=... and confirms with their own OTP.' },
  { step: 5, title: 'Record fee, then both sides confirm', detail: 'Hirer pays the ৳10 record fee via CaaS (or subscribes ৳70/month) — a job cannot become ACTIVE until the fee is settled. Then hirer confirms with the hirer-confirm code, worker confirms with the worker-confirm code — status becomes ACTIVE.' },
  { step: 6, title: 'Change: +BDT 2,000', detail: 'Hirer proposes a change (ChangeLock, +2,000 → BDT 20,000). Worker approves with the change-approve code; a new version is created with a new fingerprint.' },
  { step: 7, title: 'Payment acknowledged', detail: 'Hirer records the BDT 5,000 advance; the worker acknowledges receipt with the payment-ack code.' },
  { step: 8, title: 'Milestones, photos, close', detail: 'Worker completes milestones and adds photos; hirer approves them; the job closes.' },
  { step: 9, title: 'ResolvePack + Passport', detail: 'Download the ResolvePack PDF — the full chronological record — and add the closed job to the worker passport.' },
  { step: 10, title: 'Billing (CaaS)', detail: 'BDT 10 per job via AppLink CaaS — PENDING until the code verifies it; or BDT 70/month subscription. DealCraft holds no money.' },
];


router.get('/api/demo/script', (req, res) => {
  if (!demoAllowed(req, res)) return;
  res.json({ script: DEMO_SCRIPT });
});

// ---------------------------------------------------------------- demo sandbox
// Per-visitor demo namespace (item 10). Every demo visitor gets their own
// sandbox, keyed by an unguessable 32-hex visitor id carried in the
// dc_demo cookie or the x-demo-visitor header (the client sends the header
// on its first demo click, so the very first seed is already isolated;
// the cookie keeps later clicks in the same sandbox). The visitor id is
// never a phone number and never appears in a URL: the demo phones are
// derived from it by hash, so two visitors get different hirer/worker
// users and can never see each other's jobs through the normal hirer /
// worker auth — and the tag stored on a demo job is a hash of the id, not
// the id itself, so a job row can never be used to take over the sandbox.
// Requests with no visitor identity (scripted API clients such as the
// regression suite, which send no cookies) fall back to the shared legacy
// sandbox with the historical demo phones 01700000001 / 01800000002.
// Seeding / resetting deletes ONLY rows in the caller's own namespace:
// their demo jobs (by tag) and that namespace's OTP/session rows. Real
// jobs have no demo_visitor tag and are never touched; clearAllTables is
// gone from every request path.
const LEGACY_HIRER_PHONE = '01700000001';
const LEGACY_WORKER_PHONE = '01800000002';
const DEMO_COOKIE = 'dc_demo';

function demoPhonesFor(visitorKey) {
  if (!visitorKey || visitorKey === 'legacy') {
    return { hirer: LEGACY_HIRER_PHONE, worker: LEGACY_WORKER_PHONE };
  }
  const hash = crypto.createHash('sha256').update('dealcraft-demo:' + visitorKey).digest('hex');
  const digits = (off) => {
    let s = '';
    for (let i = 0; i < 8; i++) s += String(parseInt(hash.slice(off + i * 2, off + i * 2 + 2), 16) % 10);
    return s;
  };
  let hirer = '017' + digits(0);
  let worker = '018' + digits(16);
  if (hirer === LEGACY_HIRER_PHONE) hirer = '017' + digits(32);
  if (worker === LEGACY_WORKER_PHONE || worker === hirer) worker = '018' + digits(48);
  return { hirer, worker };
}

// Stored tag for a visitor's demo jobs: a hash, never the raw visitor id.
function demoTagFor(visitorKey) {
  if (!visitorKey || visitorKey === 'legacy') return 'legacy';
  return crypto.createHash('sha256').update('dealcraft-demo-tag:' + visitorKey).digest('hex').slice(0, 32);
}

function resolveDemoVisitor(req, res) {
  const header = req.get('x-demo-visitor') || '';
  const cookieHeader = req.get('cookie') || '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)dc_demo=([0-9a-fA-F]{32})/);
  let key = null;
  if (/^[0-9a-f]{32}$/i.test(header)) key = header.toLowerCase();
  else if (cookieMatch) key = cookieMatch[1].toLowerCase();
  if (!key) {
    return { key: 'legacy', tag: 'legacy', phones: demoPhonesFor('legacy'), fresh: false };
  }
  if (res) {
    res.setHeader('Set-Cookie', DEMO_COOKIE + '=' + key + '; Path=/; HttpOnly; SameSite=Lax; Max-Age='
      + (7 * 24 * 60 * 60) + (req.secure ? '; Secure' : ''));
  }
  return { key, tag: demoTagFor(key), phones: demoPhonesFor(key), fresh: true };
}

// Delete ONLY this visitor's demo data: their demo jobs (by tag, with all
// dependent rows, foreign-key order) and the OTP/session rows for their
// demo phones. User rows are kept (upsert reuses them), and a phone that
// also owns real (non-demo) jobs keeps its sessions / OTP rows, so a real
// user can never be logged out or wiped by a demo reset.
function clearDemoNamespace(visitor) {
  const jobs = db.prepare('SELECT id FROM Job WHERE demo_visitor = ?').all(visitor.tag);
  for (const { id } of jobs) {
    db.prepare('DELETE FROM WorkerToken WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM JobVersion WHERE job_id = ?').run(id);
    // Event rows are append-only at the storage layer (a BEFORE DELETE
    // trigger raises on any Event delete): the sanctioned demo-wipe
    // pattern drops the triggers, deletes only this visitor's demo
    // events, and recreates them — all synchronously, so no other
    // request can interleave while the triggers are down.
    db.exec('DROP TRIGGER IF EXISTS event_no_update; DROP TRIGGER IF EXISTS event_no_delete;');
    try {
      db.prepare('DELETE FROM Event WHERE job_id = ?').run(id);
    } finally {
      createEventTriggers();
    }
    db.prepare('DELETE FROM Payment WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM Photo WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM LocationShare WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM LocationTrail WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM ChangeProposal WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM Billing WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM PassportEntry WHERE job_id = ?').run(id);
    // FK children that were missed: a shared live-trip link
    // (TripShare.job_id REFERENCES Job) and a bid job accepted into
    // this job (BidJob.job_id REFERENCES Job) both block DELETE FROM
    // Job — re-seeding a demo that had shared its trip crashed the
    // server with FOREIGN KEY constraint failed. Delete them (and the
    // linked bid job's own bids/photos, and the job's SMS log rows)
    // before the parent Job row.
    db.prepare('DELETE FROM TripShare WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM SmsLog WHERE job_id = ?').run(id);
    const linkedBidJobs = db.prepare('SELECT id FROM BidJob WHERE job_id = ?').all(id);
    for (const b of linkedBidJobs) {
      db.prepare('DELETE FROM Bid WHERE bid_job_id = ?').run(b.id);
      db.prepare('DELETE FROM BidJobPhoto WHERE bid_job_id = ?').run(b.id);
      db.prepare('DELETE FROM BidJob WHERE id = ?').run(b.id);
    }
    const disputes = db.prepare('SELECT id FROM Dispute WHERE job_id = ?').all(id);
    for (const d of disputes) {
      db.prepare('DELETE FROM DisputeResolution WHERE dispute_id = ?').run(d.id);
      db.prepare('DELETE FROM DisputeStatement WHERE dispute_id = ?').run(d.id);
    }
    db.prepare('DELETE FROM Dispute WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM Job WHERE id = ?').run(id);
  }
  for (const phone of [visitor.phones.hirer, visitor.phones.worker]) {
    const user = db.prepare('SELECT id FROM User WHERE phone = ?').get(phone);
    // A real user on this number — as hirer OR as worker on a real job:
    // leave their session / OTP rows alone, so a demo reset can never log
    // out or strand a real user (job rows are already safe: only rows
    // carrying this visitor's tag are deleted above).
    const realJobs = user
      ? db.prepare("SELECT 1 FROM Job WHERE hirer_id = ? AND (demo_visitor IS NULL OR demo_visitor != ?) LIMIT 1").get(user.id, visitor.tag)
        || db.prepare("SELECT 1 FROM Job WHERE worker_phone = ? AND (demo_visitor IS NULL OR demo_visitor != ?) LIMIT 1").get(phone, visitor.tag)
      : null;
    if (realJobs) continue; // a real user on this number: leave their rows alone
    db.prepare('DELETE FROM Otp WHERE phone = ?').run(phone);
    db.prepare('DELETE FROM Session WHERE phone = ?').run(phone);
    db.prepare('DELETE FROM OtpTransaction WHERE phone = ?').run(phone);
    db.prepare('DELETE FROM pending_profiles WHERE phone = ?').run(phone);
    // Bid jobs the demo hirer posted are demo activity too; their bids
    // and photos go with them.
    if (user) {
      const bidJobs = db.prepare('SELECT id FROM BidJob WHERE hirer_id = ?').all(user.id);
      for (const b of bidJobs) {
        db.prepare('DELETE FROM Bid WHERE bid_job_id = ?').run(b.id);
        db.prepare('DELETE FROM BidJobPhoto WHERE bid_job_id = ?').run(b.id);
        db.prepare('DELETE FROM BidJob WHERE id = ?').run(b.id);
      }
    }
  }
}

router.post('/api/demo/reset', (req, res) => {
  if (!demoAllowed(req, res)) return;
  const visitor = resolveDemoVisitor(req, res);
  clearDemoNamespace(visitor);
  resetRateLimits();
  try { fs.writeFileSync(LOG_PATH, ''); } catch (_e) {}
  res.json({ ok: true, note: 'demo data cleared' });
});

router.post('/api/demo/seed', async (req, res) => {
  if (!demoAllowed(req, res)) return;
  const visitor = resolveDemoVisitor(req, res);
  clearDemoNamespace(visitor);
  resetRateLimits();
  try { fs.writeFileSync(LOG_PATH, ''); } catch (_e) {}
  const hirerPhone = visitor.phones.hirer;
  const workerPhone = visitor.phones.worker;
  const hirer = upsertUser(hirerPhone, DEMO_SEED.hirerName, 'hirer');
  upsertUser(workerPhone, DEMO_SEED.workerName, 'worker');
  const answers = { ...DEMO_SEED.answers };
  const milestones = DEMO_SEED.milestones.map((m) => ({ title: m.title, amount: m.amount }));
  const scope = DEMO_SEED.scope;
  const price = DEMO_SEED.price;
  // Item 12: the seed deadline is relative to seed time (+7 days), never
  // a hard-coded date — a fixed date would pass and the demo job would
  // nudge itself once that date goes by.
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const jobId = newId();
  const scopeDoc = { scope, milestones, answers, skippedTerms: [] };
  db.prepare(
    'INSERT INTO Job (id, hirer_id, worker_phone, worker_name, trade, status, current_version, site_lat, site_lng, site_address, demo_visitor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(jobId, hirer.id, workerPhone, DEMO_SEED.workerName, DEMO_SEED.trade, 'DRAFT', 1, DEMO_SEED.site.lat, DEMO_SEED.site.lng, DEMO_SEED.site.address, visitor.tag, now());
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope, price, deadline, answers, skippedTerms: [], milestones });
  db.prepare(
    'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), jobId, 1, JSON.stringify(scopeDoc), price, deadline, fp, now());
  addEvent(jobId, 'AGREEMENT_CREATED', 'hirer:' + hirerPhone, {
    trade: DEMO_SEED.trade, price, deadline,
    missingTerms: [],
    note: 'Wall repair was "Not decided" at first draft; resolved to "Worker includes wall repair" before seeding.',
  });
  const workerToken = createWorkerToken(jobId, 'view');
  const workerLink = '/worker.html?lang=bn&token=' + workerToken;
  // Guided demo, one click: the seed also mints a real 7-day hirer
  // session, so "See the demo" lands the evaluator inside the seeded job
  // with no code copying and no manual login. Demo endpoints stay gated
  // (DEMO_MODE + demo token), and no OTP value is ever returned in a
  // response body unless TEST_MODE is on — this token exists only in the
  // seed response.
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
      // Create-time SMS to the worker is Bangla, like the POST /api/jobs
      // create SMS (Part 2, item 12: the seed used to send this in
      // English — the worker's first message about their record).
      'DealCraft: ' + DEMO_SEED.hirerName + ' আপনার জন্য ইলেকট্রিশিয়ান কাজের রেকর্ড তৈরি করেছেন (৳১৮,০০০)। দেখুন: '
      + baseUrl(req) + workerLink + ' — DealCraft টাকা রাখে না; এটি কোনো আইনি নথি নয়।');
  } catch (_e) {
    // Sandbox OTP/SMS failures must not break seeding; codes stay null.
  }
  res.json({
    job: getJob(jobId),
    workerLink,
    hirerPhone,
    workerPhone,
    hirerToken,
    hirer: { phone: hirerPhone, name: DEMO_SEED.hirerName },
    // OTP values are returned only in test mode (TEST_MODE=true, the
    // regression suite); in every user-reachable build the key is absent.
    ...(TEST_MODE ? { sandboxOtps: { hirerConfirm: hirerOtp, workerConfirm: workerOtp } } : {}),
    // P2-8: the seed carries its own dataset, so a client (or a test)
    // can check the seeded record against the single source without a
    // second fetch. Phones stay per-visitor (derived), never fixed.
    seed: DEMO_SEED,
  });
});

module.exports = router;
