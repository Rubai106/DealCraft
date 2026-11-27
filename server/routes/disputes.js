// DealCraft routes — disputes + mutual resolution. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, newId, err, addEvent, getJob, workerTokenForJob, authedUser, requireAuth, requireJobAccess, actorOf, sideOf, clearLocation } = require('../src/shared');
const router = express.Router();

// ---------------------------------------------------------------- disputes
const DISPUTE_CATEGORIES = [
  'work not completed', 'quality', 'payment', 'scope or extra work', 'property damage',
];


router.post('/api/jobs/:id/disputes', requireJobAccess, (req, res) => {
  const job = req.job;
  // CLOSED is final: opening a dispute would flip a closed job back to
  // DISPUTED — a closed record can never be re-opened.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — disputes cannot be opened on a closed job');
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

router.post('/api/disputes/:disputeId/statements', (req, res) => {
  const dispute = db.prepare('SELECT * FROM Dispute WHERE id = ?').get(req.params.disputeId);
  if (!dispute) return err(res, 404, 'dispute not found');
  const job = getJob(dispute.job_id);
  const user = authedUser(req);
  const wt = workerTokenForJob(req, job.id);
  if (!(user && user.id === job.hirer_id) && !wt) return err(res, 401, 'authentication required');
  // CLOSED is final: no new statement (and no STATEMENT_ADDED event) on
  // a closed job's dispute.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — statements cannot be added on a closed job');
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
// A dispute is resolved by MUTUAL agreement only, in two steps:
//   1. the hirer PROPOSES how it will be resolved (RESOLUTION_PROPOSED),
//   2. the worker ACCEPTS or REJECTS it (RESOLUTION_ACCEPTED / REJECTED).
// The job returns to ACTIVE only after the worker accepts. A rejection
// keeps the job DISPUTED. Two statements alone are not agreement — the
// worker must independently confirm the resolution itself. DealCraft
// never decides and never records a verdict.
router.post('/api/disputes/:disputeId/resolve-proposal', requireAuth, (req, res) => {
  const dispute = db.prepare('SELECT * FROM Dispute WHERE id = ?').get(req.params.disputeId);
  if (!dispute) return err(res, 404, 'dispute not found');
  const job = getJob(dispute.job_id);
  if (!job) return err(res, 404, 'job not found');
  if (job.hirer_id !== req.user.id) return err(res, 403, 'only the hirer proposes a resolution');
  if (job.status !== 'DISPUTED') return err(res, 400, 'job is not DISPUTED');
  const { proposal, note } = req.body || {};
  const text = (proposal || note || '').trim();
  if (!text) return err(res, 400, 'proposal is required — say how the dispute should be resolved');
  const sides = db.prepare('SELECT DISTINCT side FROM DisputeStatement WHERE dispute_id = ?').all(dispute.id).map((r) => r.side);
  if (!sides.includes('hirer') || !sides.includes('worker')) {
    return err(res, 400, 'both sides must have a statement on record before a resolution can be proposed');
  }
  const existing = db.prepare("SELECT * FROM DisputeResolution WHERE dispute_id = ? AND status = 'PROPOSED'").get(dispute.id);
  if (existing) return err(res, 409, 'a resolution is already proposed — the worker must accept or reject it first');
  const id = newId();
  db.prepare('INSERT INTO DisputeResolution (id, dispute_id, proposed_by, proposal, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, dispute.id, 'hirer:' + req.user.phone, text, 'PROPOSED', now());
  addEvent(job.id, 'RESOLUTION_PROPOSED', 'hirer:' + req.user.phone, {
    disputeId: dispute.id, resolutionId: id, proposal: text,
  });
  res.status(201).json({ resolution: db.prepare('SELECT * FROM DisputeResolution WHERE id = ?').get(id), job: getJob(job.id) });
});

router.post('/api/disputes/:disputeId/resolve-response', (req, res) => {
  const dispute = db.prepare('SELECT * FROM Dispute WHERE id = ?').get(req.params.disputeId);
  if (!dispute) return err(res, 404, 'dispute not found');
  const job = getJob(dispute.job_id);
  if (!job) return err(res, 404, 'job not found');
  const wt = workerTokenForJob(req, job.id);
  if (!wt) return err(res, 401, 'a valid worker token is required — only the worker accepts or rejects a resolution');
  if (job.status !== 'DISPUTED') return err(res, 400, 'job is not DISPUTED');
  const resolution = db.prepare("SELECT * FROM DisputeResolution WHERE dispute_id = ? AND status = 'PROPOSED' ORDER BY created_at DESC LIMIT 1").get(dispute.id);
  if (!resolution) return err(res, 400, 'no resolution has been proposed yet');
  const { decision, note } = req.body || {};
  if (!['accept', 'reject'].includes(decision)) {
    return err(res, 400, "decision must be 'accept' or 'reject'");
  }
  if (decision === 'accept') {
    db.prepare("UPDATE DisputeResolution SET status = 'ACCEPTED' WHERE id = ?").run(resolution.id);
    db.prepare("UPDATE Job SET status = 'ACTIVE' WHERE id = ?").run(job.id);
    addEvent(job.id, 'RESOLUTION_ACCEPTED', 'worker:' + job.worker_phone, {
      disputeId: dispute.id, resolutionId: resolution.id, note: note || null,
    });
    addEvent(job.id, 'DISPUTE_RESOLVED', 'worker:' + job.worker_phone, {
      disputeId: dispute.id, mutual: true, note: note || null,
    });
  } else {
    db.prepare("UPDATE DisputeResolution SET status = 'REJECTED' WHERE id = ?").run(resolution.id);
    addEvent(job.id, 'RESOLUTION_REJECTED', 'worker:' + job.worker_phone, {
      disputeId: dispute.id, resolutionId: resolution.id, note: note || null,
    });
  }
  res.json({ resolution: db.prepare('SELECT * FROM DisputeResolution WHERE id = ?').get(resolution.id), job: getJob(job.id) });
});

module.exports = router;
