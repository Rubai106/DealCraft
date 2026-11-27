// DealCraft backend — Express + built-in node:sqlite.
//
// dotenv first: values from a repo-root .env file (DEMO_MODE,
// DEALCRAFT_DEMO_TOKEN, APPLINK_* …) reach process.env before any other
// module is loaded. Real environment variables always win — dotenv never
// overrides a variable that is already set — so production stays safe
// and a missing .env changes nothing.
require('dotenv').config();
const express = require('express');
// DealCraft is a mutually confirmed digital work record for informal jobs
// in Bangladesh (electrician / painter / plumber). It is NOT a contract
// service: DealCraft holds no money, does not guarantee payment, and this
// record is not a legal document. Payment entries here are acknowledgements
// only. AppLink reaches Banglalink subscribers only.
const fs = require('node:fs');
const path = require('node:path');
const {
  init, getMode, checkDeadlines, FAIRSCOPE_QUESTIONS, BIDDING_ENABLED,
  db, authedUser, workerTokenForJob, servePhoto, err, getJob,
} = require('./src/shared');
const { securityHeaders } = require('./src/security-headers');
const { originCheck } = require('./src/origin-check');
const { rateLimit } = require('./src/rate-limit');

init();

const app = express();
// Proxy correctness: when a reverse proxy / PaaS sits in front, Express
// must trust X-Forwarded-For so req.ip (rate limiter) and req.protocol
// reflect the real client, not the proxy's socket address. Set
// TRUST_PROXY=true (or a hop count, e.g. 1) only when a proxy is actually
// in front; unset = direct, socket address as before.
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY.trim();
  app.set('trust proxy', tp === 'true' ? true : (/^\d+$/.test(tp) ? Number(tp) : tp));
}
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// Hardening pass: security headers on every response; origin validation
// and a general write rate limit on mutating /api requests (AppLink
// callbacks are exempt from both — server-to-server webhooks). See
// server/src/security-headers.js, server/src/origin-check.js and
// server/src/rate-limit.js for the rules and the exemption list.
app.use(securityHeaders);
app.use(originCheck);
app.use(rateLimit);
if (fs.existsSync(PUBLIC_DIR)) app.use(express.static(PUBLIC_DIR));

// Photos are NOT served from a public directory: a photo belongs to a
// job (or a bid job), and only that job's hirer / worker (via token) —
// or, for bid-job problem photos, any signed-in user browsing the open
// listing — may fetch it. A random filename alone is not privacy.
app.get('/uploads/:file', (req, res) => {
  const file = path.basename(req.params.file || '');
  if (!file || file.includes('..')) return err(res, 400, 'invalid file');
  const url = '/uploads/' + file;
  const jobPhoto = db.prepare('SELECT * FROM Photo WHERE url = ?').get(url);
  if (jobPhoto) {
    const job = getJob(jobPhoto.job_id);
    if (!job) return err(res, 404, 'photo not found');
    const user = authedUser(req);
    const wt = workerTokenForJob(req, job.id);
    if (!(user && user.id === job.hirer_id) && !wt) return err(res, 401, 'authentication required');
    return servePhoto(res, file);
  }
  const bidPhoto = db.prepare('SELECT * FROM BidJobPhoto WHERE url = ?').get(url);
  if (bidPhoto) {
    // With bidding off, bid-job photos do not exist either.
    if (!BIDDING_ENABLED) return err(res, 404, 'photo not found');
    // Problem photos are listing photos: any signed-in user may see them.
    if (!authedUser(req)) return err(res, 401, 'authentication required');
    return servePhoto(res, file);
  }
  return err(res, 404, 'photo not found');
});


// ---------------------------------------------------------------- health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: getMode(), db: 'sqlite' });
});

// Public client config: the single source of truth for feature flags the
// client must honour (bidding on/off). No secrets here — just flags.
app.get('/api/config', (req, res) => {
  res.json({ biddingEnabled: BIDDING_ENABLED });
});

app.get('/api/fairscope', (req, res) => {
  res.json({ questions: FAIRSCOPE_QUESTIONS });
});

// Route modules, mounted in the monolith's original registration order:
// applink mode/log, auth, jobs, worker, changes, payments, bidding,
// disputes, passport, billing, applink callbacks, demo.
app.use(require('./routes/applink').router);
app.use(require('./routes/auth'));
app.use(require('./routes/jobs'));
app.use(require('./routes/worker'));
app.use(require('./routes/changes'));
app.use(require('./routes/payments'));
app.use(require('./routes/bidding'));
app.use(require('./routes/disputes'));
app.use(require('./routes/passport'));
app.use(require('./routes/billing'));
app.use(require('./routes/applink').callbacksRouter);
app.use(require('./routes/demo'));
app.use(require('./routes/metrics'));

// ---------------------------------------------------------------- errors
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log('DealCraft backend listening on port ' + PORT + ' (mode: ' + getMode() + ')');
  });
  // Deadline sweep: once at start, then every 15 minutes (unref'd so it
  // never holds the process open on its own).
  checkDeadlines().catch(() => {});
  setInterval(() => { checkDeadlines().catch(() => {}); }, 15 * 60 * 1000).unref();
}

module.exports = app;
