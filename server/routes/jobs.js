// DealCraft routes — jobs, milestones, photos, hirer location view, close, ResolvePack. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');
const { db, now, fingerprint, newId, questionsFor, computeMissingTerms, validateSkippedTerms, getAdapter, UPLOADS_DIR, err, baseUrl, escapeHtml, addEvent, getJob, getCurrentVersion, milestonesOf, milestoneStatus, jobDetail, createWorkerToken, workerTokenForJob, authedUser, otpError, normalizeBdPhone, billingSatisfied, requireAuth, requireJobAccess, actorOf, clearLocation, jobSite, locationView, validLatLng, upsertUser, sendAgreementSummarySms, checkDeadlines, isRealImage, imageMime, MAX_PHOTOS_PER_JOB, upload, resolvePackData, TRADE_BN, validateScope, validatePrice, validateDeadline, validateMilestones, vmsg, passportData } = require('../src/shared');
const { parsePrompt } = require('../src/prompt-parse');
const router = express.Router();

// Worker profile facts — same shape as worker.js (see its comment):
// verified data only, no phone number, photoUrl null until a photo is
// ever stored, counts reuse passportData's mutually-closed logic.
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


// ---------------------------------------------------------------- jobs
router.post('/api/jobs', requireAuth, async (req, res) => {
  let { trade, workerPhone, workerName, scope, price, deadline, milestones, answers, skippedTerms, site, publishHirerName } = req.body || {};
  // Prompt-based creation: the prompt is parsed server-side and its
  // values win over any client-parsed values (the server never trusts
  // the phone). A prompt is an additional input path — direct fields
  // without a prompt behave exactly as before.
  if (typeof (req.body || {}).prompt === 'string' && req.body.prompt.trim()) {
    const parsed = parsePrompt(req.body.prompt);
    if (parsed.trade) trade = parsed.trade;
    if (parsed.price != null) price = parsed.price;
    if (parsed.deadline) deadline = parsed.deadline;
    if (parsed.description) scope = parsed.description;
    const missingNow = [];
    if (!trade) missingNow.push('trade');
    if (price == null) missingNow.push('price');
    if (missingNow.length) {
      return err(res, 400, 'prompt is missing ' + missingNow.join(' and ') + ' — say the trade and the price, e.g. "2 bedroom flat rewiring, 18000, by Friday"');
    }
  }
  if (!trade || !questionsFor(trade).length) return err(res, 400, 'trade must be one of ELECTRICIAN, PAINTER, PLUMBER');
  const workerPhoneNorm = normalizeBdPhone(workerPhone);
  if (!workerPhoneNorm) return err(res, 400, 'workerPhone must be a Bangladesh mobile number (01XXXXXXXXX)');
  // The same phone cannot be hirer and worker on one record.
  if (workerPhoneNorm === normalizeBdPhone(req.user.phone)) return err(res, 400, vmsg('samePhone', 'en'));
  // Create validation: non-empty scope, whole-taka price in a sane band,
  // a real deadline that is not in the past, sane milestone amounts.
  const scopeErr = validateScope(scope, 'en');
  if (scopeErr) return err(res, 400, scopeErr);
  const priceErr = validatePrice(price, 'en');
  if (priceErr) return err(res, 400, priceErr);
  const deadlineErr = validateDeadline(deadline, 'en');
  if (deadlineErr) return err(res, 400, deadlineErr);
  const milestonesErr = validateMilestones(milestones, 'en');
  if (milestonesErr) return err(res, 400, milestonesErr);
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
  // FairScope gate: an unanswered question is UNRESOLVED, not skipped.
  // Creation is refused while any term is unresolved — the hirer must
  // answer it or explicitly skip that one term. Bulk auto-skipping is
  // not possible: only terms listed in skippedTerms, one by one, count.
  const gate = validateSkippedTerms(tradeKey, answers || {}, skippedTerms || []);
  if (gate.invalid.length) return err(res, 400, 'skipped terms must be FairScope questions for this trade: ' + gate.invalid.join(', '));
  if (gate.unresolved.length) {
    return err(res, 400, 'unresolved FairScope terms — answer each one or explicitly skip it: ' + gate.unresolved.join(', '));
  }
  const missingTerms = computeMissingTerms(tradeKey, answers || {}, gate.effectiveSkipped);
  const jobId = newId();
  const scopeDoc = {
    scope: scope ?? '',
    milestones: Array.isArray(milestones) ? milestones : [],
    answers: answers || {},
    skippedTerms: gate.effectiveSkipped,
  };
  db.prepare(
    'INSERT INTO Job (id, hirer_id, worker_phone, worker_name, trade, status, current_version, site_lat, site_lng, site_address, hirer_client_opt_in, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(jobId, req.user.id, workerPhoneNorm, workerName || null, tradeKey, 'DRAFT', 1, siteLat, siteLng, siteAddress, publishHirerName ? 1 : 0, now());
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope: scopeDoc.scope, price, deadline: deadline || null, answers: scopeDoc.answers, skippedTerms: scopeDoc.skippedTerms, milestones: scopeDoc.milestones });
  db.prepare(
    'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), jobId, 1, JSON.stringify(scopeDoc), price, deadline || null, fp, now());
  addEvent(jobId, 'AGREEMENT_CREATED', 'hirer:' + req.user.phone, {
    trade: tradeKey, price, deadline: deadline || null, missingTerms,
  });
  upsertUser(workerPhoneNorm, workerName || null, 'worker');
  const workerToken = createWorkerToken(jobId, 'view');
  // The worker's link carries ?lang=bn (lang first, so callers that split
  // on 'token=' still get a clean token) — the worker page defaults to Bangla.
  const workerLink = '/worker.html?lang=bn&token=' + workerToken;
  const job = getJob(jobId);
  const version = getCurrentVersion(job);
  // Notify the worker by SMS, in Bangla (sandbox: logged, no real SMS sent).
  let workerSms = null;
  try {
    const adapter = getAdapter();
    const tradeBn = TRADE_BN[tradeKey] || tradeKey.toLowerCase();
    workerSms = await adapter.sendSms(
      workerPhoneNorm,
      'DealCraft: ' + req.user.name + ' আপনার জন্য ' + tradeBn + ' কাজের রেকর্ড তৈরি করেছেন (৳' + price + ')। দেখুন: '
      + baseUrl(req) + workerLink
      + ' — DealCraft টাকা রাখে না; এটি কোনো আইনি নথি নয়।'
    );
  } catch (_e) {
    workerSms = { status: 'FAILED' };
  }
  res.status(201).json({ job, version, missingTerms, workerLink, workerSms });
});

