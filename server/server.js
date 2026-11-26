// DealCraft backend — Express + built-in node:sqlite.
//
// DealCraft is a mutually confirmed digital work record for informal jobs
// in Bangladesh (electrician / painter / plumber). It is NOT a contract
// service: DealCraft holds no money, does not guarantee payment, and this
// record is not a legal document. Payment entries here are acknowledgements
// only. AppLink reaches Banglalink subscribers only.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const { db, init, now, clearAllTables, DATA_DIR } = require('./src/db');
const { fingerprint } = require('./src/fingerprint');
const { randomToken, newId, expiryDate } = require('./src/tokens');
const { FAIRSCOPE_QUESTIONS, questionsFor, computeMissingTerms } = require('./src/fairscope');
const { getAdapter, getMode } = require('./src/applink');
const { readLog, LOG_PATH } = require('./src/applink/log');

init();

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (fs.existsSync(PUBLIC_DIR)) app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------------------------------------------------------------- helpers
function err(res, status, message) {
  return res.status(status).json({ error: message });
}

function baseUrl(req) {
  return req.protocol + '://' + req.get('host');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function addEvent(jobId, type, actor, payload) {
  db.prepare(
    'INSERT INTO Event (job_id, type, actor, payload_json, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(jobId, type, actor || null, payload ? JSON.stringify(payload) : null, now());
  return db.prepare('SELECT * FROM Event ORDER BY id DESC LIMIT 1').get();
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
  const payments = db.prepare('SELECT * FROM Payment WHERE job_id = ? ORDER BY created_at ASC').all(job.id);
  const photos = db.prepare('SELECT * FROM Photo WHERE job_id = ? ORDER BY taken_at ASC').all(job.id);
  const disputes = db.prepare('SELECT * FROM Dispute WHERE job_id = ? ORDER BY created_at ASC').all(job.id)
    .map((d) => ({
      ...d,
      statements: db.prepare('SELECT * FROM DisputeStatement WHERE dispute_id = ? ORDER BY created_at ASC').all(d.id),
    }));
  const milestones = current ? milestoneStatus(job.id, milestonesOf(current)) : [];
  const agreed = current ? current.price : 0;
  const acknowledgedPaid = payments
    .filter((p) => p.ack_status === 'ACKNOWLEDGED')
    .reduce((sum, p) => sum + p.amount, 0);
  // The hirer needs the worker link for the detail view (and for the
  // ResolvePack download, which opens in a new tab without an auth header).
  const wt = db.prepare('SELECT * FROM WorkerToken WHERE job_id = ? ORDER BY expires_at DESC LIMIT 1').get(job.id);
  return {
    job: { ...job, workerLink: wt ? '/worker.html?token=' + wt.token : null },
    versions: versions.map((v) => ({ ...v, scope: parseScopeJson(v) })),
    events,
    payments,
    photos,
    milestones,
    balance: { agreed, acknowledgedPaid, remaining: agreed - acknowledgedPaid },
    disputes,
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

function billingSatisfied(job) {
  if (job.billing_paid) return true;
  const hirer = db.prepare('SELECT phone FROM User WHERE id = ?').get(job.hirer_id);
  return hirer ? hasActiveSubscription(hirer.phone) : false;
}

// Demo endpoints (seed/reset wipe the whole database) must never be
// reachable on a public server: in production they do not exist (404).
// Outside production they are allowed only when the caller proves it is
// local — either the request really comes from the loopback interface, or
// it carries the configured DEALCRAFT_DEMO_TOKEN (x-demo-token header or
// demoToken body/query field). A missing token is NOT an open door: a
// non-loopback request without the token is refused. Deployments must set
// NODE_ENV=production.
function isLoopback(req) {
  const a = req.socket && req.socket.remoteAddress;
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function demoAllowed(req, res) {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
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

// ---------------------------------------------------------------- health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: getMode(), db: 'sqlite' });
});

app.get('/api/fairscope', (req, res) => {
  res.json({ questions: FAIRSCOPE_QUESTIONS });
});

app.get('/api/applink/mode', (req, res) => {
  // credentialsConfigured is a boolean only — no secret ever leaves the server.
  // The hero pill shows "Live" only when the mode is live AND credentials
  // are configured; anything else is shown as a sandbox demo.
  const live = getMode() === 'live';
  const credentialsConfigured = live
    && !!(process.env.APPLINK_APP_ID && (process.env.APPLINK_PASSWORD || process.env.APPLINK_API_KEY));
  res.json({ mode: getMode(), credentialsConfigured, note: 'AppLink reaches Banglalink subscribers only.' });
});

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

function maskLogEntry(e) {
  const out = JSON.parse(JSON.stringify(e));
  const scrub = (v) => {
    if (typeof v === 'string') return maskPhoneInText(v);
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = scrub(val);
      return o;
    }
    return v;
  };
  if (out.request) out.request = scrub(out.request);
  if (out.response) out.response = scrub(out.response);
  return out;
}

app.get('/api/applink/log', (req, res) => {
  const user = authedUser(req);
  if (!user) return err(res, 401, 'authentication required');
  res.json({ entries: readLog(50).map(maskLogEntry) });
});

// ---------------------------------------------------------------- auth
app.post('/api/auth/request-otp', async (req, res) => {
  const { phone, name, role, purpose } = req.body || {};
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return err(res, 400, 'phone must be a Bangladesh mobile number (01XXXXXXXXX)');
  if (name || role) upsertUser(normalized, name, role);
  const adapter = getAdapter();
  try {
    const result = await adapter.sendOtp(normalized, purpose || 'login');
    const out = { ok: true, via: adapter.mode === 'sandbox' ? 'applink-otp-sandbox' : 'applink-otp-live' };
    if (adapter.mode === 'sandbox') {
      out.sandbox = { otp: result.code, note: 'SANDBOX — not a live AppLink call' };
    }
    return res.json(out);
  } catch (e) {
    return otpError(res, e);
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, code } = req.body || {};
  if (!phone || !code) return err(res, 400, 'phone and code are required');
  const adapter = getAdapter();
  let ok = false;
  try {
    ok = await adapter.verifyOtp(phone, String(code), 'login');
  } catch (e) {
    return otpError(res, e);
  }
  if (!ok) return err(res, 401, 'invalid or expired code');
  const user = upsertUser(phone, null, null);
  const token = randomToken();
  // Sessions last 7 days; authedUser() rejects anything older.
  db.prepare('INSERT INTO Session (id, token, phone, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(newId(), token, phone, now(), expiryDate(7));
  res.json({ ok: true, token, user });
});

app.get('/api/me', (req, res) => {
  const user = authedUser(req);
  if (!user) return err(res, 401, 'authentication required');
  res.json({ user });
});

// ---------------------------------------------------------------- jobs
app.post('/api/jobs', requireAuth, async (req, res) => {
  const { trade, workerPhone, workerName, scope, price, deadline, milestones, answers, skippedTerms, site } = req.body || {};
  if (!trade || !questionsFor(trade).length) return err(res, 400, 'trade must be one of ELECTRICIAN, PAINTER, PLUMBER');
  const workerPhoneNorm = normalizeBdPhone(workerPhone);
  if (!workerPhoneNorm) return err(res, 400, 'workerPhone must be a Bangladesh mobile number (01XXXXXXXXX)');
  if (typeof price !== 'number' || price <= 0) return err(res, 400, 'price must be a positive number (BDT)');
  // Job site is optional: map pin / current location / pasted address text.
  // Without a site, location sharing still works — there is just no
  // destination, distance or ETA.
  let siteLat = null, siteLng = null, siteAddress = null;
  if (site != null && (site.lat != null || site.lng != null || site.address)) {
    if (site.lat != null || site.lng != null) {
      if (!validLatLng(site.lat, site.lng)) return err(res, 400, 'site lat/lng are out of range');
      siteLat = site.lat; siteLng = site.lng;
    }
    if (site.address != null && typeof site.address === 'string') siteAddress = site.address.slice(0, 200);
  }
  const tradeKey = trade.toUpperCase();
  const missingTerms = computeMissingTerms(tradeKey, answers || {}, skippedTerms || []);
  const jobId = newId();
  const scopeDoc = {
    scope: scope ?? '',
    milestones: Array.isArray(milestones) ? milestones : [],
    answers: answers || {},
    skippedTerms: skippedTerms || [],
  };
  db.prepare(
    'INSERT INTO Job (id, hirer_id, worker_phone, worker_name, trade, status, current_version, site_lat, site_lng, site_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(jobId, req.user.id, workerPhoneNorm, workerName || null, tradeKey, 'DRAFT', 1, siteLat, siteLng, siteAddress, now());
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope: scopeDoc.scope, price, deadline: deadline || null });
  db.prepare(
    'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), jobId, 1, JSON.stringify(scopeDoc), price, deadline || null, fp, now());
  addEvent(jobId, 'AGREEMENT_CREATED', 'hirer:' + req.user.phone, {
    trade: tradeKey, price, deadline: deadline || null, missingTerms,
  });
  upsertUser(workerPhoneNorm, workerName || null, 'worker');
  const workerToken = createWorkerToken(jobId, 'view');
  const workerLink = '/worker.html?token=' + workerToken;
  const job = getJob(jobId);
  const version = getCurrentVersion(job);
  // Notify the worker by SMS (sandbox: logged, no real SMS sent).
  let workerSms = null;
  try {
    const adapter = getAdapter();
    workerSms = await adapter.sendSms(
      workerPhoneNorm,
      'DealCraft: ' + req.user.name + ' created a work record for ' + tradeKey.toLowerCase() +
      ' work (BDT ' + price + '). Review it here: ' + baseUrl(req) + workerLink +
      ' — DealCraft holds no money; this record is not a legal document.'
    );
  } catch (_e) {
    workerSms = { status: 'FAILED' };
  }
  res.status(201).json({ job, version, missingTerms, workerLink, workerSms });
});

app.get('/api/jobs', requireAuth, (req, res) => {
  const jobs = db.prepare('SELECT * FROM Job WHERE hirer_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ jobs });
});

app.get('/api/jobs/:id', requireJobAccess, (req, res) => {
  res.json(jobDetail(req.job));
});

app.post('/api/jobs/:id/hirer-confirm', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer can confirm');
  const { otpCode } = req.body || {};
  if (!otpCode) return err(res, 400, 'otpCode is required');
  const adapter = getAdapter();
  let ok = false;
  try { ok = await adapter.verifyOtp(req.user.phone, String(otpCode), 'hirer-confirm'); }
  catch (e) { return otpError(res, e); }
  if (!ok) return err(res, 401, 'invalid or expired code');
  const workerConfirmed = db.prepare(
    "SELECT 1 FROM Event WHERE job_id = ? AND type = 'CONFIRMED_BY_WORKER' LIMIT 1"
  ).get(job.id);
  // This confirm would activate the job: the ৳10 record fee (or an ACTIVE
  // ৳70/month subscription) must be settled first. The first confirm alone
  // only moves DRAFT -> PENDING and is not gated.
  if (workerConfirmed && !billingSatisfied(job)) {
    return err(res, 402, 'record fee unpaid — pay ৳10 via CaaS or subscribe ৳70/month before the job can become ACTIVE');
  }
  addEvent(job.id, 'CONFIRMED_BY_HIRER', 'hirer:' + req.user.phone, {});
  const status = workerConfirmed ? 'ACTIVE' : 'PENDING';
  db.prepare('UPDATE Job SET status = ? WHERE id = ?').run(status, job.id);
  res.json({ job: getJob(job.id) });
});

// ---------------------------------------------------------------- worker
app.get('/api/worker/:token', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const detail = jobDetail(job);
  // Never expose hirer OTP codes or secrets here; detail contains only the record.
  res.json({ job: detail.job, version: getCurrentVersion(job), events: detail.events, balance: detail.balance, milestones: detail.milestones, payments: detail.payments });
});

app.post('/api/worker/:token/request-otp', async (req, res) => {
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

app.post('/api/worker/:token/confirm', async (req, res) => {
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
  res.json({ job: getJob(job.id) });
});

// ---------------------------------------------------------------- live location
// Worker side: token-authenticated. Sharing is opt-in per job, off by
// default, and only while the job is ACTIVE. Stop/pause any time.
app.post('/api/worker/:token/location/start', (req, res) => {
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

app.post('/api/worker/:token/location/pause', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const share = getLocationShare(job.id);
  if (!share || !share.sharing_on) return err(res, 404, 'location sharing is not on');
  db.prepare('UPDATE LocationShare SET paused = 1, updated_at = ? WHERE job_id = ?').run(now(), job.id);
  res.json({ ok: true, sharing: true, paused: true });
});

app.post('/api/worker/:token/location/resume', (req, res) => {
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

app.post('/api/worker/:token/location/stop', (req, res) => {
  const wt = findWorkerToken(req.params.token);
  if (!wt) return err(res, 401, 'invalid or expired worker token');
  const job = getJob(wt.job_id);
  if (!job) return err(res, 404, 'job not found');
  const share = getLocationShare(job.id);
  if (!share || !share.sharing_on) return err(res, 404, 'location sharing is not on');
  clearLocation(job.id);
  res.json({ ok: true, sharing: false });
});

app.post('/api/worker/:token/location', async (req, res) => {
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
      addEvent(job.id, 'ARRIVED_ON_SITE', 'worker:' + job.worker_phone, {
        lat, lng, accuracy: accuracy ?? null, simulated: !!simulated, arrivedAt: ts,
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

// Hirer side: only that job's hirer, only while sharing is on and the job
// is ACTIVE — 404 otherwise (so a stopped/closed job leaks no location).
app.get('/api/jobs/:id/location', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 404, 'job not found');
  if (job.status !== 'ACTIVE') return err(res, 404, 'location is not being shared');
  const view = locationView(job);
  if (!view) return err(res, 404, 'location is not being shared');
  res.json(view);
});

// ---------------------------------------------------------------- worker link resend
// The hirer can always see the worker link and resend it (the old UI only
// showed it in sandbox mode, so a failed live SMS left the hirer with no
// way to reach the worker). Reuses the latest live token, or mints a new
// one when the old one expired.
app.post('/api/jobs/:id/worker-link', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer resends the worker link');
  const wt = db.prepare('SELECT * FROM WorkerToken WHERE job_id = ? ORDER BY expires_at DESC LIMIT 1').get(job.id);
  let token = wt && new Date(wt.expires_at).getTime() > Date.now() ? wt.token : null;
  if (!token) token = createWorkerToken(job.id, 'view');
  const workerLink = '/worker.html?token=' + token;
  let workerSms = null;
  try {
    const adapter = getAdapter();
    workerSms = await adapter.sendSms(
      job.worker_phone,
      'DealCraft: review your work record here: ' + baseUrl(req) + workerLink
      + ' — DealCraft holds no money; this record is not a legal document.'
    );
  } catch (_e) {
    workerSms = { status: 'FAILED' };
  }
  res.json({ workerLink, workerSms });
});

// ---------------------------------------------------------------- changes
app.post('/api/jobs/:id/changes', requireJobAccess, (req, res) => {
  const job = req.job;
  const { priceDelta, deadline, reason, details } = req.body || {};
  if (typeof priceDelta !== 'number' && !deadline && !details) {
    return err(res, 400, 'priceDelta, deadline or details is required');
  }
  const changeId = newId();
  db.prepare(
    'INSERT INTO ChangeProposal (id, job_id, proposed_by, price_delta, deadline, reason, details_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(changeId, job.id, sideOf(req, job), priceDelta || 0, deadline || null, reason || null,
    details ? JSON.stringify(details) : null, 'PENDING', now());
  addEvent(job.id, 'CHANGE_PROPOSED', actorOf(req, job), {
    changeId, priceDelta: priceDelta || 0, deadline: deadline || null, reason: reason || null,
  });
  const change = db.prepare('SELECT * FROM ChangeProposal WHERE id = ?').get(changeId);
  const wt = db.prepare('SELECT * FROM WorkerToken WHERE job_id = ? ORDER BY expires_at DESC LIMIT 1').get(job.id);
  const notifyLink = sideOf(req, job) === 'hirer' && wt
    ? '/worker.html?token=' + wt.token
    : '/api/jobs/' + job.id;
  res.status(201).json({ change, notifyLink });
});

app.post('/api/changes/:changeId/respond', async (req, res) => {
  const change = db.prepare('SELECT * FROM ChangeProposal WHERE id = ?').get(req.params.changeId);
  if (!change) return err(res, 404, 'change proposal not found');
  if (change.status !== 'PENDING') return err(res, 400, 'change proposal already ' + change.status.toLowerCase());
  const job = getJob(change.job_id);
  if (!job) return err(res, 404, 'job not found');
  const user = authedUser(req);
  const wt = workerTokenForJob(req, job.id);
  const isHirer = user && user.id === job.hirer_id;
  const isWorker = !!wt;
  if (!isHirer && !isWorker) return err(res, 401, 'authentication required');
  const side = isWorker ? 'worker' : 'hirer';
  const { decision, otpCode, note } = req.body || {};
  if (!['accept', 'reject', 'clarify'].includes(decision)) {
    return err(res, 400, "decision must be 'accept', 'reject' or 'clarify'");
  }
  // Mutual means mutual: the side that proposed a change cannot accept or
  // reject it themselves — only the other side decides. (Asking for
  // clarification changes nothing, so either side may do that.)
  if (change.proposed_by === side && (decision === 'accept' || decision === 'reject')) {
    return err(res, 403, 'you proposed this change — the other side must accept or reject it');
  }
  if (side === 'worker' && (decision === 'accept' || decision === 'reject')) {
    if (!otpCode) return err(res, 400, 'otpCode is required for the worker to respond');
    const adapter = getAdapter();
    let ok = false;
    try { ok = await adapter.verifyOtp(job.worker_phone, String(otpCode), 'change-approve'); }
    catch (e) { return otpError(res, e); }
    if (!ok) return err(res, 401, 'invalid or expired code');
  }

  if (decision === 'accept') {
    const current = getCurrentVersion(job);
    const prevScope = parseScopeJson(current);
    let details = {};
    try { details = JSON.parse(change.details_json || '{}'); } catch (_e) {}
    const newScope = { ...prevScope };
    if (details.scope !== undefined) {
      newScope.scope = details.scope;
    }
    if (Array.isArray(details.milestones)) newScope.milestones = details.milestones;
    if (details.answers) newScope.answers = { ...(prevScope.answers || {}), ...details.answers };
    const newPrice = current.price + (change.price_delta || 0);
    const newDeadline = change.deadline || current.deadline;
    const newVersionNo = job.current_version + 1;
    const fp = fingerprint({ job_id: job.id, version_no: newVersionNo, scope: newScope.scope, price: newPrice, deadline: newDeadline });
    db.prepare(
      'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(newId(), job.id, newVersionNo, JSON.stringify(newScope), newPrice, newDeadline, fp, now());
    db.prepare('UPDATE Job SET current_version = ? WHERE id = ?').run(newVersionNo, job.id);
    db.prepare("UPDATE ChangeProposal SET status = 'APPROVED' WHERE id = ?").run(change.id);
    addEvent(job.id, 'CHANGE_APPROVED', side + ':' + (side === 'worker' ? job.worker_phone : user.phone), {
      changeId: change.id, version: newVersionNo, price: newPrice, deadline: newDeadline,
    });
  } else if (decision === 'reject') {
    db.prepare("UPDATE ChangeProposal SET status = 'REJECTED' WHERE id = ?").run(change.id);
    addEvent(job.id, 'CHANGE_REJECTED', side + ':' + (side === 'worker' ? job.worker_phone : user.phone), {
      changeId: change.id, note: note || null,
    });
  } else {
    // clarify: the proposal leaves PENDING and is recorded as CLARIFICATION
    // — it is NOT re-emitted as a fresh CHANGE_PROPOSED, so the worker page
    // never mistakes a clarification for a new proposal.
    db.prepare("UPDATE ChangeProposal SET status = 'CLARIFICATION' WHERE id = ?").run(change.id);
    addEvent(job.id, 'CHANGE_CLARIFIED', side + ':' + (side === 'worker' ? job.worker_phone : user.phone), {
      changeId: change.id, clarification: note || 'clarification requested', priceDelta: change.price_delta,
    });
  }
  const updated = db.prepare('SELECT * FROM ChangeProposal WHERE id = ?').get(change.id);
  res.json({ change: updated, job: getJob(job.id) });
});

// ---------------------------------------------------------------- payments
app.post('/api/jobs/:id/payments', requireAuth, (req, res) => {
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

app.post('/api/payments/:paymentId/ack', async (req, res) => {
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

// ---------------------------------------------------------------- milestones
app.post('/api/jobs/:id/milestones/:index/complete', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  const wt = workerTokenForJob(req, job.id);
  if (!wt) return err(res, 401, 'a valid worker token is required');
  const index = Number(req.params.index);
  const version = getCurrentVersion(job);
  const milestones = milestonesOf(version);
  if (!Number.isInteger(index) || index < 0 || index >= milestones.length) {
    return err(res, 400, 'milestone index out of range');
  }
  const { note } = req.body || {};
  addEvent(job.id, 'MILESTONE_COMPLETED', 'worker:' + job.worker_phone, {
    index, title: milestones[index].title, note: note || null,
  });
  res.json({ job: getJob(job.id), milestones: milestoneStatus(job.id, milestones) });
});

app.post('/api/jobs/:id/milestones/:index/approve', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer approves milestones');
  const index = Number(req.params.index);
  const version = getCurrentVersion(job);
  const milestones = milestonesOf(version);
  if (!Number.isInteger(index) || index < 0 || index >= milestones.length) {
    return err(res, 400, 'milestone index out of range');
  }
  addEvent(job.id, 'MILESTONE_APPROVED', 'hirer:' + req.user.phone, {
    index, title: milestones[index].title,
  });
  res.json({ job: getJob(job.id), milestones: milestoneStatus(job.id, milestones) });
});

// ---------------------------------------------------------------- photos
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('only image files are accepted'));
  },
});

app.post('/api/jobs/:id/photos', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  const user = authedUser(req);
  const wt = workerTokenForJob(req, job.id);
  if (!(user && user.id === job.hirer_id) && !wt) return err(res, 401, 'authentication required');
  upload.single('photo')(req, res, (uploadErr) => {
    if (uploadErr) return err(res, 400, uploadErr.message);
    if (!req.file) return err(res, 400, "field 'photo' is required");
    const milestone = req.body.milestone !== undefined && req.body.milestone !== ''
      ? Number(req.body.milestone) : null;
    const kind = req.body.kind !== undefined && req.body.kind !== '' ? String(req.body.kind).toUpperCase() : null;
    if (kind !== null && kind !== 'BEFORE' && kind !== 'AFTER') {
      return err(res, 400, "kind must be 'BEFORE' or 'AFTER'");
    }
    const photoId = newId();
    const url = '/uploads/' + req.file.filename;
    db.prepare('INSERT INTO Photo (id, job_id, milestone, url, taken_at, kind) VALUES (?, ?, ?, ?, ?, ?)')
      .run(photoId, job.id, milestone, url, now(), kind);
    addEvent(job.id, 'PHOTO_ADDED', actorOf({ user, workerToken: wt }, job), {
      photoId, milestone, url, kind,
    });
    res.status(201).json({ photo: db.prepare('SELECT * FROM Photo WHERE id = ?').get(photoId) });
  });
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
    id: b.id, trade: b.trade, description: b.description,
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

// Hirer posts a job for bids: 1–3 problem photos, trade, short Bangla
// description, job site (map pin / current location / address). No price
// is set by the hirer — workers bid the price.
app.post('/api/bid-jobs', requireAuth, (req, res) => {
  const { trade, description, site } = req.body || {};
  if (!trade || !questionsFor(trade).length) return err(res, 400, 'trade must be one of ELECTRICIAN, PAINTER, PLUMBER');
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 500) {
    return err(res, 400, 'description is required (max 500 characters)');
  }
  let siteLat = null, siteLng = null, siteAddress = null;
  if (site != null && (site.lat != null || site.lng != null || site.address)) {
    if (site.lat != null || site.lng != null) {
      if (!validLatLng(site.lat, site.lng)) return err(res, 400, 'site lat/lng are out of range');
      siteLat = site.lat; siteLng = site.lng;
    }
    if (site.address != null && typeof site.address === 'string') siteAddress = site.address.slice(0, 200);
  }
  const bidJobId = newId();
  db.prepare(
    'INSERT INTO BidJob (id, hirer_id, trade, description, site_lat, site_lng, site_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(bidJobId, req.user.id, trade.toUpperCase(), description.trim(), siteLat, siteLng, siteAddress, 'OPEN', now());
  addBiddingEvent(bidJobId, 'BID_JOB_POSTED', 'hirer:' + req.user.phone, {
    trade: trade.toUpperCase(), description: description.trim(),
    site: siteLat != null ? { lat: siteLat, lng: siteLng, address: siteAddress } : null,
  });
  res.status(201).json({ bidJob: getBidJob(bidJobId) });
});

// Problem photos on a bid job: same 5 MB image-only upload as milestones,
// at most 3 per job. Hirer only.
app.post('/api/bid-jobs/:id/photos', requireAuth, (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  if (bidJob.hirer_id !== req.user.id) return err(res, 403, 'only the hirer adds photos to this bid job');
  if (bidJob.status !== 'OPEN') return err(res, 400, 'this bid job is no longer open');
  if (bidJobPhotos(bidJob.id).length >= MAX_BID_PHOTOS) {
    return err(res, 400, 'at most ' + MAX_BID_PHOTOS + ' photos per bid job');
  }
  upload.single('photo')(req, res, (uploadErr) => {
    if (uploadErr) return err(res, 400, uploadErr.message);
    if (!req.file) return err(res, 400, "field 'photo' is required");
    const photoId = newId();
    const url = '/uploads/' + req.file.filename;
    db.prepare('INSERT INTO BidJobPhoto (id, bid_job_id, url, taken_at) VALUES (?, ?, ?, ?)')
      .run(photoId, bidJob.id, url, now());
    addBiddingEvent(bidJob.id, 'BID_JOB_PHOTO_ADDED', 'hirer:' + req.user.phone, { photoId, url });
    res.status(201).json({ photo: db.prepare('SELECT * FROM BidJobPhoto WHERE id = ?').get(photoId) });
  });
});

// Open bid jobs, nearest first when the viewer shares a location;
// newest first otherwise (distance is then unavailable, and the UI says so).
app.get('/api/bid-jobs/open', requireAuth, (req, res) => {
  const coords = parseBidCoords(req);
  if (coords.error) return err(res, 400, coords.error);
  const rows = db.prepare("SELECT * FROM BidJob WHERE status = 'OPEN' ORDER BY created_at DESC").all();
  const out = rows.map((b) => bidJobPublic(b, coords.lat, coords.lng));
  if (coords.lat != null) {
    out.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }
  res.json({ bidJobs: out });
});

app.get('/api/bid-jobs/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM BidJob WHERE hirer_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({
    bidJobs: rows.map((b) => {
      expireBids(b.id);
      const live = db.prepare("SELECT COUNT(*) AS n FROM Bid WHERE bid_job_id = ? AND status = 'LIVE'").get(b.id).n;
      return { ...bidJobPublic(b, null, null), liveBids: live, jobId: b.job_id || null, photos: bidJobPhotos(b.id).map((p) => p.url) };
    }),
  });
});

// One bid job: the hirer sees the bids; anyone else sees the public shape.
app.get('/api/bid-jobs/:id', requireAuth, (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  expireBids(bidJob.id);
  const coords = parseBidCoords(req);
  if (coords.error) return err(res, 400, coords.error);
  const pub = bidJobPublic(bidJob, coords.lat, coords.lng);
  if (bidJob.hirer_id === req.user.id) {
    const bids = db.prepare('SELECT * FROM Bid WHERE bid_job_id = ? ORDER BY amount ASC, created_at ASC').all(bidJob.id)
      .map((b) => bidPublic(b, pub.site));
    return res.json({ bidJob: { ...pub, jobId: bidJob.job_id || null }, bids });
  }
  return res.json({ bidJob: pub });
});

// Bids on a job, cheapest first, with distance + WorkPassport facts.
// Hirer only — another hirer (or any other user) gets 403, not the list.
app.get('/api/bid-jobs/:id/bids', requireAuth, (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  if (bidJob.hirer_id !== req.user.id) return err(res, 403, 'only the hirer sees bids on this job');
  expireBids(bidJob.id);
  const site = bidJob.site_lat != null ? { lat: bidJob.site_lat, lng: bidJob.site_lng } : null;
  const bids = db.prepare('SELECT * FROM Bid WHERE bid_job_id = ? ORDER BY amount ASC, created_at ASC').all(bidJob.id)
    .map((b) => bidPublic(b, site));
  res.json({ bids });
});

// A worker places a bid: OTP-verified session only (no new account — the
// worker logs in with phone + OTP first). One live bid per worker per job,
// at most 10 live bids per job, bids expire after 24 hours.
app.post('/api/bid-jobs/:id/bids', requireAuth, (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  if (bidJob.status !== 'OPEN') return err(res, 400, 'this bid job is no longer open for bids');
  const hirer = db.prepare('SELECT phone FROM User WHERE id = ?').get(bidJob.hirer_id);
  if (hirer && hirer.phone === req.user.phone) {
    return err(res, 403, 'you posted this job — you cannot bid on your own job');
  }
  const { amount, note, earliestStart, workerLat, workerLng } = req.body || {};
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return err(res, 400, 'amount must be a positive number (BDT)');
  }
  if (note != null && (typeof note !== 'string' || note.length > 280)) {
    return err(res, 400, 'note must be at most 280 characters');
  }
  if ((workerLat != null || workerLng != null) && !validLatLng(workerLat, workerLng)) {
    return err(res, 400, 'worker lat/lng are out of range');
  }
  expireBids(bidJob.id);
  const existing = db.prepare("SELECT id FROM Bid WHERE bid_job_id = ? AND worker_phone = ? AND status = 'LIVE'").get(bidJob.id, req.user.phone);
  if (existing) return err(res, 409, 'you already have a live bid on this job');
  const liveCount = db.prepare("SELECT COUNT(*) AS n FROM Bid WHERE bid_job_id = ? AND status = 'LIVE'").get(bidJob.id).n;
  if (liveCount >= MAX_LIVE_BIDS_PER_JOB) {
    return err(res, 409, 'this job already has ' + MAX_LIVE_BIDS_PER_JOB + ' live bids');
  }
  const bidId = newId();
  const created = now();
  const expires = new Date(Date.now() + BID_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO Bid (id, bid_job_id, worker_phone, worker_name, amount, note, earliest_start, worker_lat, worker_lng, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(bidId, bidJob.id, req.user.phone, req.user.name || null, amount,
    note ? note.slice(0, 280) : null, earliestStart ? String(earliestStart).slice(0, 100) : null,
    workerLat ?? null, workerLng ?? null, 'LIVE', created, expires);
  addBiddingEvent(bidJob.id, 'BID_PLACED', 'worker:' + req.user.phone, {
    bidId, amount, note: note || null, earliestStart: earliestStart || null,
  });
  res.status(201).json({ bid: db.prepare('SELECT * FROM Bid WHERE id = ?').get(bidId) });
});

// Hirer picks one bid. The bid alone is NOT an agreement: this creates a
// normal Job pre-filled from the bid (price = bid price, worker = bidder,
// site + problem photos carried over) and the existing flow takes over —
// FairScope, then DUAL OTP confirmation. Only after both OTPs is the job
// ACTIVE. Losing bids are marked NOT SELECTED and the job leaves the open list.
app.post('/api/bid-jobs/:id/bids/:bidId/accept', requireAuth, async (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  if (bidJob.hirer_id !== req.user.id) return err(res, 403, 'only the hirer accepts a bid');
  if (bidJob.status !== 'OPEN') return err(res, 400, 'this bid job is no longer open');
  expireBids(bidJob.id);
  const bid = db.prepare('SELECT * FROM Bid WHERE id = ? AND bid_job_id = ?').get(req.params.bidId, bidJob.id);
  if (!bid) return err(res, 404, 'bid not found');
  if (bid.status !== 'LIVE') return err(res, 400, 'this bid is ' + bid.status.toLowerCase() + ' — it cannot be accepted');
  const workerPhoneNorm = normalizeBdPhone(bid.worker_phone);
  if (!workerPhoneNorm) return err(res, 400, 'bidder phone is not a Bangladesh mobile number');
  // Build the normal Job, exactly as POST /api/jobs would: V1 with a
  // SHA-256 fingerprint, DRAFT until both sides OTP-confirm. FairScope
  // answers start empty — every question is a missing term until the
  // hirer settles it (the record flow shows the warning, as usual).
  const jobId = newId();
  const scopeDoc = { scope: bidJob.description, milestones: [], answers: {}, skippedTerms: [] };
  const deadline = null;
  db.prepare(
    'INSERT INTO Job (id, hirer_id, worker_phone, worker_name, trade, status, current_version, site_lat, site_lng, site_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(jobId, req.user.id, workerPhoneNorm, bid.worker_name || null, bidJob.trade, 'DRAFT', 1,
    bidJob.site_lat, bidJob.site_lng, bidJob.site_address, now());
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope: scopeDoc.scope, price: bid.amount, deadline });
  db.prepare(
    'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), jobId, 1, JSON.stringify(scopeDoc), bid.amount, deadline, fp, now());
  // Carry the problem photos onto the new job as BEFORE photos.
  for (const ph of bidJobPhotos(bidJob.id)) {
    db.prepare('INSERT INTO Photo (id, job_id, milestone, url, taken_at, kind) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId(), jobId, null, ph.url, ph.taken_at, 'BEFORE');
  }
  // The new Job's timeline carries the full bidding history (append-only
  // copies — the originals stay under the bid-job id in the same log).
  const history = db.prepare('SELECT * FROM Event WHERE job_id = ? ORDER BY id ASC').all(bidJob.id);
  for (const e of history) {
    let p = null;
    try { p = JSON.parse(e.payload_json || 'null'); } catch (_e) { p = null; }
    addEvent(jobId, e.type, e.actor, p);
  }
  addEvent(jobId, 'BID_ACCEPTED', 'hirer:' + req.user.phone, {
    bidJobId: bidJob.id, bidId: bid.id, workerPhone: workerPhoneNorm, amount: bid.amount,
  });
  const losers = db.prepare("SELECT * FROM Bid WHERE bid_job_id = ? AND status = 'LIVE' AND id != ?").all(bidJob.id, bid.id);
  for (const loser of losers) {
    db.prepare("UPDATE Bid SET status = 'NOT_SELECTED' WHERE id = ?").run(loser.id);
    addEvent(jobId, 'BID_NOT_SELECTED', 'hirer:' + req.user.phone, {
      bidJobId: bidJob.id, bidId: loser.id, workerPhone: loser.worker_phone, amount: loser.amount,
    });
  }
  db.prepare("UPDATE Bid SET status = 'ACCEPTED' WHERE id = ?").run(bid.id);
  db.prepare("UPDATE BidJob SET status = 'ACCEPTED', job_id = ? WHERE id = ?").run(jobId, bidJob.id);
  addBiddingEvent(bidJob.id, 'BID_ACCEPTED', 'hirer:' + req.user.phone, {
    bidId: bid.id, jobId, workerPhone: workerPhoneNorm, amount: bid.amount,
  });
  upsertUser(workerPhoneNorm, bid.worker_name || null, 'worker');
  const workerToken = createWorkerToken(jobId, 'view');
  const workerLink = '/worker.html?token=' + workerToken;
  // Notify the winning worker by SMS (sandbox: logged, no real SMS sent).
  let workerSms = null;
  try {
    const adapter = getAdapter();
    workerSms = await adapter.sendSms(
      workerPhoneNorm,
      'DealCraft: ' + req.user.name + ' picked your bid of BDT ' + bid.amount + ' for ' + bidJob.trade.toLowerCase() +
      ' work. Review the record here: ' + baseUrl(req) + workerLink +
      ' — confirm by OTP to make it active. DealCraft holds no money; this record is not a legal document.'
    );
  } catch (_e) {
    workerSms = { status: 'FAILED' };
  }
  const job = getJob(jobId);
  const missingTerms = computeMissingTerms(bidJob.trade, {}, []);
  res.status(201).json({ job, bidJob: getBidJob(bidJob.id), workerLink, workerSms, missingTerms });
});

// Hirer closes bidding without picking anyone. Live bids are marked
// NOT_SELECTED (no pick was made) and the close is an event.
app.post('/api/bid-jobs/:id/close', requireAuth, (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  if (bidJob.hirer_id !== req.user.id) return err(res, 403, 'only the hirer closes bidding');
  if (bidJob.status !== 'OPEN') return err(res, 400, 'this bid job is already ' + bidJob.status.toLowerCase());
  expireBids(bidJob.id);
  db.prepare("UPDATE Bid SET status = 'NOT_SELECTED' WHERE bid_job_id = ? AND status = 'LIVE'").run(bidJob.id);
  db.prepare("UPDATE BidJob SET status = 'CLOSED_NO_HIRE' WHERE id = ?").run(bidJob.id);
  addBiddingEvent(bidJob.id, 'BID_JOB_CLOSED_NO_HIRE', 'hirer:' + req.user.phone, { bidJobId: bidJob.id });
  res.json({ bidJob: getBidJob(bidJob.id) });
});

// ---------------------------------------------------------------- disputes
const DISPUTE_CATEGORIES = [
  'work not completed', 'quality', 'payment', 'scope or extra work', 'property damage',
];

app.post('/api/jobs/:id/disputes', requireJobAccess, (req, res) => {
  const job = req.job;
  const { category, statement } = req.body || {};
  if (!DISPUTE_CATEGORIES.includes(category)) {
    return err(res, 400, 'category must be one of: ' + DISPUTE_CATEGORIES.join(', '));
  }
  if (!statement) return err(res, 400, 'statement is required');
  const disputeId = newId();
  db.prepare('INSERT INTO Dispute (id, job_id, category, created_at) VALUES (?, ?, ?, ?)')
    .run(disputeId, job.id, category, now());
  const stmtId = newId();
  const side = sideOf(req, job);
  db.prepare('INSERT INTO DisputeStatement (id, dispute_id, side, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(stmtId, disputeId, side, statement, now());
  addEvent(job.id, 'DISPUTE_OPENED', actorOf(req, job), { disputeId, category });
  addEvent(job.id, 'STATEMENT_ADDED', actorOf(req, job), { disputeId, statementId: stmtId, side });
  db.prepare("UPDATE Job SET status = 'DISPUTED' WHERE id = ?").run(job.id);
  // Sharing stops when a job is disputed — no location after this point.
  clearLocation(job.id);
  res.status(201).json({
    dispute: db.prepare('SELECT * FROM Dispute WHERE id = ?').get(disputeId),
    job: getJob(job.id),
  });
});

app.post('/api/disputes/:disputeId/statements', (req, res) => {
  const dispute = db.prepare('SELECT * FROM Dispute WHERE id = ?').get(req.params.disputeId);
  if (!dispute) return err(res, 404, 'dispute not found');
  const job = getJob(dispute.job_id);
  const user = authedUser(req);
  const wt = workerTokenForJob(req, job.id);
  if (!(user && user.id === job.hirer_id) && !wt) return err(res, 401, 'authentication required');
  const { side, text } = req.body || {};
  const resolvedSide = side || (wt ? 'worker' : 'hirer');
  if (!['hirer', 'worker'].includes(resolvedSide)) return err(res, 400, "side must be 'hirer' or 'worker'");
  if (!text) return err(res, 400, 'text is required');
  const stmtId = newId();
  db.prepare('INSERT INTO DisputeStatement (id, dispute_id, side, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(stmtId, dispute.id, resolvedSide, text, now());
  addEvent(job.id, 'STATEMENT_ADDED', resolvedSide + ':' + (resolvedSide === 'worker' ? job.worker_phone : user.phone), {
    disputeId: dispute.id, statementId: stmtId, side: resolvedSide,
  });
  res.status(201).json({ statement: db.prepare('SELECT * FROM DisputeStatement WHERE id = ?').get(stmtId) });
});

// ---------------------------------------------------------------- dispute resolve
// A dispute is resolved by mutual agreement only: both sides must have a
// statement on record, and the hirer confirms the agreement. DealCraft
// never decides and never records a verdict — the event says only that
// both sides agreed to return the job to ACTIVE.
app.post('/api/disputes/:disputeId/resolve', requireAuth, (req, res) => {
  const dispute = db.prepare('SELECT * FROM Dispute WHERE id = ?').get(req.params.disputeId);
  if (!dispute) return err(res, 404, 'dispute not found');
  const job = getJob(dispute.job_id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer records a mutual resolution');
  if (job.status !== 'DISPUTED') return err(res, 400, 'job is not DISPUTED');
  const { confirmMutual, note } = req.body || {};
  if (!confirmMutual) return err(res, 400, 'confirmMutual:true is required — both sides must agree to resolve');
  const sides = db.prepare('SELECT DISTINCT side FROM DisputeStatement WHERE dispute_id = ?').all(dispute.id).map((r) => r.side);
  if (!sides.includes('hirer') || !sides.includes('worker')) {
    return err(res, 400, 'both sides must have a statement on record before the dispute can be resolved');
  }
  db.prepare("UPDATE Job SET status = 'ACTIVE' WHERE id = ?").run(job.id);
  addEvent(job.id, 'DISPUTE_RESOLVED', 'hirer:' + req.user.phone, {
    disputeId: dispute.id, mutual: true, note: note || null,
  });
  res.json({ job: getJob(job.id), dispute });
});

// ---------------------------------------------------------------- close
app.post('/api/jobs/:id/close', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer closes the job');
  if (job.status === 'CLOSED') return err(res, 400, 'job is already closed');
  const { confirmCompletion, force, note, workerOtpCode, closeAnyway } = req.body || {};
  const version = getCurrentVersion(job);
  const milestones = milestoneStatus(job.id, milestonesOf(version));
  const allApproved = milestones.every((m) => m.approved);
  if (!confirmCompletion && !force) {
    return err(res, 400, 'confirmCompletion:true is required to close the job');
  }
  if (!allApproved && !force) {
    return err(res, 400, 'cannot close: not all milestones are approved — pass force:true with a note to close anyway');
  }
  // Closing needs the worker too: either the worker confirms with an OTP
  // (purpose 'close-confirm', requested from the worker link), or the
  // hirer explicitly closes alone — recorded as hirer-only in the log.
  let workerConfirmed = false;
  let hirerOnly = false;
  if (workerOtpCode) {
    const adapter = getAdapter();
    try { workerConfirmed = await adapter.verifyOtp(job.worker_phone, String(workerOtpCode), 'close-confirm'); }
    catch (e) { return otpError(res, e); }
    if (!workerConfirmed) return err(res, 401, 'invalid or expired worker code');
  } else if (closeAnyway) {
    hirerOnly = true;
  } else {
    return err(res, 400, 'worker confirmation required: pass workerOtpCode (worker requests it with purpose close-confirm) or closeAnyway:true to close as hirer-only');
  }
  db.prepare("UPDATE Job SET status = 'CLOSED' WHERE id = ?").run(job.id);
  // No location survives a closed job: latest point and trail are deleted.
  clearLocation(job.id);
  addEvent(job.id, 'JOB_CLOSED', 'hirer:' + req.user.phone, {
    forced: !!force, hirerOnly, workerConfirmed, note: note || null, milestonesApproved: allApproved,
  });
  res.json({ job: getJob(job.id) });
});

// ---------------------------------------------------------------- resolve pack
function resolvePackData(job) {
  return jobDetail(job);
}

app.get('/api/jobs/:id/resolvepack.json', requireJobAccess, (req, res) => {
  res.json(resolvePackData(req.job));
});

app.get('/api/jobs/:id/resolvepack', requireJobAccess, (req, res) => {
  const d = resolvePackData(req.job);
  const job = d.job;
  // compress: false — the text stays searchable in the file, so a judge (or
  // a test) can verify the labelled FairScope lines are really in the PDF
  // instead of trusting a debug dump. File size is a non-issue here.
  const doc = new PDFDocument({ margin: 50, compress: false });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resolvepack-' + job.id + '.pdf"');
    res.send(Buffer.concat(chunks));
  });
  doc.on('error', (e) => {
    if (!res.headersSent) res.status(500).json({ error: 'could not generate PDF: ' + e.message });
  });
  doc.fontSize(18).fillColor('#111111').text('ResolvePack — mutually confirmed digital work record', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#333333')
    .text('Job: ' + job.id)
    .text('Trade: ' + job.trade + '  |  Status: ' + job.status)
    .text('Worker: ' + (job.worker_name || '') + ' (' + job.worker_phone + ')')
    .text('Created: ' + job.created_at);
  doc.moveDown();
  doc.fontSize(13).text('Agreed scope — every version');
  for (const v of d.versions) {
    const sc = v.scope || {};
    doc.fontSize(11).text('Version ' + v.version_no + ' — BDT ' + v.price + ' — deadline ' + (v.deadline || '—') + ' — ' + v.created_at);
    doc.fontSize(10).fillColor('#333333').text('Scope: ' + (sc.scope || '—'));
    if (sc.answers && typeof sc.answers === 'object') {
      for (const [q, a] of Object.entries(sc.answers)) {
        doc.fontSize(10).fillColor('#333333').text('  • ' + q + ': ' + a);
      }
    }
    if (Array.isArray(sc.skippedTerms) && sc.skippedTerms.length) {
      doc.fontSize(10).fillColor('#333333').text('  Skipped terms (explicitly): ' + sc.skippedTerms.join('; '));
    }
    if (Array.isArray(sc.milestones)) {
      for (const m of sc.milestones) {
        doc.fontSize(10).fillColor('#333333').text('  Milestone: ' + (m.title || '') + ' — BDT ' + (m.amount || 0));
      }
    }
    doc.fontSize(10).fillColor('#333333').text('Fingerprint (SHA-256): ' + v.fingerprint);
    doc.fillColor('#111111').moveDown(0.5);
  }
  doc.fontSize(13).text('Milestones');
  for (const m of d.milestones) {
    doc.fontSize(11).text('- ' + m.title + ' — BDT ' + m.amount + ' — completed: ' + (m.completed ? 'yes' : 'no') + ', approved: ' + (m.approved ? 'yes' : 'no'));
  }
  doc.moveDown(0.5);
  doc.fontSize(13).text('Payments (acknowledgements only — DealCraft holds no money)');
  for (const p of d.payments) {
    doc.fontSize(11).text('- BDT ' + p.amount + ' via ' + p.method + ' on ' + (p.date || '') + ' — ' + p.ack_status);
  }
  doc.fontSize(11).text('Agreed: BDT ' + d.balance.agreed + ' | Acknowledged paid: BDT ' + d.balance.acknowledgedPaid + ' | Remaining: BDT ' + d.balance.remaining);
  doc.moveDown(0.5);
  doc.fontSize(13).text('Photos');
  if (!d.photos.length) doc.fontSize(11).text('None.');
  for (const ph of d.photos) {
    doc.fontSize(11).text('- ' + (ph.kind || 'Photo') + ' — milestone ' + (ph.milestone ?? '—') + ' — ' + ph.taken_at);
    // Embed the photo itself (thumbnail); fall back to the path line if
    // the file cannot be read as an image.
    try {
      const file = path.join(UPLOADS_DIR, path.basename(ph.url));
      doc.image(fs.readFileSync(file), { width: 200 });
      doc.moveDown(0.25);
    } catch (_e) {
      doc.fontSize(10).fillColor('#333333').text('  ' + ph.url);
      doc.fillColor('#111111');
    }
  }
  doc.moveDown(0.5);
  doc.fontSize(13).text('Disputes and statements (both sides)');
  if (!d.disputes.length) doc.fontSize(11).text('None.');
  for (const dis of d.disputes) {
    doc.fontSize(11).text('Dispute: ' + dis.category + ' — ' + dis.created_at);
    for (const s of dis.statements) {
      doc.fontSize(10).fillColor('#333333').text('  [' + s.side + '] ' + s.text + ' (' + s.created_at + ')');
      doc.fillColor('#111111');
    }
  }
  doc.moveDown(0.5);
  doc.fontSize(13).text('Chronological record');
  for (const e of d.events) {
    doc.fontSize(10).text(e.created_at + ' — ' + e.type + ' — ' + (e.actor || ''));
  }
  doc.moveDown();
  doc.fontSize(8).fillColor('#666666')
    .text('DealCraft holds no money. This record is not a legal document.', { align: 'center' });
  doc.end();
});

// ---------------------------------------------------------------- passport
app.post('/api/passport/add', (req, res) => {
  const { jobId, showAmounts, showClient, showPhotos } = req.body || {};
  if (!jobId) return err(res, 400, 'jobId is required');
  const job = getJob(jobId);
  if (!job) return err(res, 404, 'job not found');
  const user = authedUser(req);
  const wt = workerTokenForJob(req, jobId);
  if (!(user && user.id === job.hirer_id) && !wt) return err(res, 401, 'authentication required');
  if (job.status !== 'CLOSED') return err(res, 400, 'only a CLOSED job can be added to the passport');
  const existing = db.prepare('SELECT id FROM PassportEntry WHERE job_id = ?').get(jobId);
  if (existing) return err(res, 409, 'this job is already in the WorkPassport');
  const id = newId();
  db.prepare(
    'INSERT INTO PassportEntry (id, worker_phone, job_id, show_amounts, show_client, show_photos, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, job.worker_phone, jobId, showAmounts ? 1 : 0, showClient ? 1 : 0, showPhotos ? 1 : 0, now());
  res.status(201).json({ entry: db.prepare('SELECT * FROM PassportEntry WHERE id = ?').get(id) });
});

function passportData(workerPhone) {
  const worker = db.prepare('SELECT name FROM User WHERE phone = ?').get(workerPhone);
  const entries = db.prepare('SELECT * FROM PassportEntry WHERE worker_phone = ? ORDER BY created_at ASC').all(workerPhone);
  const jobs = entries.map((e) => {
    const job = getJob(e.job_id);
    if (!job) return null;
    const hirer = db.prepare('SELECT name FROM User WHERE id = ?').get(job.hirer_id);
    return {
      jobId: e.job_id,
      trade: job.trade,
      completedAt: job.created_at,
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
  // The worker's name comes from the User table — the phone number is an
  // identifier, not a name, and must not be shown as one.
  return { workerPhone, workerName: worker ? worker.name : undefined, trades, completedJobs: jobs.length, entries: jobs };
}

app.get('/api/passport/:workerPhone', (req, res) => {
  res.json(passportData(req.params.workerPhone));
});

app.get('/api/passport/:workerPhone/qr.png', async (req, res) => {
  const url = baseUrl(req) + '/passport/' + encodeURIComponent(req.params.workerPhone);
  try {
    const png = await QRCode.toBuffer(url, { type: 'png', width: 256 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    return err(res, 500, 'could not generate QR code');
  }
});

app.get('/passport/:workerPhone', (req, res) => {
  const data = passportData(req.params.workerPhone);
  const rows = data.entries.map((e) => {
    const amount = e.showAmounts && e.amount !== undefined ? ' — BDT ' + e.amount : '';
    const client = e.showClient && e.clientName ? ' — client: ' + escapeHtml(e.clientName) : '';
    const photos = e.showPhotos && e.photoUrls && e.photoUrls.length
      ? ' — photos: ' + e.photoUrls.map((u) => escapeHtml(u)).join(', ') : '';
    return '<li>' + escapeHtml(e.trade) + ' — completed ' + escapeHtml(e.completedAt.slice(0, 10)) + escapeHtml(amount) + client + photos + '</li>';
  }).join('') || '<li>No completed jobs listed yet.</li>';
  const displayName = data.workerName || data.workerPhone;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>DealCraft Passport — ' + escapeHtml(displayName) + '</title></head>'
    + '<body><h1>DealCraft Passport</h1><p>Worker: ' + escapeHtml(displayName) + ' (' + escapeHtml(data.workerPhone) + ')</p>'
    + '<p>Completed jobs: ' + data.completedJobs + ' | Trades: ' + escapeHtml(data.trades.join(', ') || '—') + '</p>'
    + '<ul>' + rows + '</ul>'
    + '<p>DealCraft holds no money. This record is not a legal document.</p></body></html>');
});

// ---------------------------------------------------------------- billing
app.post('/api/billing/caas', requireAuth, async (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId) return err(res, 400, 'jobId is required');
  const job = getJob(jobId);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer pays for the job');
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

app.post('/api/billing/caas/:chargeId/verify', requireAuth, async (req, res) => {
  const billing = db.prepare("SELECT * FROM Billing WHERE id = ? AND kind = 'caas'").get(req.params.chargeId);
  if (!billing) return err(res, 404, 'charge not found');
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
    db.prepare("UPDATE Billing SET status = 'VERIFIED' WHERE id = ?").run(req.params.chargeId);
    db.prepare('UPDATE Job SET billing_paid = 1 WHERE id = ?').run(billing.job_id);
  }
  res.json({ chargeId: req.params.chargeId, status: result.status });
});

app.post('/api/billing/subscribe', requireAuth, async (req, res) => {
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
app.post('/api/billing/unsubscribe', requireAuth, async (req, res) => {
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
app.get('/api/billing/status', requireAuth, (req, res) => {
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
    jobs: jobs.map((j) => ({ jobId: j.id, status: j.status, paid: !!j.billing_paid })),
    paidJobs: jobs.filter((j) => j.billing_paid).length,
    unpaidJobs: jobs.filter((j) => !j.billing_paid).length,
  });
});

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

app.get('/api/demo/script', (req, res) => {
  res.json({ script: DEMO_SCRIPT });
});

app.post('/api/demo/reset', (req, res) => {
  if (!demoAllowed(req, res)) return;
  clearAllTables();
  try { fs.writeFileSync(LOG_PATH, ''); } catch (_e) {}
  res.json({ ok: true, note: 'demo data cleared' });
});

app.post('/api/demo/seed', async (req, res) => {
  if (!demoAllowed(req, res)) return;
  clearAllTables();
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
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope, price, deadline });
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
    sandboxOtps: { hirerConfirm: hirerOtp, workerConfirm: workerOtp },
  });
});

// ---------------------------------------------------------------- errors
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log('DealCraft backend listening on port ' + PORT + ' (mode: ' + getMode() + ')');
  });
}

module.exports = app;
