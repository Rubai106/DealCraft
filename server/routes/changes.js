// DealCraft routes — ChangeLock proposals. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, fingerprint, newId, getAdapter, err, addEvent, getJob, getCurrentVersion, parseScopeJson, workerTokenForJob, authedUser, otpError, requireJobAccess, actorOf, sideOf } = require('../src/shared');
const router = express.Router();


// ---------------------------------------------------------------- changes
router.post('/api/jobs/:id/changes', requireJobAccess, (req, res) => {
  const job = req.job;
  const { priceDelta, deadline, reason, details } = req.body || {};
  if (typeof priceDelta !== 'number' && !deadline && !details) {
    return err(res, 400, 'priceDelta, deadline or details is required');
  }
  // The revised price must stay positive: a change that would make the
  // agreement free or negative is refused up front, not at acceptance.
  if (typeof priceDelta === 'number') {
    const current = getCurrentVersion(job);
    if (current && current.price + priceDelta <= 0) {
      return err(res, 400, 'revised price must stay positive (BDT ' + current.price + ' + ' + priceDelta + ')');
    }
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

router.post('/api/changes/:changeId/respond', async (req, res) => {
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
    if (!(newPrice > 0)) return err(res, 400, 'revised price must stay positive');
    const newDeadline = change.deadline || current.deadline;
    const newVersionNo = job.current_version + 1;
    const fp = fingerprint({ job_id: job.id, version_no: newVersionNo, scope: newScope.scope, price: newPrice, deadline: newDeadline, answers: newScope.answers || {}, skippedTerms: newScope.skippedTerms || [], milestones: newScope.milestones || [] });
    // One transaction: version row + active-version update + proposal
    // status + event all land together, or none of them do — a failure
    // halfway can no longer leave a half-applied change.
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare(
        'INSERT INTO JobVersion (id, job_id, version_no, scope_json, price, deadline, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), job.id, newVersionNo, JSON.stringify(newScope), newPrice, newDeadline, fp, now());
      db.prepare('UPDATE Job SET current_version = ? WHERE id = ?').run(newVersionNo, job.id);
      db.prepare("UPDATE ChangeProposal SET status = 'APPROVED' WHERE id = ?").run(change.id);
      addEvent(job.id, 'CHANGE_APPROVED', side + ':' + (side === 'worker' ? job.worker_phone : user.phone), {
        changeId: change.id, version: newVersionNo, price: newPrice, deadline: newDeadline,
      });
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_e) {}
      return err(res, 500, 'change could not be applied: ' + e.message);
    }
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

module.exports = router;
