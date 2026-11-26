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
  return {
    job,
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
function authedUser(req) {
  const h = req.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const s = db.prepare('SELECT * FROM Session WHERE token = ?').get(m[1]);
  if (!s) return null;
  return db.prepare('SELECT * FROM User WHERE phone = ?').get(s.phone) || null;
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
  res.json({ mode: getMode(), note: 'AppLink reaches Banglalink subscribers only.' });
});

app.get('/api/applink/log', (req, res) => {
  res.json({ entries: readLog(50) });
});

// ---------------------------------------------------------------- auth
app.post('/api/auth/request-otp', async (req, res) => {
  const { phone, name, role, purpose } = req.body || {};
  if (!phone || typeof phone !== 'string') return err(res, 400, 'phone is required');
  if (name || role) upsertUser(phone, name, role);
  const adapter = getAdapter();
  try {
    const result = await adapter.sendOtp(phone, purpose || 'login');
    const out = { ok: true, via: adapter.mode === 'sandbox' ? 'applink-otp-sandbox' : 'applink-otp-live' };
    if (adapter.mode === 'sandbox') {
      out.sandbox = { otp: result.code, note: 'SANDBOX — not a live AppLink call' };
    }
    return res.json(out);
  } catch (e) {
    return err(res, 502, e.message);
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
    return err(res, 502, e.message);
  }
  if (!ok) return err(res, 401, 'invalid or expired code');
  const user = upsertUser(phone, null, null);
  const token = randomToken();
  db.prepare('INSERT INTO Session (id, token, phone, created_at) VALUES (?, ?, ?, ?)')
    .run(newId(), token, phone, now());
  res.json({ ok: true, token, user });
});

app.get('/api/me', (req, res) => {
  const user = authedUser(req);
  if (!user) return err(res, 401, 'authentication required');
  res.json({ user });
});

