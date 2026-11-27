// DealCraft routes — WorkPassport + fingerprint verify. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const path = require('node:path');
const QRCode = require('qrcode');
const { db, now, fingerprint, newId, PUBLIC_DIR, err, baseUrl, getJob, getCurrentVersion, parseScopeJson, workerTokenForJob, getOrCreateProfileId, profilePhone, passportData, verifyChain } = require('../src/shared');
const router = express.Router();


// ---------------------------------------------------------------- verify
// Tamper-evident lookup: does this fingerprint match a stored version?
// A lookup, not a signature and not a chain — it only answers whether
// the fingerprint in a ResolvePack QR is the one stored for that version.
// Truthful verdicts only:
//  - the job STATUS is reported (DRAFT / PENDING / ACTIVE / CLOSED), and a
//    DRAFT or PENDING job is never described as "confirmed by both sides"
//    (confirmedByBothSides is true only for ACTIVE / CLOSED);
//  - versionState is 'current' or 'superseded': a superseded version still
//    verifies as authentic, but the response says so and names the current
//    version and its price, so an old pack cannot pass as the live deal;
//  - scope (the text the fingerprint covers) and the current agreed price
//    are returned, so the page recomputes and displays what the
//    fingerprint actually covers — a doctored PDF carrying a real QR
//    cannot pass silently.
// The summary SMS carries only the first 8 fingerprint characters, so an
// 8+ hex-character prefix is accepted too: a unique prefix match verifies
// exactly like a full match and is labelled "prefix match from SMS"; a
// prefix shared by several versions asks for the full fingerprint instead
// of returning a bare false. Existing fields keep their meanings; the new
// fields are additive.
router.get('/api/verify', (req, res) => {
  const fp = req.query.fp;
  if (!fp || typeof fp !== 'string') return err(res, 400, 'fp (fingerprint) is required');
  const clean = fp.trim().toLowerCase();
  const isHex = /^[0-9a-f]+$/.test(clean);
  let row = null;
  let prefixMatch = false;
  let ambiguous = false;
  if (clean.length === 64 && isHex) {
    row = db.prepare('SELECT * FROM JobVersion WHERE fingerprint = ?').get(clean);
  } else if (clean.length >= 8 && clean.length < 64 && isHex) {
    const rows = db.prepare('SELECT * FROM JobVersion WHERE fingerprint LIKE ?').all(clean + '%');
    if (rows.length === 1) { row = rows[0]; prefixMatch = true; }
    else if (rows.length > 1) ambiguous = true;
  }
  if (ambiguous) {
    return res.json({
      match: false, fingerprint: fp, ambiguous: true,
      reason: 'several records share this fingerprint prefix — paste the full 64-character fingerprint',
    });
  }
  if (!row) return res.json({ match: false, fingerprint: fp });
  const job = getJob(row.job_id);
  const current = job ? getCurrentVersion(job) : null;
  const isCurrent = !!current && current.version_no === row.version_no;
  const scope = parseScopeJson(row);
  // Hash chain (Part 2, item 9): the lookup also reports the chain —
  // the job's current head (hash of the last event) and whether the
  // full event history verifies from GENESIS. No per-version chain
  // head is stored: JobVersion rows are never UPDATEed (a Part 1
  // assertion pins that — see the chain.js header), so the head is
  // always recomputed from the event history. The fingerprint match
  // verdict is unchanged; the chain fields are additive, and
  // prefix/superseded behaviour is untouched.
  const events = db.prepare('SELECT * FROM Event WHERE job_id = ? ORDER BY id ASC').all(row.job_id);
  const chain = verifyChain(events);
  res.json({
    match: true, fingerprint: row.fingerprint, jobId: row.job_id, versionNo: row.version_no,
    trade: job ? job.trade : null, price: row.price, deadline: row.deadline,
    status: job ? job.status : null,
    versionState: isCurrent ? 'current' : 'superseded',
    isCurrentVersion: isCurrent,
    currentVersion: job ? job.current_version : null,
    currentPrice: current ? current.price : null,
    scope: typeof scope.scope === 'string' ? scope.scope : '',
    milestones: Array.isArray(scope.milestones) ? scope.milestones : [],
    confirmedByBothSides: !!job && (job.status === 'ACTIVE' || job.status === 'CLOSED'),
    prefixMatch,
    matchKind: prefixMatch ? 'prefix match from SMS' : 'full fingerprint match',
    chainHead: chain.chainHead,
    chainValid: chain.valid,
    chainBrokenIndex: chain.valid ? null : chain.brokenIndex,
    chainBrokenType: chain.valid ? null : chain.brokenType,
    chainEvents: events.length,
  });
});