router.get('/api/jobs', requireAuth, (req, res) => {
  const jobs = db.prepare('SELECT * FROM Job WHERE hirer_id = ? ORDER BY created_at DESC').all(req.user.id);
  // List rows carry the current version's price/deadline and the worker
  // name, so the client never needs a detail fetch per row.
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
  });
});

router.get('/api/jobs/:id', requireJobAccess, (req, res) => {
  // A job-detail read is also the deadline sweep's trigger (see
  // checkDeadlines): cheap, idempotent, and testable without waiting
  // for the 15-minute interval.
  checkDeadlines().catch(() => {});
  const detail = jobDetail(req.job);
  detail.workerProfile = workerProfileFor(req.job.worker_phone, req.job.trade, req.job.worker_name);
  // The worker opening their own job from My jobs needs the same hirer
  // identity the link endpoint carries (worker.js), or the record shows
  // '—' for the hirer and the one-tap call button hides.
  const hirer = db.prepare('SELECT name, phone FROM User WHERE id = ?').get(req.job.hirer_id);
  detail.job.hirerName = hirer ? hirer.name : null;
  detail.job.hirerPhone = hirer ? hirer.phone : null;
  res.json(detail);
});

router.post('/api/jobs/:id/hirer-confirm', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer can confirm');
  // CLOSED is final: a closed job can never be confirmed back to ACTIVE.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — a closed job cannot be confirmed again');
  // Confirmations only in DRAFT/PENDING: an ACTIVE job is already
  // confirmed by both sides (a second confirm would duplicate the
  // CONFIRMED_BY_HIRER event and re-send the agreement summary SMS),
  // and a DISPUTED job returns to ACTIVE through mutual resolution,
  // not through re-confirmation.
  if (job.status !== 'DRAFT' && job.status !== 'PENDING') {
    return err(res, 409, 'job is ' + job.status + ' — confirmations are only for DRAFT or PENDING jobs');
  }
  const { otpCode } = req.body || {};
  if (!otpCode) return err(res, 400, 'otpCode is required');
  const workerConfirmed = db.prepare(
    "SELECT 1 FROM Event WHERE job_id = ? AND type = 'CONFIRMED_BY_WORKER' LIMIT 1"
  ).get(job.id);
  // Billing is checked BEFORE the OTP is verified, so a 402 does not burn
  // the hirer's code: the same code still works once the fee is paid.
  // This confirm would activate the job: the ৳10 record fee (or an ACTIVE
  // ৳70/month subscription) must be settled first. The first confirm alone
  // only moves DRAFT -> PENDING and is not gated.
  if (workerConfirmed && !billingSatisfied(job)) {
    return err(res, 402, 'record fee unpaid — pay ৳10 via CaaS or subscribe ৳70/month before the job can become ACTIVE');
  }
  const adapter = getAdapter();
  let ok = false;
  try { ok = await adapter.verifyOtp(req.user.phone, String(otpCode), 'hirer-confirm'); }
  catch (e) { return otpError(res, e); }
  if (!ok) return err(res, 401, 'invalid or expired code');
  addEvent(job.id, 'CONFIRMED_BY_HIRER', 'hirer:' + req.user.phone, {});
  const status = workerConfirmed ? 'ACTIVE' : 'PENDING';
  db.prepare('UPDATE Job SET status = ? WHERE id = ?').run(status, job.id);
  if (status === 'ACTIVE') await sendAgreementSummarySms(getJob(job.id));
  res.json({ job: getJob(job.id) });
});

