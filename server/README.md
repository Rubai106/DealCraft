# DealCraft backend

Mutually confirmed digital work record for informal jobs in Bangladesh
(electrician / painter / plumber).

**Honest limits:** DealCraft holds no money and does not guarantee payment.
Payment entries are acknowledgements only. This record is not a legal
document. AppLink reaches Banglalink subscribers only.

## Run

```sh
npm install
npm start          # listens on PORT (default 3000)
```

## Layout

- `server/server.js` — Express app: auth, jobs, changes, payments,
  milestones, photos, disputes, close, ResolvePack, passport, billing, demo.
- `server/src/db.js` — SQLite schema (built-in `node:sqlite`), append-only
  at app level for `JobVersion` and `Event`.
- `server/src/fingerprint.js` — SHA-256 fingerprint of canonical job JSON.
- `server/src/fairscope.js` — FairScope questions per trade + missingTerms.
- `server/src/tokens.js` — random token helpers.
- `server/src/applink/` — adapters with identical interfaces:
  `otp.js`, `sms.js`, `caas.js`, `subscription.js`, `live.js`, `index.js`
  (selects by `APPLINK_MODE`, default `sandbox`). Live mode talks to the
  real AppLink API at https://api.applink.com.bd (`applicationId` +
  `password` in the POST body, success = body `statusCode` "S1000",
  CaaS "P1003" = OTP sent, not charged). Every call is logged to
  `server/data/applink-log.jsonl` with safe fields only. Sandbox OTP/SMS/CaaS
  calls return the code flagged `sandbox:true`; the live adapter never
  returns a code.
- `server/data/dealcraft.db` — SQLite file (gitignored).
- `uploads/` — milestone photos, served at `/uploads/*`.

## Auth

Phone + OTP only. `POST /api/auth/request-otp`, then
`POST /api/auth/verify-otp` returns a Bearer token. Sessions expire 7 days
after login. OTP verify is rate limited: 5 failed attempts per
phone+purpose per 15 minutes, then 429 ("too many wrong codes"). Workers use a
`?token=` worker token scoped to one job (7-day expiry), no account needed.

## Key endpoints

- `GET /api/health`, `GET /api/fairscope`
- `GET /api/applink/mode`, `GET /api/applink/log`
- `POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/:id`
- `POST /api/jobs/:id/hirer-confirm`, `GET /api/worker/:token`,
  `POST /api/worker/:token/request-otp`, `POST /api/worker/:token/confirm`
- `POST /api/jobs/:id/changes`, `POST /api/changes/:changeId/respond`
- `POST /api/jobs/:id/payments`, `POST /api/payments/:paymentId/ack`
- `POST /api/jobs/:id/milestones/:index/complete|approve`
- `POST /api/jobs/:id/photos` (multipart, image only, 5 MB max)
- `POST /api/jobs/:id/disputes`, `POST /api/disputes/:disputeId/statements`
- `POST /api/jobs/:id/close`
- `GET /api/jobs/:id/resolvepack` (PDF), `GET /api/jobs/:id/resolvepack.json`
- `POST /api/passport/add`, `GET /api/passport/:workerPhone`,
  `GET /passport/:workerPhone`, `GET /api/passport/:workerPhone/qr.png`
- `POST /api/billing/caas`, `POST /api/billing/caas/:chargeId/verify`,
  `POST /api/billing/subscribe`
- `POST /api/demo/seed`, `POST /api/demo/reset`, `GET /api/demo/script`

## Demo

`POST /api/demo/seed` creates the exact demo job (hirer 01700000001
Rahim Uddin, worker 01800000002 Karim Mistri, electrician rewiring,
BDT 18,000, deadline 2026-12-05) and returns sandbox OTPs for both
confirm steps. `npm run regression` boots the server and checks health.

**Demo endpoints are dangerous by design** (seed/reset wipe every table):
they return 404 when `NODE_ENV=production`, and when
`DEALCRAFT_DEMO_TOKEN` is set they need the same value as the
`x-demo-token` header (or a `demoToken` body/query field). Set
`NODE_ENV=production` on any public deployment.
