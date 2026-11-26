// DealCraft — canonical JSON + SHA-256 fingerprint for JobVersion rows.
// fingerprint = SHA-256 hex of canonical JSON { job_id, version_no, scope, price, deadline }
const crypto = require('node:crypto');

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}

function fingerprint({ job_id, version_no, scope, price, deadline }) {
  const canonical = canonicalStringify({ job_id, version_no, scope, price, deadline });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

module.exports = { canonicalStringify, fingerprint };
