// DealCraft — AppLink call log. Every adapter call is appended here so the
// demo can show exactly what was (and was not) a live AppLink call.
// Privacy: each entry carries an ownerPhone (the subscriber the call was
// for, derived from the request) so the API can scope the log to the
// authenticated user only — nobody else's entries are ever returned.
// The full log stays server-side (server/data/applink-log.jsonl) for
// diagnostics; the API only ever returns masked, owner-scoped entries.
const fs = require('node:fs');
const path = require('node:path');

const LOG_PATH = path.join(__dirname, '..', '..', 'data', 'applink-log.jsonl');

// '01700000001' / '+88017...' / 'tel:88017...' -> '01700000001', else null.
function ownerFromRequest(request) {
  if (!request || typeof request !== 'object') return null;
  const raw = request.phone || request.destinationAddress || request.subscriberId || null;
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^0-9]/g, '');
  const national = digits.startsWith('880') ? digits.slice(3) : digits.replace(/^0/, '');
  if (!/^1[3-9]\d{8}$/.test(national)) return null;
  return '0' + national;
}

function appendLog({ api, request, response, mode }) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      api,
      request: request || {},
      response: response || {},
      mode: mode || process.env.APPLINK_MODE || 'sandbox',
      ownerPhone: ownerFromRequest(request),
    }) + '\n';
    fs.appendFileSync(LOG_PATH, line);
  } catch (_e) {
    // Logging must never break an adapter call.
  }
}

function readLog(limit = 50) {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch (_e) { return null; }
    }).filter(Boolean).reverse();
  } catch (_e) {
    return [];
  }
}

module.exports = { appendLog, readLog, LOG_PATH, ownerFromRequest };
