// DealCraft — canonical JSON + SHA-256 fingerprint for JobVersion rows.
// The fingerprint covers the WHOLE agreement, not just price and scope:
// job id, version, scope text, price, deadline, FairScope answers,
// explicitly skipped terms, and milestones. A change to any of those
// changes the fingerprint; versions fingerprinted before this change keep
// their stored hash (they are still readable and verifiable as stored).
const crypto = require('node:crypto');

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}

function agreementPayload({ job_id, version_no, scope, price, deadline, answers, skippedTerms, milestones }) {
  return {
    job_id,
    version_no,
    scope: scope ?? '',
    price,
    deadline: deadline || null,
    answers: answers || {},
    skippedTerms: [...(skippedTerms || [])].sort(),
    milestones: (milestones || []).map((m) => ({ title: m.title || '', amount: m.amount || 0 })),
  };
}

function fingerprint(input) {
  const canonical = canonicalStringify(agreementPayload(input));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

module.exports = { canonicalStringify, fingerprint, agreementPayload };