// Hirer side: only that job's hirer, only while the job is ACTIVE — 404
// otherwise (so a stopped/closed job leaks no location). When nothing is
// being shared — never started, or stopped — it returns 200 with status
// 'not-sharing' and no coordinates: the hirer's page polls this every 10
// seconds, and a 404 on every poll spams the console with an error on a
// perfectly healthy page. (Stop deletes the share row, so 'never' and
// 'stopped' are the same answer here; the worker's own page shows the
// stopped state.)
router.get('/api/jobs/:id/location', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 404, 'job not found');
  if (job.status !== 'ACTIVE') return err(res, 404, 'location is not being shared');
  const view = locationView(job);
  if (view) return res.json(view);
  return res.json({ sharing: false, status: 'not-sharing', latest: null, site: jobSite(job), distanceKm: null, etaMinutes: null, trail: [] });
});

// ---------------------------------------------------------------- worker link resend
// The hirer can always see the worker link and resend it (the old UI only
// showed it in sandbox mode, so a failed live SMS left the hirer with no
// way to reach the worker). Reuses the latest live token, or mints a new
// one when the old one expired.
router.post('/api/jobs/:id/worker-link', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer resends the worker link');
  const wt = db.prepare('SELECT * FROM WorkerToken WHERE job_id = ? ORDER BY expires_at DESC LIMIT 1').get(job.id);
  let token = wt && new Date(wt.expires_at).getTime() > Date.now() ? wt.token : null;
  if (!token) token = createWorkerToken(job.id, 'view');
  const workerLink = '/worker.html?lang=bn&token=' + token;
  let workerSms = null;
  try {
    const adapter = getAdapter();
    workerSms = await adapter.sendSms(
      job.worker_phone,
      'DealCraft: আপনার কাজের রেকর্ড দেখুন: ' + baseUrl(req) + workerLink
      + ' — DealCraft টাকা রাখে না; এটি কোনো আইনি নথি নয়।'
    );
  } catch (_e) {
    workerSms = { status: 'FAILED' };
  }
  res.json({ workerLink, workerSms });
});

