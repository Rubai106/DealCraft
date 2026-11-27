# Security & privacy

All items below are covered by the regression suite (`npm test`, 783
assertions, PASS — the count grows as coverage is added).

## Billing

- **Billing is enforced, not voluntary.** A job cannot become ACTIVE
  until the ৳10 record fee is paid (CaaS, PENDING → VERIFIED via OTP) or
  the hirer has an ACTIVE ৳70/month subscription — otherwise the second
  confirmation returns **402**. The gate is **not** on record creation:
  `POST /api/jobs` never checks billing; it fires at the second
  confirmation (`routes/jobs.js` hirer-confirm, `routes/worker.js`
  worker confirm).
- **Billing is idempotent and ownership-checked.** A second CaaS charge
  for the same job returns the existing charge; verifying a charge that
  belongs to another hirer is 403. `POST /api/billing/subscribe` returns
  the existing subscription instead of a duplicate row;
  `POST /api/billing/unsubscribe` cancels it;
  `GET /api/billing/status` reports record fee / subscription fee / paid
  and unpaid job counts.
- MT SMS costs **2.00 BDT per message, charged to the subscriber**
  (portal fact) — a worker receiving SMS may also incur carrier charges.
  A local ACTIVE subscription is not proof of auto-renewal; it is
  reconciled against AppLink subscription callbacks.

## OTP, sessions, phones

- **OTP abuse is capped.** Verify: 5 failed attempts per phone+purpose
  per 15 minutes, then 429. Send: 5 sends per phone+purpose per 15
  minutes, then 429. Only Bangladesh mobiles are accepted
  (`01[3-9]XXXXXXXX`, `+880` accepted).
- **Sessions expire** 7 days after login; expired tokens are rejected
  (401).
- **Phones are normalised identically** at OTP request and verify (+880
  and 01 forms are the same number), and the user row is created only
  after a successful verification.
- **Live OTP transactions survive restarts.** `otpTransactionId` is
  persisted in SQLite (`OtpTransaction`), not an in-memory Map.

## AppLink log

`GET /api/applink/log` returns only entries tagged with the
authenticated user's own phone; entries with no owner stay server-side
only. It masks full phone numbers (`017******001`) and redacts tokens,
OTPs and codes, including worker tokens embedded in SMS text.

## FairScope, ChangeLock, disputes

- **FairScope cannot be silently skipped.** Creation is refused while any
  term is unresolved; a term counts as skipped only when the hirer tapped
  "Skip this term" on that one term. The UI never bulk-assigns skips.
- **ChangeLock:** the proposer cannot accept/reject their own proposal
  (403); "clarify" writes `CLARIFICATION` + a `CHANGE_CLARIFIED` event,
  not a fresh proposal. Accepting runs in one SQLite transaction, and the
  revised price must stay positive (checked at propose and at accept).
- **Disputes are resolved mutually, not by one side:** the hirer proposes
  a resolution (`POST /api/disputes/:id/resolve-proposal`), the worker
  accepts or rejects it (`POST /api/disputes/:id/resolve-response`); the
  job returns to ACTIVE only after the worker accepts, and stays DISPUTED
  on rejection. The old hirer-only `/resolve` endpoint is removed.
  DealCraft gives no verdict.

## WorkPassport & location privacy

- **WorkPassport is worker-owned.** Only the worker (via their job token)
  can publish a job and choose what it discloses; the hirer gets 403.
  The public identifier is a random profile id — no phone number in the
  public URL, API or page — and completion time is the actual close time.
- **Location privacy:** `ARRIVED_ON_SITE` stores a timestamp and status
  only. Location is shared only while the job is active, deleted when
  it closes; the permanent record stores arrival events without
  coordinates. Distances
  are labelled straight-line, never road routing. The trail (last 50
  points) and latest point are deleted on close or dispute.

## Photos

Magic-byte validation (PNG/JPEG/GIF/WebP), random filenames, max 10 per
job, served only to the job's parties — not a public directory.
Retention/deletion is a planned production pass (see
[status.md](status.md)).

## Fingerprints

The SHA-256 fingerprint hashes scope, price, deadline, FairScope
answers, explicitly skipped terms and milestones; changing any answer
changes the fingerprint. Older stored fingerprints remain readable as
stored. It is an integrity check, not blockchain or legal proof.

## Demo endpoints & personal data

- `POST /api/demo/seed` and `POST /api/demo/reset` return 404 unless
  `DEMO_MODE=true`, and 404 always in production
  (`NODE_ENV=production`); they also need the
  `DEALCRAFT_DEMO_TOKEN` (`x-demo-token` header) when one is configured.
- **Personal data is out of the public repo.**
  `APPLINK-APP-CREATION.md` and the docs carry redacted placeholders;
  the full sheet lives in the gitignored
  `APPLINK-APP-CREATION.local.md`.
- The word "escrow" appears in the product only in negations ("does no
  escrow"). The three forbidden phrases from the brief appear nowhere in
  the product code, UI or docs.

## Known limits

- Sandbox AppLink by default: no real SMS/OTP is sent until live
  credentials are configured (see [applink.md](applink.md)). Nothing in
  the UI or these docs claims a simulated call was live.
- Google Fonts / Three.js CDN are blocked in the sandbox; the UI falls
  back to system fonts and a CSS/SVG dotted map. The dotted Bangladesh
  map in the app is generated in JS from an approximate border polygon.
- `POST /api/demo/seed` clears all tables (including sessions) —
  re-login after seeding.
- Photo uploads are stored on local disk (`uploads/`); move to object
  storage before production. There is no automatic photo
  retention/deletion yet — planned for the production sprint.
