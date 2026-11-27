// DealCraft shared server helpers — extracted verbatim from server/server.js
// (route split; no behaviour change). Route modules and the slim entry
// point require what they need from here.
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const { db, init, now, setPendingProfile, takePendingProfile, createEventTriggers, DATA_DIR } = require('./db');
const { fingerprint } = require('./fingerprint');
const { eventHash, verifyChain, GENESIS } = require('./chain');
const { smsSegments, shortCodeFor } = require('./sms');
const { randomToken, newId, expiryDate } = require('./tokens');
const { FAIRSCOPE_QUESTIONS, questionsFor, computeMissingTerms, validateSkippedTerms } = require('./fairscope');
const { getAdapter, getMode } = require('./applink');
const { resetRateLimits } = require('./applink/otp-rate-limit');
const { readLog, LOG_PATH } = require('./applink/log');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// Feature flag: the bidding marketplace ("Find a repairer") is ON by
// default. When off (FEATURE_BIDDING=false), its API routes do not exist
// (404) and the client hides every trace of it. The code stays in the
// repo, only gated — nothing is deleted. Set FEATURE_BIDDING=false to
// turn it off.
const BIDDING_ENABLED = process.env.FEATURE_BIDDING !== 'false';
function requireBidding(req, res, next) {
  if (!BIDDING_ENABLED) return err(res, 404, 'not found');
  next();
}

