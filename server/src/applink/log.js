// DealCraft — AppLink call log. Every adapter call is appended here so the
// demo can show exactly what was (and was not) a live AppLink call.
const fs = require('node:fs');
const path = require('node:path');

const LOG_PATH = path.join(__dirname, '..', '..', 'data', 'applink-log.jsonl');

function appendLog({ api, request, response, mode }) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      api,
      request: request || {},
      response: response || {},
      mode: mode || process.env.APPLINK_MODE || 'sandbox',
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

module.exports = { appendLog, readLog, LOG_PATH };