// Small public verify page (same flat design system). Reads ?fp= from the
// URL and asks /api/verify — the match/mismatch verdict is rendered
// client-side from that lookup.
router.get('/verify', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'verify.html'));
});

router.post('/api/passport/add', (req, res) => {
  const { jobId, showAmounts, showClient, showPhotos } = req.body || {};
  if (!jobId) return err(res, 400, 'jobId is required');
  const job = getJob(jobId);
  if (!job) return err(res, 404, 'job not found');
  // Worker only: the hirer (or anyone else) cannot publish the worker's
  // record or choose what it discloses.
  const wt = workerTokenForJob(req, jobId);
  if (!wt) return err(res, 403, 'only the worker can add a job to their WorkPassport');
  if (job.status !== 'CLOSED') return err(res, 400, 'only a CLOSED job can be added to the passport');
  // Only mutually confirmed completions qualify: a forced hirer-only
  // close (closeAnyway) does not count — the worker never confirmed the
  // work was done. The JOB_CLOSED event records hirerOnly.
  const closedEv = db.prepare(
    "SELECT payload_json FROM Event WHERE job_id = ? AND type = 'JOB_CLOSED' ORDER BY id ASC LIMIT 1"
  ).get(jobId);
  let hirerOnlyClose = false;
  try { hirerOnlyClose = JSON.parse(closedEv ? closedEv.payload_json || '{}' : '{}').hirerOnly === true; } catch (_e) {}
  if (hirerOnlyClose) return err(res, 409, 'only mutually confirmed completions can be added to the WorkPassport — a hirer-only close does not qualify');
  const existing = db.prepare('SELECT id FROM PassportEntry WHERE job_id = ?').get(jobId);
  if (existing) return err(res, 409, 'this job is already in the WorkPassport');
  const id = newId();
  // The hirer's name is published ONLY with the hirer's explicit opt-in
  // (Job.hirer_client_opt_in, set by the hirer at creation or at close;
  // default hidden). The worker's showClient value is ignored — the
  // worker cannot publish the hirer's name unilaterally.
  const showClientStored = job.hirer_client_opt_in ? 1 : 0;
  db.prepare(
    'INSERT INTO PassportEntry (id, worker_phone, job_id, show_amounts, show_client, show_photos, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, job.worker_phone, jobId, showAmounts ? 1 : 0, showClientStored, showPhotos ? 1 : 0, now());
  const profileId = getOrCreateProfileId(job.worker_phone);
  res.status(201).json({ entry: db.prepare('SELECT * FROM PassportEntry WHERE id = ?').get(id), profileId });
});

router.get('/api/passport/:profileId', (req, res) => {
  const phone = profilePhone(req.params.profileId);
  if (!phone) return err(res, 404, 'passport not found');
  const data = passportData(phone);
  // Profile facts, same shape as the worker/job/bid responses: name and
  // trade were already present (workerName / trades); memberSince is new
  // (User account creation, month + year). No phone number anywhere.
  let memberSince = null;
  try {
    const user = db.prepare('SELECT created_at FROM User WHERE phone = ?').get(phone);
    const d = user ? new Date(user.created_at) : null;
    if (d && !Number.isNaN(d.getTime())) memberSince = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } catch (_e) { /* memberSince stays null — never invent a date */ }
  res.json({
    ...data,
    memberSince,
    workerProfile: {
      name: data.workerName || null,
      trade: (data.trades && data.trades[0]) || null,
      photoUrl: null,
      phoneVerified: true,
      completedJobs: data.completedJobs,
      distinctHirers: data.distinctHirers,
      memberSince,
    },
  });
});

router.get('/api/passport/:profileId/qr.png', async (req, res) => {
  const phone = profilePhone(req.params.profileId);
  if (!phone) return err(res, 404, 'passport not found');
  const url = baseUrl(req) + '/passport/' + encodeURIComponent(req.params.profileId);
  try {
    const png = await QRCode.toBuffer(url, { type: 'png', width: 256 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    return err(res, 500, 'could not generate QR code');
  }
});

router.get('/passport/:profileId', (req, res) => {
  const phone = profilePhone(req.params.profileId);
  if (!phone) return res.status(404).send('WorkPassport not found.');
  // The QR code encodes this URL, so it serves the rich passport page
  // (public/passport.html), which reads the profile id from the path and
  // loads the worker's record from the public API. The old minimal
  // server-rendered page is gone; the API endpoints are unchanged.
  res.sendFile(path.join(PUBLIC_DIR, 'passport.html'));
});

module.exports = router;