// ---------------------------------------------------------------- helpers
function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function baseUrl(req) {
  // All SMS / PDF / passport links are built from a configured
  // PUBLIC_BASE_URL (https) when one is set — the Host header is never
  // trusted for these links. Without it (local dev only), fall back to
  // the request, as before. Deployments must set PUBLIC_BASE_URL.
  const configured = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  return req.protocol + '://' + req.get('host');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function addEvent(jobId, type, actor, payload) {
  // Hash chain (Ceiling Pass, Part 2, item 9): the ONLY event-append
  // path in the app (every route writes events through here, including
  // bidding history copies). The hash covers type, actor, the payload as
  // stored, and the stored timestamp, chained on the previous event's
  // hash for this job ('' for the first event). The timestamp is fixed
  // before hashing so the stored row recomputes exactly.
  const createdAt = now();
  const prev = db.prepare('SELECT hash FROM Event WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(jobId);
  const prevHash = (prev && prev.hash) || GENESIS;
  const hash = eventHash(prevHash, {
    type, actor: actor || null, payload: payload ?? null, created_at: createdAt,
  });
  db.prepare(
    'INSERT INTO Event (job_id, type, actor, payload_json, created_at, hash) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(jobId, type, actor || null, payload ? JSON.stringify(payload) : null, createdAt, hash);
  return db.prepare('SELECT * FROM Event ORDER BY id DESC LIMIT 1').get();
}

// The chain head for a job: the hash of its latest event, or null when
// the job has no events yet. (verifyChain is the full check; the head is
// the one value ResolvePack / /api/verify publish.)
function chainHeadOf(events) {
  if (!events || !events.length) return null;
  return events[events.length - 1].hash || null;
}

function getJob(id) {
  return db.prepare('SELECT * FROM Job WHERE id = ?').get(id) || null;
}

function getVersions(jobId) {
  return db.prepare('SELECT * FROM JobVersion WHERE job_id = ? ORDER BY version_no ASC').all(jobId);
}

function getCurrentVersion(job) {
  return db.prepare(
    'SELECT * FROM JobVersion WHERE job_id = ? AND version_no = ?'
  ).get(job.id, job.current_version);
}

function parseScopeJson(version) {
  try { return JSON.parse(version.scope_json); } catch (_e) { return { scope: version.scope_json }; }
}

function milestonesOf(version) {
  const s = parseScopeJson(version);
  return Array.isArray(s.milestones) ? s.milestones : [];
}

function milestoneStatus(jobId, milestones) {
  const events = db.prepare(
    "SELECT * FROM Event WHERE job_id = ? AND type IN ('MILESTONE_COMPLETED','MILESTONE_APPROVED') ORDER BY id ASC"
  ).all(jobId);
  const completed = new Set();
  const approved = new Set();
  for (const e of events) {
    let p = {};
    try { p = JSON.parse(e.payload_json || '{}'); } catch (_e) {}
    if (typeof p.index === 'number') {
      if (e.type === 'MILESTONE_COMPLETED') completed.add(p.index);
      if (e.type === 'MILESTONE_APPROVED') approved.add(p.index);
    }
  }
  return milestones.map((m, i) => ({
    index: i,
    title: m.title,
    amount: m.amount,
    completed: completed.has(i),
    approved: approved.has(i),
  }));
}

function jobDetail(job) {
  const versions = getVersions(job.id);
  const current = getCurrentVersion(job);
  const events = db.prepare('SELECT * FROM Event WHERE job_id = ? ORDER BY id ASC').all(job.id);
  // Hash chain (Ceiling Pass, Part 2, item 9): verified here so the
  // ResolvePack JSON (which is jobDetail) carries the verdict alongside
  // the events themselves; the verify page recomputes the same check.
  const chain = verifyChain(events);
  const payments = db.prepare('SELECT * FROM Payment WHERE job_id = ? ORDER BY created_at ASC').all(job.id);
  const photos = db.prepare('SELECT * FROM Photo WHERE job_id = ? ORDER BY taken_at ASC').all(job.id);
  const disputes = db.prepare('SELECT * FROM Dispute WHERE job_id = ? ORDER BY created_at ASC').all(job.id)
    .map((d) => ({
      ...d,
      statements: db.prepare('SELECT * FROM DisputeStatement WHERE dispute_id = ? ORDER BY created_at ASC').all(d.id),
    }));
  const milestones = current ? milestoneStatus(job.id, milestonesOf(current)) : [];
  const agreed = current ? current.price : 0;
  // Price-creep protection (ceiling pass item 16): the price the hirer
  // agreed first (V1) vs the price the record carries now, with every
  // APPROVED ChangeLock between them — old price → new price + reason.
  // The old/new prices come from the stored versions (the CHANGE_APPROVED
  // event names the resulting version); the reason from the proposal.
  const approvedEvents = events.filter((e) => e.type === 'CHANGE_APPROVED');
  const priceChanges = db.prepare(
    "SELECT * FROM ChangeProposal WHERE job_id = ? AND status = 'APPROVED' ORDER BY created_at ASC"
  ).all(job.id).map((c) => {
    let versionNo = null;
    let decidedAt = null;
    for (const e of approvedEvents) {
      let p = {};
      try { p = JSON.parse(e.payload_json || '{}'); } catch (_e) {}
      if (p.changeId === c.id) { versionNo = p.version; decidedAt = e.created_at; break; }
    }
    const prevVersion = versionNo ? versions.find((v) => v.version_no === versionNo - 1) : null;
    const nextVersion = versionNo ? versions.find((v) => v.version_no === versionNo) : null;
    return {
      changeId: c.id, version: versionNo,
      oldPrice: prevVersion ? prevVersion.price : null,
      newPrice: nextVersion ? nextVersion.price : null,
      priceDelta: c.price_delta, reason: c.reason, decidedAt,
    };
  });
  const priceProtection = {
    originalPrice: versions.length ? versions[0].price : null,
    currentPrice: current ? current.price : null,
    changed: versions.length > 1,
    changes: priceChanges,
  };
  // Evidence pack (ceiling pass item 16): ResolvePack + live fingerprint
  // verification. The per-event hash chain (Part 2, item 9) now exists:
  // chainPresent is true when the job has chained events, and chainStatus
  // reports the verification verdict honestly — never faked.
  const evidence = current ? {
    fingerprint: current.fingerprint,
    fingerprint8: shortCodeFor(current.fingerprint),
    verifyPath: '/verify?fp=' + current.fingerprint,
    verifyApiPath: '/api/verify?fp=' + current.fingerprint,
    resolvePackPath: '/api/jobs/' + job.id + '/resolvepack',
    chainPresent: chain.chainHead != null,
    chainHead: chain.chainHead,
    chainStatus: chain.valid
      ? 'hash chain verified end-to-end (' + events.length + ' events)'
      : 'hash chain BROKEN at event ' + chain.brokenIndex + ' (' + chain.brokenType + ')',
  } : null;
  const acknowledgedPaid = payments
    .filter((p) => p.ack_status === 'ACKNOWLEDGED')
    .reduce((sum, p) => sum + p.amount, 0);
  // The hirer needs the worker link for the detail view (and for the
  // ResolvePack download, which opens in a new tab without an auth header).
  // The link is the worker's link, so it carries ?lang=bn — the worker
  // page defaults to Bangla.
  const wt = db.prepare('SELECT * FROM WorkerToken WHERE job_id = ? ORDER BY expires_at DESC LIMIT 1').get(job.id);
  return {
    job: { ...job, workerLink: wt ? '/worker.html?lang=bn&token=' + wt.token : null },
    versions: versions.map((v) => ({ ...v, scope: parseScopeJson(v) })),
    events,
    chainHead: chain.chainHead,
    chainValid: chain.valid,
    chainBrokenIndex: chain.valid ? null : chain.brokenIndex,
    chainBrokenType: chain.valid ? null : chain.brokenType,
    payments,
    photos,
    milestones,
    balance: { agreed, acknowledgedPaid, remaining: agreed - acknowledgedPaid },
    fee: feeStateForJob(job.id),
    disputes,
    priceProtection,
    evidence,
  };
}

function createWorkerToken(jobId, action = 'view') {
  const token = randomToken();
  db.prepare(
    'INSERT INTO WorkerToken (id, token, job_id, action, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(newId(), token, jobId, action, expiryDate(7));
  return token;
}

function findWorkerToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM WorkerToken WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row;
}

function workerTokenForJob(req, jobId) {
  const token = req.query.token || req.get('x-worker-token');
  const row = findWorkerToken(token);
  if (!row || row.job_id !== jobId) return null;
  return row;
}

// Bearer session auth (hirer). Returns the User row or null.
// Sessions expire 7 days after login (expires_at); an expired session is
// deleted and rejected. Sessions created before expires_at existed have no
// expiry recorded and are treated as expired.
function authedUser(req) {
  const h = req.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const s = db.prepare('SELECT * FROM Session WHERE token = ?').get(m[1]);
  if (!s) return null;
  if (!s.expires_at || new Date(s.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM Session WHERE token = ?').run(m[1]);
    return null;
  }
  return db.prepare('SELECT * FROM User WHERE phone = ?').get(s.phone) || null;
}

// Map an adapter error to its HTTP status: OTP rate limiting is a 429,
// anything else from an adapter is a 502 (the upstream call failed).
function otpError(res, e) {
  if (e && e.status === 429) return err(res, 429, e.message);
  return err(res, 502, e.message);
}

// ---------------------------------------------------------------- validation (Agent B)
// Sane price band for a record: a whole number of taka, ৳100 – ৳10,000,000.
// ৳1 is not a real job price — the floor is ৳100.
const MAX_JOB_PRICE = 10000000;
const MIN_JOB_PRICE = 100;
const VALIDATION_MSG = {
  scopeRequired: { en: 'scope is required — describe the work', bn: 'কাজের বিবরণ দিতে হবে' },
  priceInteger: { en: 'price must be a whole number of taka (BDT)', bn: 'দাম পূর্ণ টাকায় হতে হবে' },
  priceMin: { en: 'price must be at least ৳100', bn: 'দাম কমপক্ষে ৳১০০ হতে হবে' },
  priceMax: { en: 'price must be at most ৳10,000,000', bn: 'দাম সর্বোচ্চ ৳১,০০,০০,০০০ হতে হবে' },
  deadlineFormat: { en: 'deadline must be a real date (YYYY-MM-DD)', bn: 'শেষ তারিখ সঠিক তারিখ হতে হবে (YYYY-MM-DD)' },
  deadlinePast: { en: 'deadline cannot be in the past', bn: 'শেষ তারিখ অতীতের হতে পারবে না' },
  samePhone: { en: 'the hirer and worker cannot be the same phone number', bn: 'হায়ারার ও ওয়ার্কারের নম্বর এক হতে পারবে না' },
  milestoneAmount: { en: 'each milestone amount must be a positive whole number of taka', bn: 'প্রতিটি মাইলস্টোনের টাকা পূর্ণ সংখ্যায় হতে হবে' },
};
function vmsg(key, lang) {
  const m = VALIDATION_MSG[key];
  return (m && m[lang === 'bn' ? 'bn' : 'en']) || (m && m.en);
}
// Today's date in Dhaka (Asia/Dhaka), YYYY-MM-DD. Deadline comparisons
// use this, not UTC — UTC midnight is up to 6 hours late in Dhaka.
function dhakaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
// True only for a real calendar date in YYYY-MM-DD form ('2026-02-30'
// and 'not-a-date' are both false).
function isRealDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function validateScope(scope, lang = 'en') {
  if (typeof scope !== 'string' || !scope.trim()) return vmsg('scopeRequired', lang);
  return null;
}
function validatePrice(price, lang = 'en') {
  if (typeof price !== 'number' || !Number.isInteger(price)) return vmsg('priceInteger', lang);
  if (price < MIN_JOB_PRICE) return vmsg('priceMin', lang);
  if (price > MAX_JOB_PRICE) return vmsg('priceMax', lang);
  return null;
}
function validateDeadline(deadline, lang = 'en') {
  if (deadline == null || deadline === '') return null; // deadline is optional
  if (!isRealDateString(deadline)) return vmsg('deadlineFormat', lang);
  if (deadline < dhakaToday()) return vmsg('deadlinePast', lang);
  return null;
}
function validateMilestones(milestones, lang = 'en') {
  if (milestones == null) return null;
  if (!Array.isArray(milestones)) return vmsg('milestoneAmount', lang);
  for (const m of milestones) {
    if (!m || typeof m.amount !== 'number' || !Number.isInteger(m.amount) || m.amount <= 0) {
      return vmsg('milestoneAmount', lang);
    }
  }
  return null;
}
// Rescale a milestone list proportionally to a new total: each amount is
// rounded to whole taka and the last milestone absorbs the remainder, so
// the rescaled list always sums exactly to the new total.
function rescaleMilestones(milestones, newTotal) {
  const list = (Array.isArray(milestones) ? milestones : []).map((m) => ({ ...m }));
  const oldTotal = list.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  if (!list.length || oldTotal <= 0 || newTotal <= 0) return { milestones: list, oldTotal, rescaled: false };
  if (oldTotal === newTotal) return { milestones: list, oldTotal, rescaled: false };
  let running = 0;
  for (let i = 0; i < list.length; i++) {
    if (i === list.length - 1) list[i].amount = newTotal - running;
    else {
      list[i].amount = Math.round((Number(list[i].amount) || 0) * newTotal / oldTotal);
      running += list[i].amount;
    }
  }
  return { milestones: list, oldTotal, rescaled: true };
}

// Bangladesh mobile numbers only: 01[3-9]XXXXXXXX, optionally +880/880
// prefixed. Normalised to the 11-digit 01… form before anything is stored
// or sent, so an OTP can never be sprayed at an arbitrary string — in live
// mode every OTP send costs money.
function normalizeBdPhone(phone) {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/[\s-]/g, '');
  const m = digits.match(/^(?:\+?880|0)?(1[3-9]\d{8})$/);
  return m ? '0' + m[1] : null;
}

// Billing gate: a job may only become ACTIVE when its ৳10 record fee is
// paid (billing_paid) or the hirer holds an ACTIVE ৳70/month subscription.
function hasActiveSubscription(phone) {
  return !!db.prepare(
    "SELECT 1 FROM Billing WHERE kind = 'subscription' AND status = 'ACTIVE' AND user_phone = ? LIMIT 1"
  ).get(phone);
}

// Per-job ৳10 record-fee state, derived from the live CaaS Billing row
// (at most one PENDING/VERIFIED row per job — the charge endpoint
// returns the existing row instead of creating a second). Read-only:
// calling this never creates a charge. verifiedAt is when the charge
// reached VERIFIED; rows verified before the verified_at column existed
// keep null (unknown, never backfilled with now()). amount is 10 even
// with no row yet — that is the scheduled record fee, not a payment.
function feeStateForJob(jobId) {
  const row = db.prepare(
    "SELECT * FROM Billing WHERE job_id = ? AND kind = 'caas' AND status IN ('PENDING','VERIFIED') ORDER BY created_at DESC LIMIT 1"
  ).get(jobId);
  if (!row) return { paid: false, amount: 10, status: null, verifiedAt: null };
  const paid = row.status === 'VERIFIED';
  return { paid, amount: row.amount, status: row.status, verifiedAt: paid ? (row.verified_at || null) : null };
}

function billingSatisfied(job) {
  if (job.billing_paid) return true;
  const hirer = db.prepare('SELECT phone FROM User WHERE id = ?').get(job.hirer_id);
  return hirer ? hasActiveSubscription(hirer.phone) : false;
}

// Demo endpoints (seed/reset) are gated behind DEMO_MODE=true — the flag
// is OFF unless explicitly set, so a missing flag is a 404 (loopback alone
// no longer opens them). They now work in production too, when the flag is
// set: seeding is namespaced per visitor (routes/demo.js) and can no
// longer touch other users' data, so production no longer 404s them. On
// top of the flag, when DEALCRAFT_DEMO_TOKEN is configured the caller must
// also carry it (x-demo-token header or demoToken body/query field); with
// no token configured, production allows any visitor to demo (the sandbox
// is namespaced and rate-limited), while non-production still requires a
// loopback request. Deployments that want "See the demo" to work set
// DEMO_MODE=true and leave the token unset; deployments that want demo
// endpoints restricted set a token.
function isLoopback(req) {
  const a = req.socket && req.socket.remoteAddress;
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function demoAllowed(req, res) {
  // Env flag first: DEMO_MODE=true is required, and the flag defaults OFF.
  if (process.env.DEMO_MODE !== 'true') {
    err(res, 404, 'not found');
    return false;
  }
  const configured = process.env.DEALCRAFT_DEMO_TOKEN;
  if (configured) {
    const supplied = req.get('x-demo-token')
      || (req.body && req.body.demoToken) || req.query.demoToken;
    if (supplied !== configured) {
      err(res, 403, 'demo endpoints need the demo token');
      return false;
    }
    return true;
  }
  // No token configured: in production any visitor may demo (namespaced
  // seeding cannot wipe or read other visitors' data); in non-production
  // the old loopback-only rule still applies.
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') return true;
  if (!isLoopback(req)) {
    err(res, 403, 'demo endpoints are local-only without a demo token');
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  const user = authedUser(req);
  if (!user) return err(res, 401, 'authentication required');
  req.user = user;
  next();
}

// Auth OR a valid worker token scoped to this job. Sets req.user and/or req.workerToken.
function requireJobAccess(req, res, next) {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  const user = authedUser(req);
  if (user && user.id === job.hirer_id) { req.user = user; req.job = job; return next(); }
  const wt = workerTokenForJob(req, job.id);
  if (wt) { req.workerToken = wt; req.job = job; return next(); }
  return err(res, 401, 'authentication required');
}

function actorOf(req, job) {
  if (req.workerToken) return 'worker:' + (job ? job.worker_phone : '');
  if (req.user) return 'hirer:' + req.user.phone;
  return 'unknown';
}

function sideOf(req, job) {
  if (req.workerToken) return 'worker';
  if (req.user) return 'hirer';
  return null;
}

// ---------------------------------------------------------------- live location
// Privacy rule: only the latest point is kept in LocationShare; the trail
// holds at most the last 50 points of an ACTIVE job and is deleted on close.
// Nothing location-related ever goes into ResolvePack, WorkPassport or the
// AppLink log. Arrival is one append-only event, written once only.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getLocationShare(jobId) {
  return db.prepare('SELECT * FROM LocationShare WHERE job_id = ?').get(jobId) || null;
}

function clearLocation(jobId) {
  db.prepare('DELETE FROM LocationShare WHERE job_id = ?').run(jobId);
  db.prepare('DELETE FROM LocationTrail WHERE job_id = ?').run(jobId);
}

function jobSite(job) {
  if (job.site_lat == null || job.site_lng == null) return null;
  return { lat: job.site_lat, lng: job.site_lng, address: job.site_address || null };
}

// Speed from the last two trail points; sane fallback when there is no
// usable movement yet (same spot, or points posted within milliseconds).
function recentSpeedKmh(jobId) {
  const pts = db.prepare(
    'SELECT lat, lng, created_at FROM LocationTrail WHERE job_id = ? ORDER BY id DESC LIMIT 2'
  ).all(jobId);
  if (pts.length < 2) return null;
  const [a, b] = pts;
  const dist = haversineKm(b.lat, b.lng, a.lat, a.lng);
  const dtH = (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) / 3600000;
  if (!(dtH > 0)) return null;
  const speed = dist / dtH;
  if (speed < 1 || speed > 120) return null;
  return speed;
}

function locationView(job) {
  const share = getLocationShare(job.id);
  if (!share || !share.sharing_on) return null;
  const site = jobSite(job);
  const trail = db.prepare(
    'SELECT lat, lng, accuracy, simulated, created_at FROM LocationTrail WHERE job_id = ? ORDER BY id ASC'
  ).all(job.id);
  const latest = { lat: share.lat, lng: share.lng, accuracy: share.accuracy, updated_at: share.updated_at, simulated: !!share.simulated };
  const distanceKm = site ? haversineKm(share.lat, share.lng, site.lat, site.lng) : null;
  const speedKmh = recentSpeedKmh(job.id) || 25;
  const etaMinutes = distanceKm == null ? null : Math.max(1, Math.round(distanceKm / speedKmh * 60));
  let status = 'en-route';
  if (share.paused) status = 'paused';
  else if (distanceKm != null && distanceKm <= 0.1) {
    const arrivedMs = share.arrived_at ? Date.now() - new Date(share.arrived_at).getTime() : Infinity;
    status = arrivedMs <= 5 * 60 * 1000 ? 'arrived' : 'on-site';
  } else if (distanceKm != null && distanceKm <= 0.5) status = 'arriving';
  return {
    sharing: true, paused: !!share.paused, status, latest, site,
    distanceKm: distanceKm == null ? null : Math.round(distanceKm * 100) / 100,
    etaMinutes, speedKmh: Math.round(speedKmh),
    arrivedAt: share.arrived_at || null,
    trail,
  };
}

function validLatLng(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function upsertUser(phone, name, role) {
  const existing = db.prepare('SELECT * FROM User WHERE phone = ?').get(phone);
  if (existing) {
    if ((name && !existing.name) || (role && !existing.role)) {
      db.prepare('UPDATE User SET name = COALESCE(?, name), role = COALESCE(?, role) WHERE phone = ?')
        .run(name || null, role || null, phone);
    }
    return db.prepare('SELECT * FROM User WHERE phone = ?').get(phone);
  }
  const id = newId();
  db.prepare('INSERT INTO User (id, name, phone, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name || null, phone, role || null, now());
  return db.prepare('SELECT * FROM User WHERE id = ?').get(id);
}

// OTP round-trips (ceiling pass item 14 — audit, no reuse made).
// Every OTP purpose guards a DISTINCT state change, and codes are
// purpose-scoped (phone + purpose), so a code issued for one purpose
// cannot verify another:
//   login          -> a 7-day session. Proves identity at login time
//                     only; it proves no intent for any later change.
//   hirer-confirm  -> CONFIRMED_BY_HIRER, possibly ACTIVE.
//   worker-confirm -> CONFIRMED_BY_WORKER, possibly ACTIVE. The worker
//                     has no session at all (token link only), so there
//                     is nothing to reuse here.
//   change-approve -> CHANGE_APPROVED + a new JobVersion.
//   payment-ack    -> a payment becomes ACKNOWLEDGED.
//   close-confirm  -> JOB_CLOSED.
//   CaaS verify    -> the ৳10 charge moves (money authorization).
// Reusing a verified session for any of these would collapse mutual
// confirmation — two sides, each confirming by their own code — into a
// single login. So ZERO OTP round-trips were removed: the cost saving
// in this item is the shorter SMS (see below), never a weaker gate.
// (The 402-before-OTP billing check already avoids burning a code on a
// refused confirm; that is the only "reuse" the flow has, and it
// predates this pass.)
// ---------------------------------------------------------------- agreement summary SMS + deadline nudge
// Event-label strings for the two new event types. The raw BN/EN strings
// live here in server code (Section 2 owns the client i18n dictionary);
// they travel in the event payload as labelEn/labelBn for that agent to
// wire into the dictionary. The timeline renders the type until then.
const SUMMARY_SMS_LABELS = { en: 'Agreement summary sent by SMS', bn: 'চুক্তির সারাংশ SMS-এ পাঠানো হয়েছে' };
const DEADLINE_PASSED_LABELS = { en: 'Deadline passed — a new deadline can be proposed', bn: 'শেষ তারিখ পার হয়েছে — নতুন তারিখ প্রস্তাব করা যাবে' };
const TRADE_BN = { ELECTRICIAN: 'ইলেকট্রিশিয়ান', PAINTER: 'পেইন্টার', PLUMBER: 'প্লাম্বার' };

// When a job becomes ACTIVE (both OTPs confirmed), send ONE Bangla SMS to
// BOTH parties via the existing SMS send path (the AppLink adapter —
// sandbox logs it, live sends it; the adapter itself is untouched):
// trade, agreed price, deadline, milestone count, the first 8 characters
// of the version fingerprint, ending with the record reference. Once
// only: the ACTIVE transition happens in two confirm handlers, so the
// SUMMARY_SMS_SENT event is the guard. An SMS failure never un-activates
// the job. Returns the exact text sent, or null when already sent.
//
// Item 14 (SMS cost) — STOPPED on the live text switch: the text below
// still carries the 36-character record UUID because the passing
// regression assertion pins `text.endsWith(job.id)`; switching to the
// short text (trade, price, deadline, short verify link — 3 segments
// down to 2) needs that assertion updated first (coordinator's call).
// What DID ship in this pass, without touching the text: the segment
// count is computed by server/src/sms.js (GSM 7-bit vs UCS-2) and logged
// per recipient in SmsLog, and the short code (first 8 fingerprint
// characters — the code /api/verify already resolves) is recorded in the
// event payload as shortCode, so the metrics view reads real numbers.
async function sendAgreementSummarySms(job) {
  const already = db.prepare(
    "SELECT 1 FROM Event WHERE job_id = ? AND type = 'SUMMARY_SMS_SENT' LIMIT 1"
  ).get(job.id);
  if (already) return null;
  const version = getCurrentVersion(job);
  if (!version) return null;
  const fp8 = shortCodeFor(version.fingerprint);
  const milestoneCount = milestonesOf(version).length;
  const tradeBn = TRADE_BN[job.trade] || job.trade;
  const text = 'DealCraft: আপনার কাজের রেকর্ড সক্রিয় হয়েছে — ' + tradeBn + ', ৳' + version.price
    + ', শেষ তারিখ ' + (version.deadline || '—') + ', ' + milestoneCount + 'টি মাইলস্টোন। ফিঙ্গারপ্রিন্ট: ' + fp8
    + '। রেকর্ড: ' + job.id;
  const segments = smsSegments(text);
  const hirer = db.prepare('SELECT phone FROM User WHERE id = ?').get(job.hirer_id);
  const adapter = getAdapter();
  const to = [...new Set([hirer && hirer.phone, job.worker_phone].filter(Boolean))];
  for (const phone of to) {
    try {
      await adapter.sendSms(phone, text);
      // Log only sends that actually went out — a failed send is not a
      // segment spent, and the metrics view must not bill it.
      db.prepare(
        'INSERT INTO SmsLog (job_id, kind, segments, created_at) VALUES (?, ?, ?, ?)'
      ).run(job.id, 'summary', segments, now());
    } catch (_e) { /* SMS failure must not un-activate the job */ }
  }
  addEvent(job.id, 'SUMMARY_SMS_SENT', 'system', {
    to, version: version.version_no, fingerprint8: fp8, shortCode: fp8,
    segments, text,
    labelEn: SUMMARY_SMS_LABELS.en, labelBn: SUMMARY_SMS_LABELS.bn,
  });
  return text;
}

// Deadline nudge — never enforcement: no penalties, no auto-charges, no
// status change. When an ACTIVE job passes its deadline with no close,
// record DEADLINE_PASSED once and notify both parties (in-app via the
// event on the timeline, plus one SMS each via the existing send path).
// Runs on server start, every 15 minutes, and on every job-detail read
// (cheap: one ACTIVE-jobs scan; the event-exists guard makes it idempotent).
async function checkDeadlines() {
  // Dhaka date, not UTC: a deadline that passed in Dhaka has passed,
  // even when UTC still shows the day before.
  const today = dhakaToday();
  const jobs = db.prepare("SELECT * FROM Job WHERE status = 'ACTIVE'").all();
  for (const job of jobs) {
    const version = getCurrentVersion(job);
    if (!version || !version.deadline || version.deadline >= today) continue;
    // Once per DEADLINE, not once per job ever: a ChangeLock extension
    // that sets a new deadline re-arms the nudge for that new deadline.
    // A DEADLINE_PASSED event only blocks the deadline it was fired for.
    const firedForThisDeadline = db.prepare(
      "SELECT payload_json FROM Event WHERE job_id = ? AND type = 'DEADLINE_PASSED'"
    ).all(job.id).some((row) => {
      try { return JSON.parse(row.payload_json || '{}').deadline === version.deadline; }
      catch (_e) { return false; }
    });
    if (firedForThisDeadline) continue;
    addEvent(job.id, 'DEADLINE_PASSED', 'system', {
      deadline: version.deadline, version: version.version_no,
      labelEn: DEADLINE_PASSED_LABELS.en, labelBn: DEADLINE_PASSED_LABELS.bn,
    });
    const tradeBn = TRADE_BN[job.trade] || job.trade;
    const text = 'DealCraft: ' + tradeBn + ' কাজের শেষ তারিখ (' + version.deadline + ') পার হয়ে গেছে। কোনো জরিমানা বা চার্জ নেই — অ্যাপে ChangeLock থেকে নতুন তারিখ প্রস্তাব করুন। রেকর্ড: ' + job.id;
    const segments = smsSegments(text);
    const hirer = db.prepare('SELECT phone FROM User WHERE id = ?').get(job.hirer_id);
    const adapter = getAdapter();
    for (const phone of [...new Set([hirer && hirer.phone, job.worker_phone].filter(Boolean))]) {
      try {
        await adapter.sendSms(phone, text);
        db.prepare(
          'INSERT INTO SmsLog (job_id, kind, segments, created_at) VALUES (?, ?, ?, ?)'
        ).run(job.id, 'nudge', segments, now());
      } catch (_e) { /* nudge SMS failure is not fatal */ }
    }
  }
}
// Mask a phone number for display: 01700000001 -> 017******001.
// AppLink log entries carry phone numbers and message text; the log is
// hirer-auth only and never returns a full phone number.
function maskPhoneInText(s) {
  // Bangladeshi mobile: 0 + 1[3-9] + 5 digits + 3 digits = 11 chars
  // (or 880 + the same 10 digits = 13 chars). The old pattern took a
  // 3-digit head, so it needed 12 chars and never matched a real number.
  return String(s).replace(/(\+?880|0)?(1[3-9])(\d{5})(\d{3})/g,
    (m, p, head, _mid, tail) => (p || '0') + head + '******' + tail);
}

// Sensitive values never leave the server in a log entry: any key that
// looks like a token, OTP, code, password or secret is replaced wholesale,
// and worker-link tokens embedded in SMS text are redacted too. Phone
// numbers are masked as well. The full diagnostic log stays server-side
// only (server/data/applink-log.jsonl).
const SENSITIVE_KEY = /(token|otp|code|password|passwd|secret|api[-_]?key|auth)/i;
function maskLogEntry(e) {
  const out = JSON.parse(JSON.stringify(e));
  const scrubText = (s) => maskPhoneInText(s)
    .replace(/([?&]token=)[^&\s"']+/g, '$1[redacted]')
    .replace(/(token[=:]\s*)[^\s"',}]+/gi, '$1[redacted]');
  const scrub = (v, key) => {
    if (key && SENSITIVE_KEY.test(key)) return '[redacted]';
    if (typeof v === 'string') return scrubText(v);
    if (Array.isArray(v)) return v.map((x) => scrub(x));
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = scrub(val, k);
      return o;
    }
    return v;
  };
  if (out.request) out.request = scrub(out.request);
  if (out.response) out.response = scrub(out.response);
  delete out.ownerPhone; // internal scoping field — never exposed
  return out;
}

// ---------------------------------------------------------------- photos
// Magic bytes, not the client-supplied MIME type: a text file renamed
// .png (or sent with image/png) is rejected. PNG / JPEG / GIF / WebP only.
// Returns the image MIME type derived from the magic bytes, or null.
function imageMime(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (n >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'; // PNG
    if (n >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'; // JPEG
    if (n >= 6 && buf.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'; // GIF89a
    if (n >= 6 && buf.subarray(0, 6).toString('ascii') === 'GIF87a') return 'image/gif'; // GIF87a
    if (n >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'; // WebP
    return null;
  } catch (_e) { return null; }
}
function isRealImage(filePath) {
  return imageMime(filePath) !== null;
}
// Serve a photo with an explicit Content-Type derived from its validated
// magic bytes — never application/octet-stream (the stored files have no
// extension, so sendFile would guess octet-stream), and never the
// client-supplied MIME type.
function servePhoto(res, file) {
  const filePath = path.join(UPLOADS_DIR, file);
  const mime = imageMime(filePath);
  if (!mime) return err(res, 404, 'photo not found');
  const buf = fs.readFileSync(filePath);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
}
// Multer's dest storage already generates random filenames (32 hex chars);
// nothing here ever trusts a client-supplied filename.
// Retention: photos live in uploads/ alongside the record they belong to
// and are deleted with nothing automatic yet — see README (planned: a
// retention/deletion pass in the production sprint).
const MAX_PHOTOS_PER_JOB = 10;

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('only image files are accepted'));
  },
});

// ---------------------------------------------------------------- find a repairer
// Photo + nearby bidding, as a SEPARATE mode feeding into the record flow.
// A bid alone is never an agreement: picking a bid creates a normal Job
// (pre-filled from the bid) which still needs FairScope + DUAL OTP
// confirmation before it can become ACTIVE. No money is held, no payment
// is guaranteed, and there are no star ratings or worker scores anywhere.
// Bidding history lives in the same append-only Event log: events are
// written under the bid-job id while bidding is open, and on acceptance
// the full history is copied onto the new Job's timeline (never edited,
// only appended). Closing without a hire is also an event.
const MAX_BID_PHOTOS = 3;
const MAX_LIVE_BIDS_PER_JOB = 10;
const BID_TTL_MS = 24 * 60 * 60 * 1000;

function getBidJob(id) {
  return db.prepare('SELECT * FROM BidJob WHERE id = ?').get(id) || null;
}

function bidJobPhotos(bidJobId) {
  return db.prepare('SELECT * FROM BidJobPhoto WHERE bid_job_id = ? ORDER BY taken_at ASC').all(bidJobId);
}

// Lazily expire LIVE bids whose 24-hour window has passed. No cron: every
// read/write of bids runs this first, so an expired bid can never be
// accepted or shown as live.
function expireBids(bidJobId) {
  db.prepare("UPDATE Bid SET status = 'EXPIRED' WHERE bid_job_id = ? AND status = 'LIVE' AND expires_at <= ?")
    .run(bidJobId, now());
}

function addBiddingEvent(bidJobId, type, actor, payload) {
  return addEvent(bidJobId, type, actor, payload);
}

// Public listing shape: photos, trade, description, distance, site area —
// never the hirer's name or phone. Distance is computed from the viewer's
// coordinates when supplied; otherwise it is null and jobs sort newest-first.
function bidJobPublic(b, viewerLat, viewerLng) {
  const photos = bidJobPhotos(b.id).map((p) => p.url);
  let distanceKm = null;
  if (viewerLat != null && viewerLng != null && b.site_lat != null && b.site_lng != null) {
    distanceKm = Math.round(haversineKm(viewerLat, viewerLng, b.site_lat, b.site_lng) * 100) / 100;
  }
  const bidCount = db.prepare("SELECT COUNT(*) AS n FROM Bid WHERE bid_job_id = ? AND status = 'LIVE'").get(b.id).n;
  return {
    id: b.id, trade: b.trade, description: b.description, deadline: b.deadline || null,
    site: b.site_lat != null ? { lat: b.site_lat, lng: b.site_lng, address: b.site_address || null } : null,
    siteArea: b.site_address || null, status: b.status, photos, distanceKm, bidCount,
    created_at: b.created_at,
  };
}

function bidPublic(bid, site) {
  let distanceKm = null;
  if (bid.worker_lat != null && bid.worker_lng != null && site && site.lat != null && site.lng != null) {
    distanceKm = Math.round(haversineKm(bid.worker_lat, bid.worker_lng, site.lat, site.lng) * 100) / 100;
  }
  // WorkPassport facts only — completed jobs + trades. No scores, no stars.
  const pass = passportData(bid.worker_phone);
  return {
    id: bid.id, workerPhone: bid.worker_phone, workerName: bid.worker_name || undefined,
    amount: bid.amount, note: bid.note || null, earliestStart: bid.earliest_start || null,
    status: bid.status, distanceKm, created_at: bid.created_at, expires_at: bid.expires_at,
    passport: { completedJobs: pass.completedJobs, trades: pass.trades },
  };
}

function parseBidCoords(req) {
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : null;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : null;
  if (lat == null || lng == null) return { lat: null, lng: null };
  if (!validLatLng(lat, lng)) return { error: 'lat/lng are out of range' };
  return { lat, lng };
}

// ---------------------------------------------------------------- resolve pack
function resolvePackData(job) {
  return jobDetail(job);
}
// ---------------------------------------------------------------- passport
// WorkPassport is WORKER-OWNED: only the worker (via their job token) may
// publish a closed job and choose what is shown (amounts / client /
// photos — photos are private by default). A hirer can never publish or
// expose the worker's data. The public identifier is a random profile id,
// never the worker's phone number: no phone appears in the public URL,
// the public API, or the public page.
function getOrCreateProfileId(workerPhone) {
  const existing = db.prepare('SELECT profile_id FROM PassportProfile WHERE worker_phone = ?').get(workerPhone);
  if (existing) return existing.profile_id;
  const profileId = 'pp_' + newId().replace(/-/g, '').slice(0, 24);
  db.prepare('INSERT INTO PassportProfile (profile_id, worker_phone, created_at) VALUES (?, ?, ?)')
    .run(profileId, workerPhone, now());
  return profileId;
}

function profilePhone(profileId) {
  const row = db.prepare('SELECT worker_phone FROM PassportProfile WHERE profile_id = ?').get(profileId);
  return row ? row.worker_phone : null;
}

function passportData(workerPhone) {
  const worker = db.prepare('SELECT name FROM User WHERE phone = ?').get(workerPhone);
  const entries = db.prepare('SELECT * FROM PassportEntry WHERE worker_phone = ? ORDER BY created_at ASC').all(workerPhone);
  const jobs = entries.map((e) => {
    const job = getJob(e.job_id);
    if (!job) return null;
    // Anti-gaming (Ceiling Pass, Part 2, item 11): a job counts toward
    // the passport ONLY if it was closed with BOTH sides' confirmation.
    // /api/passport/add already 409s hirer-only closes, but the COUNT
    // must not trust that alone — an entry for a job that was never
    // mutually closed (or is not CLOSED at all) is excluded here, so NO
    // path — API, cached count, bid facts — can count a forced close.
    if (job.status !== 'CLOSED') return null;
    const closedEv = db.prepare(
      "SELECT payload_json FROM Event WHERE job_id = ? AND type = 'JOB_CLOSED' ORDER BY id ASC LIMIT 1"
    ).get(e.job_id);
    let hirerOnlyClose = false;
    try { hirerOnlyClose = JSON.parse(closedEv ? closedEv.payload_json || '{}' : '{}').hirerOnly === true; } catch (_e) {}
    if (hirerOnlyClose) return null;
    const hirer = db.prepare('SELECT name FROM User WHERE id = ?').get(job.hirer_id);
    // Completion time is when the job actually closed (JOB_CLOSED event),
    // not when it was created.
    const closed = db.prepare("SELECT created_at FROM Event WHERE job_id = ? AND type = 'JOB_CLOSED' ORDER BY id ASC LIMIT 1").get(e.job_id);
    return {
      jobId: e.job_id,
      trade: job.trade,
      hirerId: job.hirer_id,
      completedAt: closed ? closed.created_at : job.created_at,
      showAmounts: !!e.show_amounts,
      showClient: !!e.show_client,
      showPhotos: !!e.show_photos,
      amount: e.show_amounts ? (getCurrentVersion(job) || {}).price : undefined,
      // Client name and photos are disclosed ONLY when the worker explicitly enabled them.
      clientName: e.show_client ? (hirer ? hirer.name : undefined) : undefined,
      photoUrls: e.show_photos
        ? db.prepare('SELECT url FROM Photo WHERE job_id = ? ORDER BY taken_at ASC').all(e.job_id).map((p) => p.url)
        : undefined,
    };
  }).filter(Boolean);
  const trades = [...new Set(jobs.map((j) => j.trade))];
  // Distinct hirers: ten jobs for one cousin is visibly different from
  // ten jobs for ten customers. The hirer id is an internal key — it is
  // counted here and never returned in the public shape.
  const distinctHirers = new Set(jobs.map((j) => j.hirerId)).size;
  const publicEntries = jobs.map((j) => {
    const { hirerId, ...rest } = j;
    return rest;
  });
  // The worker's name comes from the User table — the phone number is an
  // identifier, not a name, and must not be shown as one. No phone number
  // is returned in the public shape at all.
  return { profileId: getOrCreateProfileId(workerPhone), workerName: worker ? worker.name : undefined, trades, completedJobs: publicEntries.length, distinctHirers, entries: publicEntries };
}
// ---------------------------------------------------------------- applink callbacks
// Callback endpoints named in APPLINK-APP-CREATION.md (Callback URL).
// They only ever log (masked) and update local state where that is safe:
// a delivery report is recorded in the server log; an MO SMS is logged
// and answered 200 (DealCraft does not act on plain-SMS replies yet —
// worker replies by SMS are a planned feature, not a live one); a
// subscription notification updates the local subscription row only when
// it names a phone we already have a subscription for. Nothing here
// trusts the caller: payloads are logged masked, never executed.
function applinkCallback(req, res, kind, handler) {
  const body = req.body || {};
  appendLogSafe(kind, body);
  try { handler(body); } catch (_e) { /* log-only callback: never 500 */ }
  res.json({ ok: true, received: kind });
}
function appendLogSafe(api, body) {
  try {
    const { appendLog } = require('./applink/log');
    appendLog({ api, request: body, response: { received: true }, mode: getMode() });
  } catch (_e) { /* logging must never break a callback */ }
}

module.exports = {
  db,
  init,
  now,
  setPendingProfile,
  takePendingProfile,
  createEventTriggers,
  DATA_DIR,
  fingerprint,
  smsSegments,
  shortCodeFor,
  eventHash,
  verifyChain,
  chainHeadOf,
  GENESIS,
  randomToken,
  newId,
  expiryDate,
  FAIRSCOPE_QUESTIONS,
  questionsFor,
  computeMissingTerms,
  validateSkippedTerms,
  getAdapter,
  getMode,
  resetRateLimits,
  readLog,
  LOG_PATH,
  BIDDING_ENABLED,
  requireBidding,
  UPLOADS_DIR,
  PUBLIC_DIR,
  err,
  baseUrl,
  escapeHtml,
  addEvent,
  getJob,
  getVersions,
  getCurrentVersion,
  parseScopeJson,
  milestonesOf,
  milestoneStatus,
  jobDetail,
  createWorkerToken,
  findWorkerToken,
  workerTokenForJob,
  authedUser,
  otpError,
  normalizeBdPhone,
  MAX_JOB_PRICE,
  vmsg,
  dhakaToday,
  isRealDateString,
  validateScope,
  validatePrice,
  validateDeadline,
  validateMilestones,
  rescaleMilestones,
  hasActiveSubscription,
  billingSatisfied,
  feeStateForJob,
  isLoopback,
  demoAllowed,
  requireAuth,
  requireJobAccess,
  actorOf,
  sideOf,
  haversineKm,
  getLocationShare,
  clearLocation,
  jobSite,
  recentSpeedKmh,
  locationView,
  validLatLng,
  upsertUser,
  SUMMARY_SMS_LABELS,
  DEADLINE_PASSED_LABELS,
  TRADE_BN,
  sendAgreementSummarySms,
  checkDeadlines,
  maskPhoneInText,
  maskLogEntry,
  imageMime,
  isRealImage,
  servePhoto,
  MAX_PHOTOS_PER_JOB,
  upload,
  getBidJob,
  bidJobPhotos,
  expireBids,
  addBiddingEvent,
  bidJobPublic,
  bidPublic,
  parseBidCoords,
  MAX_BID_PHOTOS,
  MAX_LIVE_BIDS_PER_JOB,
  BID_TTL_MS,
  resolvePackData,
  getOrCreateProfileId,
  profilePhone,
  passportData,
  applinkCallback,
  appendLogSafe,
};