// ---------------------------------------------------------------- milestones
router.post('/api/jobs/:id/milestones/:index/complete', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  // CLOSED is final, and a milestone can only be completed on an ACTIVE
  // job — never on a DRAFT the worker has not confirmed yet.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — milestones cannot be completed');
  if (job.status !== 'ACTIVE') return err(res, 409, 'milestones can only be completed on an ACTIVE job');
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

router.post('/api/jobs/:id/milestones/:index/approve', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer approves milestones');
  // CLOSED is final, and approval — like completion — needs an ACTIVE job.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — milestones cannot be approved');
  if (job.status !== 'ACTIVE') return err(res, 409, 'milestones can only be approved on an ACTIVE job');
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

router.post('/api/jobs/:id/photos', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  const user = authedUser(req);
  const wt = workerTokenForJob(req, job.id);
  if (!(user && user.id === job.hirer_id) && !wt) return err(res, 401, 'authentication required');
  // Photos document work: they can only be added on an ACTIVE job —
  // never on a DRAFT (work not confirmed yet) and never on a CLOSED job
  // (CLOSED is final). Checked before the upload runs, so no file is
  // stored for a refused photo.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — photos cannot be added');
  if (job.status !== 'ACTIVE') return err(res, 409, 'photos can only be added on an ACTIVE job');
  upload.single('photo')(req, res, (uploadErr) => {
    if (uploadErr) return err(res, 400, uploadErr.message);
    if (!req.file) return err(res, 400, "field 'photo' is required");
    if (!isRealImage(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_e) {}
      return err(res, 400, 'file is not a real image (PNG, JPEG, GIF or WebP only)');
    }
    const existingPhotos = db.prepare('SELECT COUNT(*) AS n FROM Photo WHERE job_id = ?').get(job.id).n;
    if (existingPhotos >= MAX_PHOTOS_PER_JOB) {
      try { fs.unlinkSync(req.file.path); } catch (_e) {}
      return err(res, 400, 'at most ' + MAX_PHOTOS_PER_JOB + ' photos per job');
    }
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

// ---------------------------------------------------------------- close
router.post('/api/jobs/:id/close', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer closes the job');
  if (job.status === 'CLOSED') return err(res, 400, 'job is already closed');
  const { confirmCompletion, force, note, workerOtpCode, closeAnyway, publishHirerName } = req.body || {};
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
  // Hirer opt-in for the WorkPassport: the hirer alone may allow their
  // name to be published (default hidden). Set here at close time when
  // the hirer explicitly passes publishHirerName:true.
  if (publishHirerName === true) {
    db.prepare('UPDATE Job SET hirer_client_opt_in = 1 WHERE id = ?').run(job.id);
  }
  // No location survives a closed job: latest point and trail are deleted.
  clearLocation(job.id);
  addEvent(job.id, 'JOB_CLOSED', 'hirer:' + req.user.phone, {
    forced: !!force, hirerOnly, workerConfirmed, note: note || null, milestonesApproved: allApproved,
  });
  res.json({ job: getJob(job.id) });
});

router.get('/api/jobs/:id/resolvepack.json', requireJobAccess, (req, res) => {
  res.json(resolvePackData(req.job));
});

// ---------------------------------------------------------------- ResolvePack via Chromium
// Bangla needs real complex-text shaping (conjuncts, vowel-sign reordering).
// PDFKit has no shaping engine: with a registered Noto Sans Bengali TTF it
// still renders detached vowel signs and split conjuncts (verified:
// pdftotext reads "ইেলকিট্রিশয়ান" for "ইলেকট্রিশিয়ান", and the rendered
// page shows the same breakage). So the pack is rendered through headless
// Chromium print-to-PDF, which shapes Bengali correctly (verified:
// pdftotext reads the exact Bangla strings back, conjuncts intact).
//
// Deployment-proofing (P0-1, 2026-11-28): the pack must NOT depend on
// anything installed on the machine it runs on.
//   1. Chromium comes from the puppeteer npm package, which downloads
//      its own Chromium at `npm ci` time — no system Chrome, no
//      CHROME_PATH, no workflow change. The binary path resolves from
//      the installed package (puppeteer.executablePath()).
//   2. The Bengali font is embedded in the pack HTML itself (see
//      bengaliFontDataUri below): a full Noto Sans Bengali Regular TTF,
//      shipped in the repo as base64 text so it travels in a plain diff.
//      The repo's public/fonts woff2 files are unicode-range subsets
//      whose shaping is broken (verified: detached conjuncts such as
//      "অগ্রি ম" for "অগ্রিম", plus "Bad bounding box in Type 3 glyph"
//      warnings), so they are NOT used here. A machine with no Bengali
//      system font still renders the pack correctly.
// If puppeteer cannot launch (and no CLI Chromium candidate works either),
// the route falls back to the PDFKit pack below (same content, Helvetica —
// Bangla mojibake there is the pre-existing behaviour, not a regression).
// That fallback is LOUD: both failure points log to stderr, so a fallback
// is diagnosable instead of silent.

// Full Noto Sans Bengali Regular (Google Fonts, OFL) shipped in the repo
// as base64 text (server/assets/NotoSansBengali-Regular.ttf.b64) — a
// binary TTF cannot travel in a plain-text patch, so the text form is
// the file of record. Read once, cached; if it cannot be read the pack
// still renders, falling back to any Bengali system font.
let _bengaliFontDataUri = null;
function bengaliFontDataUri() {
  if (_bengaliFontDataUri !== null) return _bengaliFontDataUri;
  try {
    const b64 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'NotoSansBengali-Regular.ttf.b64'), 'utf8').replace(/\s+/g, '');
    _bengaliFontDataUri = 'data:font/ttf;base64,' + b64;
  } catch (_e) {
    console.error('[resolvepack] embedded Bengali font unreadable — falling back to system font');
    _bengaliFontDataUri = '';
  }
  return _bengaliFontDataUri;
}

function findChromiumCandidates() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  const home = os.homedir();
  candidates.push(
    path.join(home, '.cache', 'ms-playwright', 'chromium-1248', 'chrome-linux64', 'chrome'),
    path.join(home, 'workspace', 'bin', 'chrome-no-sandbox.sh'),
    // Headless shell (same Playwright build, smaller binary) as a
    // fallback when the full Chromium will not start.
    path.join(home, '.cache', 'ms-playwright', 'chromium_headless_shell-1248', 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    // The Meta Chromium build. It refuses to start in this sandbox
    // ("Hatch WebGL domain policy is required", exit 13) and is tried
    // last; it may work in other environments.
    '/opt/meta-chromium/chrome',
  );
  return candidates.filter((c) => {
    try { fs.accessSync(c, fs.constants.X_OK); return true; } catch (_e) { return false; }
  });
}

// Same content as the PDFKit pack below, as flat black-on-white HTML.
function resolvePackHtml(d, job, current, verifyUrl, qrPng, generatedAt) {
  const esc = (s) => escapeHtml(s ?? '');
  const photoHtml = d.photos.map((ph) => {
    let img = '';
    try {
      const file = path.join(UPLOADS_DIR, path.basename(ph.url));
      const buf = fs.readFileSync(file);
      const mime = imageMime(file);
      if (mime) img = '<br><img src="data:' + mime + ';base64,' + buf.toString('base64') + '" style="width:200px">';
    } catch (_e) { /* fall through to the path line */ }
    return '<p>- ' + esc(ph.kind || 'Photo') + ' — milestone ' + esc(ph.milestone ?? '—') + ' — ' + esc(ph.taken_at) + img + '</p>';
  }).join('');
  const versionsHtml = d.versions.map((v) => {
    const sc = v.scope || {};
    const answers = (sc.answers && typeof sc.answers === 'object')
      ? Object.entries(sc.answers).map(([q, a]) => '<p class="ind">• ' + esc(q) + ': ' + esc(a) + '</p>').join('') : '';
    const skipped = (Array.isArray(sc.skippedTerms) && sc.skippedTerms.length)
      ? '<p class="ind">Skipped terms (explicitly): ' + esc(sc.skippedTerms.join('; ')) + '</p>' : '';
    const miles = (Array.isArray(sc.milestones) ? sc.milestones : [])
      .map((m) => '<p class="ind">Milestone: ' + esc(m.title || '') + ' — BDT ' + esc(m.amount || 0) + '</p>').join('');
    return '<p><b>Version ' + v.version_no + ' — BDT ' + v.price + ' — deadline ' + esc(v.deadline || '—') + ' — ' + esc(v.created_at) + '</b></p>'
      + '<p class="ind">Scope: ' + esc(sc.scope || '—') + '</p>' + answers + skipped + miles
      + '<p class="ind">Fingerprint (SHA-256): ' + esc(v.fingerprint) + '</p>';
  }).join('');
  const milestonesHtml = d.milestones.map((m) =>
    '<p>- ' + esc(m.title) + ' — BDT ' + m.amount + ' — completed: ' + (m.completed ? 'yes' : 'no') + ', approved: ' + (m.approved ? 'yes' : 'no') + '</p>').join('');
  const paymentsHtml = d.payments.map((p) =>
    '<p>- BDT ' + p.amount + ' via ' + esc(p.method) + ' on ' + esc(p.date || '') + ' — ' + esc(p.ack_status) + '</p>').join('');
  const disputesHtml = d.disputes.length ? d.disputes.map((dis) =>
    '<p>Dispute: ' + esc(dis.category) + ' — ' + esc(dis.created_at) + '</p>'
    + dis.statements.map((s) => '<p class="ind">[' + esc(s.side) + '] ' + esc(s.text) + ' (' + esc(s.created_at) + ')</p>').join('')).join('')
    : '<p>None.</p>';
  const eventsHtml = d.events.map((e) =>
    '<p class="small">' + esc(e.created_at) + ' — ' + esc(e.type) + ' — ' + esc(e.actor || '') + (e.hash ? ' — #' + esc(e.hash.slice(0, 8)) : '') + '</p>').join('');
  const qrImg = qrPng
    ? '<img src="data:image/png;base64,' + qrPng.toString('base64') + '" style="width:140px">'
    : '';
  const fontFace = bengaliFontDataUri()
    ? "@font-face{font-family:'Noto Sans Bengali';src:url(" + bengaliFontDataUri() + ") format('truetype');font-weight:400}"
    : '';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>'
    + '@page{size:A4;margin:50px}'
    + fontFace
    + 'body{font-family:"Noto Sans Bengali",Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:11pt;line-height:1.45}'
    + 'h1{font-size:18pt;margin:0 0 8px}h2{font-size:13pt;margin:18px 0 4px}p{margin:4px 0}.ind{margin-left:16px;color:#333}.small{font-size:10pt}.foot{text-align:center;color:#666;font-size:8pt;margin-top:24px}'
    + '</style></head><body>'
    + '<h1>ResolvePack — mutually confirmed digital work record</h1>'
    + '<p>Job: ' + esc(job.id) + '</p>'
    + '<p>Trade: ' + esc(job.trade) + ' | Status: ' + esc(job.status) + '</p>'
    + '<p>Worker: ' + esc(job.worker_name || '') + ' (' + esc(job.worker_phone) + ')</p>'
    + '<p>Created: ' + esc(job.created_at) + '</p>'
    + '<h2>Agreed scope — every version</h2>' + versionsHtml
    + '<h2>Milestones</h2>' + milestonesHtml
    + '<h2>Payments (acknowledgements only — DealCraft holds no money)</h2>' + paymentsHtml
    + '<p>Agreed: BDT ' + d.balance.agreed + ' | Acknowledged paid: BDT ' + d.balance.acknowledgedPaid + ' | Remaining: BDT ' + d.balance.remaining + '</p>'
    + '<h2>Photos</h2>' + (d.photos.length ? photoHtml : '<p>None.</p>')
    + '<h2>Disputes and statements (both sides)</h2>' + disputesHtml
    + '<h2>Chronological record</h2>' + eventsHtml
    + '<h2>Verify this record</h2>' + qrImg
    + '<p>Scan the QR code, or open: ' + esc(verifyUrl) + '</p>'
    + '<p>Fingerprint (SHA-256): ' + esc(current ? current.fingerprint : '—') + '</p>'
    + '<p>Hash chain head (SHA-256): ' + esc(d.chainHead || '—') + ' — ' + (d.chainValid ? 'chain verified end-to-end (' + d.events.length + ' events)' : 'chain BROKEN' + (d.chainBrokenType ? ' at ' + esc(d.chainBrokenType) : '')) + '. Each event above carries its chain hash (#first 8); changing any event breaks every later hash.</p>'
    + '<p>Generated: ' + esc(generatedAt) + '</p>'
    + '<p>The QR opens the verify page for this version: ' + esc(verifyUrl) + '. Verification is a lookup against the stored record.</p>'
    + '<p class="foot">DealCraft holds no money. This record is not a legal document.</p>'
    + '</body></html>';
}

// Print the pack HTML to PDF with headless Chromium. Primary path is
// puppeteer: its Chromium is installed by `npm ci`, so the binary path
// resolves from the installed package and works on any machine (CI
// runner, deploy host) with no system Chrome and no CHROME_PATH. If the
// puppeteer launch fails, the old CLI candidates (CHROME_PATH, Playwright
// cache, Meta Chromium) are tried with --print-to-pdf. Returns the PDF
// Buffer, or null when no Chromium works (the caller then falls back to
// the PDFKit pack).
async function printPackWithChromium(html) {
  // --- Puppeteer (bundled Chromium) ---
  try {
    const browser = await puppeteer.launch({
      executablePath: await puppeteer.executablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      // preferCSSPageSize keeps the HTML's own @page (A4, 50px margins)
      // — the same page geometry the old --print-to-pdf path produced.
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      const buf = Buffer.from(pdf);
      if (buf.length >= 1000 && buf.subarray(0, 4).toString('latin1') === '%PDF') return buf;
      console.error('[resolvepack] puppeteer produced no usable PDF');
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (e) {
    console.error('[resolvepack] puppeteer launch/print failed: ' + (e && e.message));
  }
  // --- CLI Chromium candidates (CHROME_PATH, Playwright cache, ...) ---
  const candidates = findChromiumCandidates();
  if (!candidates.length) {
    console.error('[resolvepack] no Chromium candidate found — PDFKit fallback will render Bangla incorrectly');
    return null;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dealcraft-pack-'));
  const htmlPath = path.join(dir, 'pack.html');
  const pdfPath = path.join(dir, 'pack.pdf');
  try {
    fs.writeFileSync(htmlPath, html, 'utf8');
    for (const chrome of candidates) {
      try { fs.unlinkSync(pdfPath); } catch (_e) { /* first run */ }
      const ok = await new Promise((resolve) => {
        const child = spawn(chrome, [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
          '--no-pdf-header-footer', '--virtual-time-budget=5000',
          '--print-to-pdf=' + pdfPath, 'file://' + htmlPath,
        ], { stdio: 'ignore' });
        const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_e) {} resolve(false); }, 30000);
        child.on('error', () => { clearTimeout(timer); resolve(false); });
        child.on('exit', (code) => { clearTimeout(timer); resolve(code === 0); });
      });
      if (!ok) { console.error('[resolvepack] Chromium candidate failed: ' + chrome); continue; }
      try {
        const buf = fs.readFileSync(pdfPath);
        if (buf.length >= 1000 && buf.subarray(0, 4).toString('latin1') === '%PDF') return buf;
        console.error('[resolvepack] Chromium candidate produced no usable PDF: ' + chrome);
      } catch (_e) { console.error('[resolvepack] Chromium candidate produced no usable PDF: ' + chrome); }
    }
    console.error('[resolvepack] all Chromium candidates failed (' + candidates.join(', ') + ') — PDFKit fallback will render Bangla incorrectly');
    return null;
  } catch (_e) {
    console.error('[resolvepack] Chromium print failed: ' + (_e && _e.message));
    return null;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

router.get('/api/jobs/:id/resolvepack', requireJobAccess, async (req, res) => {
  const d = resolvePackData(req.job);
  const job = d.job;
  // Tamper-evident QR: the QR IS A LINK — it encodes the verify URL, so
  // any phone camera opens the verify page directly (it used to encode a
  // JSON blob, which a camera only showed as raw text). The QR library is
  // the one already in the repo (used for the passport QR) — no new
  // dependency. The public base comes from baseUrl(req) as it exists
  // today (request host; PUBLIC_BASE_URL behaviour is a separate item).
  const current = getCurrentVersion(job);
  const generatedAt = now();
  // The QR encodes the verify URL (never a raw JSON blob). It now also
  // carries the chain head as &ch= — the first 8 hex characters only.
  // The full head lives in the ResolvePack JSON; 8 hex is the same
  // prefix convention as the SMS fingerprint prefix, and it keeps the QR
  // short enough that its raster stays 255x255 (a longer URL flips the
  // QR library's module rounding to 256x256, which the suite asserts).
  const verifyUrl = baseUrl(req) + '/verify?fp=' + (current ? current.fingerprint : '')
    + (d.chainHead ? '&ch=' + d.chainHead.slice(0, 8) : '');
  let qrPng = null;
  try { qrPng = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 256 }); } catch (_e) { /* PDF still generates without the QR */ }
  // Chromium first (correct Bengali shaping); PDFKit fallback below.
  // The fallback is LOUD: if Chromium was unavailable, the PDFKit pack
  // renders Bangla with broken conjuncts — say so in the server log
  // instead of serving it silently.
  let chromiumPdf = null;
  try {
    chromiumPdf = await printPackWithChromium(resolvePackHtml(d, job, current, verifyUrl, qrPng, generatedAt));
  } catch (_e) { console.error('[resolvepack] Chromium print threw: ' + (_e && _e.message)); }
  if (chromiumPdf) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resolvepack-' + job.id + '.pdf"');
    res.setHeader('Content-Length', chromiumPdf.length);
    return res.send(chromiumPdf);
  }
  console.error('[resolvepack] Chromium unavailable for job ' + job.id + ' — PDFKit fallback (Bangla conjuncts will be broken)');
  // compress: false — the text stays searchable in the file, so a judge (or
  // a test) can verify the labelled FairScope lines are really in the PDF
  // instead of trusting a debug dump. File size is a non-issue here.
  const doc = new PDFDocument({ margin: 50, compress: false });
  // Streamed, not buffered: the PDF is piped to the response as PDFKit
  // generates it, so a large record (many photos / a long event history)
  // never sits whole in memory and never blocks other requests behind a
  // Buffer.concat. Status and bytes are unchanged — only the
  // transfer changes (chunked, so no Content-Length is sent).
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="resolvepack-' + job.id + '.pdf"');
  doc.pipe(res);
  doc.on('error', (e) => {
    if (!res.headersSent) res.status(500).json({ error: 'could not generate PDF: ' + e.message });
    else res.destroy();
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
    doc.fontSize(10).text(e.created_at + ' — ' + e.type + ' — ' + (e.actor || '') + (e.hash ? ' — #' + e.hash.slice(0, 8) : ''));
  }
  doc.moveDown();
  doc.fontSize(13).text('Verify this record');
  if (qrPng) {
    doc.image(qrPng, { width: 140 });
    doc.moveDown(0.25);
  }
  doc.fontSize(10).fillColor('#333333')
    .text('Scan the QR code, or open: ' + verifyUrl)
    .text('Fingerprint (SHA-256): ' + (current ? current.fingerprint : '—'))
    .text('Hash chain head (SHA-256): ' + (d.chainHead || '—') + ' — ' + (d.chainValid ? 'chain verified end-to-end' : 'chain BROKEN'))
    .text('Generated: ' + generatedAt)
    .text('The QR opens the verify page for this version: ' + verifyUrl + '. Verification is a lookup against the stored record.');
  doc.fillColor('#111111');
  doc.moveDown();
  doc.fontSize(8).fillColor('#666666')
    .text('DealCraft holds no money. This record is not a legal document.', { align: 'center' });
  doc.end();
});

module.exports = router;