// ---------------------------------------------------------------- jobs
app.post('/api/jobs', requireAuth, async (req, res) => {
  const { trade, workerPhone, workerName, scope, price, deadline, milestones, answers, skippedTerms } = req.body || {};
  if (!trade || !questionsFor(trade).length) return err(res, 400, 'trade must be one of ELECTRICIAN, PAINTER, PLUMBER');
  if (!workerPhone) return err(res, 400, 'workerPhone is required');
  if (typeof price !== 'number' || price <= 0) return err(res, 400, 'price must be a positive number (BDT)');
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
    'INSERT INTO Job (id, hirer_id, worker_phone, worker_name, trade, status, current_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(jobId, req.user.id, workerPhone, workerName || null, tradeKey, 'DRAFT', 1, now());
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope: scopeDoc.scope, price, deadline: deadline || null });
  db.prepare(
    'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), jobId, 1, JSON.stringify(scopeDoc), price, deadline || null, fp, now());
  addEvent(jobId, 'AGREEMENT_CREATED', 'hirer:' + req.user.phone, {
    trade: tradeKey, price, deadline: deadline || null, missingTerms,
  });
  upsertUser(workerPhone, workerName || null, 'worker');
  const workerToken = createWorkerToken(jobId, 'view');
  const workerLink = '/worker.html?token=' + workerToken;
  const job = getJob(jobId);
  const version = getCurrentVersion(job);
  // Notify the worker by SMS (sandbox: logged, no real SMS sent).
  let workerSms = null;
  try {
    const adapter = getAdapter();
    workerSms = await adapter.sendSms(
      workerPhone,
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
  catch (e) { return err(res, 502, e.message); }
  if (!ok) return err(res, 401, 'invalid or expired code');
  addEvent(job.id, 'CONFIRMED_BY_HIRER', 'hirer:' + req.user.phone, {});
  const workerConfirmed = db.prepare(
    "SELECT 1 FROM Event WHERE job_id = ? AND type = 'CONFIRMED_BY_WORKER' LIMIT 1"
  ).get(job.id);
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
  catch (e) { return err(res, 502, e.message); }
  if (!ok) return err(res, 401, 'invalid or expired code');
  addEvent(job.id, 'CONFIRMED_BY_WORKER', 'worker:' + job.worker_phone, {});
  const hirerConfirmed = db.prepare(
    "SELECT 1 FROM Event WHERE job_id = ? AND type = 'CONFIRMED_BY_HIRER' LIMIT 1"
  ).get(job.id);
  const status = hirerConfirmed ? 'ACTIVE' : 'PENDING';
  db.prepare('UPDATE Job SET status = ? WHERE id = ?').run(status, job.id);
  res.json({ job: getJob(job.id) });
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
  if (side === 'worker' && (decision === 'accept' || decision === 'reject')) {
    if (!otpCode) return err(res, 400, 'otpCode is required for the worker to respond');
    const adapter = getAdapter();
    let ok = false;
    try { ok = await adapter.verifyOtp(job.worker_phone, String(otpCode), 'change-approve'); }
    catch (e) { return err(res, 502, e.message); }
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
    // clarify: keep status PENDING, record the clarification as a new proposal event.
    addEvent(job.id, 'CHANGE_PROPOSED', side + ':' + (side === 'worker' ? job.worker_phone : user.phone), {
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
  catch (e) { return err(res, 502, e.message); }
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
    const photoId = newId();
    const url = '/uploads/' + req.file.filename;
    db.prepare('INSERT INTO Photo (id, job_id, milestone, url, taken_at) VALUES (?, ?, ?, ?, ?)')
      .run(photoId, job.id, milestone, url, now());
    addEvent(job.id, 'PHOTO_ADDED', actorOf({ user, workerToken: wt }, job), {
      photoId, milestone, url,
    });
    res.status(201).json({ photo: db.prepare('SELECT * FROM Photo WHERE id = ?').get(photoId) });
  });
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

// ---------------------------------------------------------------- close
app.post('/api/jobs/:id/close', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer closes the job');
  if (job.status === 'CLOSED') return err(res, 400, 'job is already closed');
  const { confirmCompletion, force, note } = req.body || {};
  const version = getCurrentVersion(job);
  const milestones = milestoneStatus(job.id, milestonesOf(version));
  const allApproved = milestones.every((m) => m.approved);
  if (!confirmCompletion && !force) {
    return err(res, 400, 'confirmCompletion:true is required to close the job');
  }
  if (!allApproved && !force) {
    return err(res, 400, 'cannot close: not all milestones are approved — pass force:true with a note to close anyway');
  }
  db.prepare("UPDATE Job SET status = 'CLOSED' WHERE id = ?").run(job.id);
  addEvent(job.id, 'JOB_CLOSED', 'hirer:' + req.user.phone, {
    forced: !!force, note: note || null, milestonesApproved: allApproved,
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
  const doc = new PDFDocument({ margin: 50 });
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
    doc.fontSize(11).text('Version ' + v.version_no + ' — BDT ' + v.price + ' — deadline ' + (v.deadline || '—') + ' — ' + v.created_at);
    doc.fontSize(10).fillColor('#333333').text('Scope: ' + JSON.stringify(v.scope));
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
    doc.fontSize(11).text('- ' + ph.url + ' — milestone ' + (ph.milestone ?? '—') + ' — ' + ph.taken_at);
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
  const id = newId();
  db.prepare(
    'INSERT INTO PassportEntry (id, worker_phone, job_id, show_amounts, show_client, show_photos, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, job.worker_phone, jobId, showAmounts ? 1 : 0, showClient ? 1 : 0, showPhotos ? 1 : 0, now());
  res.status(201).json({ entry: db.prepare('SELECT * FROM PassportEntry WHERE id = ?').get(id) });
});

function passportData(workerPhone) {
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
  return { workerPhone, trades, completedJobs: jobs.length, entries: jobs };
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>DealCraft Passport — ' + escapeHtml(data.workerPhone) + '</title></head>'
    + '<body><h1>DealCraft Passport</h1><p>Worker: ' + escapeHtml(data.workerPhone) + '</p>'
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
  db.prepare("INSERT INTO Billing (id, job_id, kind, amount, status, created_at) VALUES (?, ?, 'caas', 10, 'PENDING', ?)")
    .run(result.chargeId, jobId, now());
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
  const adapter = getAdapter();
  let result;
  try {
    result = await adapter.subscribe(req.user.phone, plan || 'monthly');
  } catch (e) {
    return err(res, 502, e.message);
  }
  db.prepare("INSERT INTO Billing (id, job_id, kind, amount, status, created_at) VALUES (?, '', 'subscription', 70, 'ACTIVE', ?)")
    .run(newId(), now());
  res.json({ subscriptionId: result.subscriptionId, status: result.status, plan: plan || 'monthly', amount: 70 });
});

// ---------------------------------------------------------------- demo
const DEMO_SCRIPT = [
  { step: 1, title: 'Hirer signs in with phone + OTP', detail: 'POST /api/auth/request-otp with 01700000001, then verify the sandbox code.' },
  { step: 2, title: 'Hirer creates the job', detail: 'POST /api/jobs — electrician rewiring, BDT 18,000, deadline 2026-12-05, milestones Advance 5,000 / First stage 7,000 / Completion 6,000.' },
  { step: 3, title: 'FairScope check', detail: 'Wall repair was "Not decided" — the job shows it as a missing term until it is resolved to "Worker includes wall repair".' },
  { step: 4, title: 'Worker gets an SMS with the review link', detail: 'Sandbox SMS is logged; the worker opens /worker.html?token=... and confirms with their own OTP.' },
  { step: 5, title: 'Both sides confirm', detail: 'Hirer confirms with the hirer-confirm OTP, worker confirms with the worker-confirm OTP — status becomes ACTIVE.' },
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
  clearAllTables();
  try { fs.writeFileSync(LOG_PATH, ''); } catch (_e) {}
  res.json({ ok: true, note: 'demo data cleared' });
});

app.post('/api/demo/seed', async (req, res) => {
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
    'INSERT INTO Job (id, hirer_id, worker_phone, worker_name, trade, status, current_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(jobId, hirer.id, workerPhone, 'Karim Mistri', 'ELECTRICIAN', 'DRAFT', 1, now());
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
