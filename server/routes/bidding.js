// DealCraft routes — find-a-repairer bidding (FEATURE_BIDDING gated). Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, fingerprint, newId, questionsFor, computeMissingTerms, getAdapter, requireBidding, err, baseUrl, addEvent, getJob, createWorkerToken, normalizeBdPhone, requireAuth, validLatLng, upsertUser, isRealImage, upload, getBidJob, bidJobPhotos, expireBids, addBiddingEvent, bidJobPublic, bidPublic, parseBidCoords, validateDeadline, MAX_BID_PHOTOS, MAX_LIVE_BIDS_PER_JOB, BID_TTL_MS, passportData } = require('../src/shared');
const { parsePrompt } = require('../src/prompt-parse');
const router = express.Router();

// Worker profile facts — same shape as worker.js (see its comment).
// bidPublic (shared.js) already carries passport counts; the full
// workerProfile object is added here in the route, so shared.js stays
// untouched.
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
function withWorkerProfile(bids, trade) {
  return bids.map((b) => ({ ...b, workerProfile: workerProfileFor(b.workerPhone, trade, b.workerName) }));
}


// Hirer posts a job for bids: 1–3 problem photos, trade, short Bangla
// description, job site (map pin / current location / address). No price
// is set by the hirer — workers bid the price.
router.post('/api/bid-jobs', requireBidding, requireAuth, (req, res) => {
  let { trade, description, deadline, site } = req.body || {};
  // Prompt-based posting: parsed server-side; client-parsed values are
  // advisory only. The hirer sets no price here — workers bid it — so
  // only trade/description/deadline come from the prompt. A prompt
  // deadline wins over a direct deadline, exactly as POST /api/jobs
  // lets prompt values win; a direct deadline is used when the prompt
  // carries none. The deadline is stored on the BidJob (nullable).
  let promptDeadline = null;
  if (typeof (req.body || {}).prompt === 'string' && req.body.prompt.trim()) {
    const parsed = parsePrompt(req.body.prompt);
    if (parsed.trade) trade = parsed.trade;
    if (parsed.description) description = parsed.description;
    promptDeadline = parsed.deadline;
    if (!trade) {
      return err(res, 400, 'prompt is missing trade — say which trade, e.g. "need a painter for 2 rooms by Sunday"');
    }
  }
  if (!trade || !questionsFor(trade).length) return err(res, 400, 'trade must be one of ELECTRICIAN, PAINTER, PLUMBER');
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 500) {
    return err(res, 400, 'description is required (max 500 characters)');
  }
  const effectiveDeadline = promptDeadline || deadline || null;
  const deadlineErr = validateDeadline(effectiveDeadline, 'en');
  if (deadlineErr) return err(res, 400, deadlineErr);
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
    'INSERT INTO BidJob (id, hirer_id, trade, description, deadline, site_lat, site_lng, site_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(bidJobId, req.user.id, trade.toUpperCase(), description.trim(), effectiveDeadline, siteLat, siteLng, siteAddress, 'OPEN', now());
  addBiddingEvent(bidJobId, 'BID_JOB_POSTED', 'hirer:' + req.user.phone, {
    trade: trade.toUpperCase(), description: description.trim(),
    site: siteLat != null ? { lat: siteLat, lng: siteLng, address: siteAddress } : null,
    deadline: effectiveDeadline,
  });
  const out = { bidJob: getBidJob(bidJobId) };
  if (effectiveDeadline) out.deadline = effectiveDeadline;
  res.status(201).json(out);
});

// Problem photos on a bid job: same 5 MB image-only upload as milestones,
// at most 3 per job. Hirer only.
router.post('/api/bid-jobs/:id/photos', requireBidding, requireAuth, (req, res) => {
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
    if (!isRealImage(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_e) {}
      return err(res, 400, 'file is not a real image (PNG, JPEG, GIF or WebP only)');
    }
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
router.get('/api/bid-jobs/open', requireBidding, requireAuth, (req, res) => {
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

router.get('/api/bid-jobs/mine', requireBidding, requireAuth, (req, res) => {
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
router.get('/api/bid-jobs/:id', requireBidding, requireAuth, (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  expireBids(bidJob.id);
  const coords = parseBidCoords(req);
  if (coords.error) return err(res, 400, coords.error);
  const pub = bidJobPublic(bidJob, coords.lat, coords.lng);
  if (bidJob.hirer_id === req.user.id) {
    const bids = db.prepare('SELECT * FROM Bid WHERE bid_job_id = ? ORDER BY amount ASC, created_at ASC').all(bidJob.id)
      .map((b) => bidPublic(b, pub.site));
    return res.json({ bidJob: { ...pub, jobId: bidJob.job_id || null }, bids: withWorkerProfile(bids, bidJob.trade) });
  }
  return res.json({ bidJob: pub });
});

// Bids on a job, cheapest first, with distance + WorkPassport facts.
// Hirer only — another hirer (or any other user) gets 403, not the list.
router.get('/api/bid-jobs/:id/bids', requireBidding, requireAuth, (req, res) => {
  const bidJob = getBidJob(req.params.id);
  if (!bidJob) return err(res, 404, 'bid job not found');
  if (bidJob.hirer_id !== req.user.id) return err(res, 403, 'only the hirer sees bids on this job');
  expireBids(bidJob.id);
  const site = bidJob.site_lat != null ? { lat: bidJob.site_lat, lng: bidJob.site_lng } : null;
  const bids = db.prepare('SELECT * FROM Bid WHERE bid_job_id = ? ORDER BY amount ASC, created_at ASC').all(bidJob.id)
    .map((b) => bidPublic(b, site));
  res.json({ bids: withWorkerProfile(bids, bidJob.trade) });
});

// A worker places a bid: OTP-verified session only (no new account — the
// worker logs in with phone + OTP first). One live bid per worker per job,
// at most 10 live bids per job, bids expire after 24 hours.
router.post('/api/bid-jobs/:id/bids', requireBidding, requireAuth, (req, res) => {
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
router.post('/api/bid-jobs/:id/bids/:bidId/accept', requireBidding, requireAuth, async (req, res) => {
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
  const fp = fingerprint({ job_id: jobId, version_no: 1, scope: scopeDoc.scope, price: bid.amount, deadline, answers: scopeDoc.answers, skippedTerms: scopeDoc.skippedTerms, milestones: scopeDoc.milestones });
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
router.post('/api/bid-jobs/:id/close', requireBidding, requireAuth, (req, res) => {
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

module.exports = router;
