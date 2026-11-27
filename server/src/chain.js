// DealCraft — append-only hash chain over the Event log (Ceiling Pass,
// Part 2, item 9).
//
// Every event carries the previous event's hash:
//   event.hash = SHA-256(prevHash + canonicalJSON({type, actor, payload, created_at}))
// with prevHash = '' (GENESIS) for the first event of a job. Tampering
// with any historical event breaks every subsequent hash, so a chain that
// verifies end-to-end proves the history was not rewritten — the real
// tamper-evidence mechanism.
//
// RELATION TO FINGERPRINTS (deliberate, do not "fix"): a version's
// fingerprint is SHA-256 of the canonical AGREEMENT payload only
// (server/src/fingerprint.js), and the regression suite asserts exactly
// that (V1/V2 fingerprints recompute from the agreement fields alone —
// run-demo.mjs:270, 332, 402, 847, 1146, 1147, 1174). A chain head
// depends on the whole event history before the version, so it can never
// equal the agreement fingerprint without breaking those assertions.
// The chain therefore lives ALONGSIDE the fingerprint: the version row
// keeps its agreement fingerprint, and the chain head is recomputed from
// the event history whenever it is needed (/api/verify, ResolvePack,
// jobDetail). NO per-version chain head is stored: a stored head would
// need an UPDATE on JobVersion after the creation event is written, and
// a Part 1 assertion pins that no server file UPDATEs JobVersion at all
// (run-demo.mjs:2045-2046 — the append-only invariant). The job-level
// head (hash of the last event) is the anchor; the ResolvePack JSON
// carries it plus every event's hash, so anyone can recompute the chain
// (the verify page does exactly that, in the browser, with WebCrypto).
const crypto = require('node:crypto');
const { canonicalStringify } = require('./fingerprint');

// Genesis: the "previous hash" of the first event in a chain.
const GENESIS = '';

// The exact object hashed for one event. Only stored fields go in:
// type, actor, the parsed payload (null when the event has none) and the
// stored created_at timestamp — so the hash recomputes from the row
// alone, on the server (here) and in the browser (public/verify.html
// carries the same definition; keep the two in sync).
function eventPayloadForHash(ev) {
  return {
    type: ev.type,
    actor: ev.actor ?? null,
    payload: ev.payload ?? null,
    created_at: ev.created_at,
  };
}

function eventHash(prevHash, ev) {
  return crypto
    .createHash('sha256')
    .update((prevHash || '') + canonicalStringify(eventPayloadForHash(ev)), 'utf8')
    .digest('hex');
}

// An Event row (as returned by SELECT *) into the {type, actor, payload,
// created_at} shape eventHash needs. payload_json that does not parse
// hashes as null — a corrupt payload breaks the chain rather than the
// verifier.
function rowToEvent(row) {
  let payload = null;
  try { payload = row.payload_json ? JSON.parse(row.payload_json) : null; }
  catch (_e) { payload = null; }
  return { type: row.type, actor: row.actor ?? null, payload, created_at: row.created_at };
}

// Verify a job's events (rows in id order, as jobDetail returns them).
// Returns { valid, brokenIndex, brokenType, reason, chainHead } where
// brokenIndex is the index of the FIRST event whose stored hash does not
// match its recomputed hash (or whose hash is missing — a legacy event
// written before the chain existed), and chainHead is the hash of the
// last verified event (null when the chain is empty).
function verifyChain(rows) {
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const ev = rowToEvent(rows[i]);
    if (!rows[i].hash) {
      return { valid: false, brokenIndex: i, brokenType: ev.type, reason: 'missing hash', chainHead: prev === GENESIS ? null : prev };
    }
    const expected = eventHash(prev, ev);
    if (expected !== rows[i].hash) {
      return { valid: false, brokenIndex: i, brokenType: ev.type, reason: 'hash mismatch', chainHead: prev === GENESIS ? null : prev };
    }
    prev = rows[i].hash;
  }
  return { valid: true, brokenIndex: -1, brokenType: null, reason: null, chainHead: prev === GENESIS ? null : prev };
}

module.exports = { GENESIS, canonicalStringify, eventPayloadForHash, eventHash, rowToEvent, verifyChain };
