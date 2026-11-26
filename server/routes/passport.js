// DealCraft routes — WorkPassport + fingerprint verify. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const path = require('node:path');
const QRCode = require('qrcode');
const { db, now, fingerprint, newId, PUBLIC_DIR, err, baseUrl, getJob, workerTokenForJob, getOrCreateProfileId, profilePhone, passportData } = require('../src/shared');
const router = express.Router();


// ---------------------------------------------------------------- verify
// Tamper-evident lookup: does this fingerprint match a stored version?
// A lookup, not a signature and not a chain — it only answers whether
// the fingerprint in a ResolvePack QR is the one stored for that version.
router.get('/api/verify', (req, res) => {
  const fp = req.query.fp;
  if (!fp || typeof fp !== 'string') return err(res, 400, 'fp (fingerprint) is required');
  const row = db.prepare('SELECT * FROM JobVersion WHERE fingerprint = ?').get(fp);
  if (!row) return res.json({ match: false, fingerprint: fp });
  const job = getJob(row.job_id);
  res.json({
    match: true, fingerprint: fp, jobId: row.job_id, versionNo: row.version_no,
    trade: job ? job.trade : null, price: row.price, deadline: row.deadline,
    status: job ? job.status : null,
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
  const existing = db.prepare('SELECT id FROM PassportEntry WHERE job_id = ?').get(jobId);
  if (existing) return err(res, 409, 'this job is already in the WorkPassport');
  const id = newId();
  db.prepare(
    'INSERT INTO PassportEntry (id, worker_phone, job_id, show_amounts, show_client, show_photos, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, job.worker_phone, jobId, showAmounts ? 1 : 0, showClient ? 1 : 0, showPhotos ? 1 : 0, now());
  const profileId = getOrCreateProfileId(job.worker_phone);
  res.status(201).json({ entry: db.prepare('SELECT * FROM PassportEntry WHERE id = ?').get(id), profileId });
});

router.get('/api/passport/:profileId', (req, res) => {
  const phone = profilePhone(req.params.profileId);
  if (!phone) return err(res, 404, 'passport not found');
  res.json(passportData(phone));
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
