// DealCraft routes — ChangeLock proposals. Extracted verbatim from server/server.js
// (route split; no behaviour change). Paths, middleware and responses
// are identical to the monolith.
const express = require('express');
const { db, now, fingerprint, newId, getAdapter, err, addEvent, getJob, getCurrentVersion, parseScopeJson, workerTokenForJob, authedUser, otpError, requireJobAccess, actorOf, sideOf, validatePrice, validateDeadline, validateScope, validateMilestones, rescaleMilestones, vmsg } = require('../src/shared');
const router = express.Router();


// ---------------------------------------------------------------- changes
router.post('/api/jobs/:id/changes', requireJobAccess, (req, res) => {
  const job = req.job;
  // CLOSED is final: no new change proposal on a closed job.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — changes cannot be proposed');
  // Changes are for work in progress: only an ACTIVE job can take a new
  // proposal. A DRAFT has no confirmed agreement to change yet, and a
  // DISPUTED job is resolved through mutual resolution, not a new version.
  if (job.status !== 'ACTIVE') return err(res, 409, 'changes can only be proposed on an ACTIVE job');
  const { priceDelta, deadline, reason, details } = req.body || {};
  if (typeof priceDelta !== 'number' && !deadline && !details) {
    return err(res, 400, 'priceDelta, deadline or details is required');
  }
  // Validation, in the proposer's language (the worker proposes in Bangla).
  const lang = sideOf(req, job) === 'worker' ? 'bn' : 'en';
  // The revised price must stay positive and inside the sane band: a
  // change that would make the agreement free, negative or absurd is
  // refused up front, not at acceptance.
  if (typeof priceDelta === 'number') {
    const current = getCurrentVersion(job);
    if (current) {
      const priceErr = validatePrice(current.price + priceDelta, lang);
      if (priceErr) return err(res, 400, priceErr);
    }
  }
  const deadlineErr = validateDeadline(deadline, lang);
  if (deadlineErr) return err(res, 400, deadlineErr);
  if (details && details.scope !== undefined) {
    const scopeErr = validateScope(details.scope, lang);
    if (scopeErr) return err(res, 400, scopeErr);
  }
  if (details && details.milestones !== undefined) {
    const milestonesErr = validateMilestones(details.milestones, lang);
    if (milestonesErr) return err(res, 400, milestonesErr);
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
  // CLOSED is final: a change can never be accepted (or answered) on a
  // closed job. Checked before any OTP is verified, so no code is burned.
  if (job.status === 'CLOSED') return err(res, 409, 'job is CLOSED — changes cannot be decided');
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
    // Milestone reconciliation: when the milestone list partitions the old
    // price (or the proposal supplied an explicit list), rescale it
    // proportionally to the new total — whole taka, last milestone absorbs
    // the remainder — so sum(milestones) == new price. A partial list
    // (e.g. an advance only, summing below the old price) is left alone:
    // its amounts are absolute, not shares of the total. The rescale is
    // recorded in the change event so the timeline explains itself.
    const candidate = Array.isArray(newScope.milestones) ? newScope.milestones : [];
    const candidateSum = candidate.reduce((s, m) => s + (Number(m && m.amount) || 0), 0);
    const explicitList = Array.isArray(details.milestones);
    const shouldRescale = candidate.length > 0
      && candidateSum > 0
      && candidateSum !== newPrice
      && (explicitList || candidateSum === current.price);
    let milestoneRescale = null;
    if (shouldRescale) {
      const r = rescaleMilestones(candidate, newPrice);
      if (r.rescaled) {
        newScope.milestones = r.milestones;
        milestoneRescale = { oldTotal: r.oldTotal, newTotal: newPrice, milestones: r.milestones };
      }
    }
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
        milestoneRescale,
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
