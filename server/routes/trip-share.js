// DealCraft routes — shareable live-trip link.
// The hirer creates one link per job (/trip/<token>); anyone with the
// link sees the worker's live position and arrival state — never a phone
// number. The position comes from LocationShare, the status from the
// job/location state (locationView), exactly as the hirer's own map does.
const express = require('express');
const { db, now, randomToken, err, getJob, getLocationShare, locationView, requireAuth } = require('../src/shared');
const router = express.Router();

// Hirer only, and only for their own job. One active token per job —
// the existing token is reused when present, so re-sharing the link
// never invalidates a link already sent out.
router.post('/api/jobs/:id/share-trip', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer shares this trip');
  const existing = db.prepare('SELECT * FROM TripShare WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(job.id);
  const token = existing ? existing.token : randomToken();
  if (!existing) {
    db.prepare('INSERT INTO TripShare (token, job_id, created_at) VALUES (?, ?, ?)')
      .run(token, job.id, now());
  }
  res.json({ url: '/trip/' + token });
});

// Public: no auth, no phone numbers. Unknown token is 404.
router.get('/api/trip/:token', (req, res) => {
  const share = db.prepare('SELECT * FROM TripShare WHERE token = ?').get(req.params.token);
  if (!share) return err(res, 404, 'trip not found');
  const job = getJob(share.job_id);
  if (!job) return err(res, 404, 'trip not found');
  const view = locationView(job);
  const loc = getLocationShare(job.id);
  if (!view || !loc) {
    return res.json({
      trade: job.trade, worker_name: job.worker_name || null,
      status: 'not-sharing', lat: null, lng: null, updated_at: null, eta_minutes: null,
    });
  }
  res.json({
    trade: job.trade,
    worker_name: job.worker_name || null,
    status: view.status,
    lat: view.latest ? view.latest.lat : null,
    lng: view.latest ? view.latest.lng : null,
    updated_at: loc.updated_at || null,
    eta_minutes: view.etaMinutes != null ? view.etaMinutes : null,
  });
});

module.exports = router;
