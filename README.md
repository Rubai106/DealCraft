# DealCraft

**A phone call can start a job. It shouldn't be the only record of what was promised.**

DealCraft turns a phone-call agreement for an informal job — electrician, painter,
plumber — into a **mutually confirmed digital work record**. Before work starts, both
sides agree the scope clearly. During work, every change and payment is recorded with
both sides' confirmation. After work, both sides hold the complete history, and the
worker carries the proof into future jobs.

> **Honest limits, stated plainly.** DealCraft is not a contract service. It holds no
> money, does no escrow, does not guarantee payment, and does not decide who is right
> in a disagreement. Payment entries are acknowledgements only. This record is not a
> legal document. AppLink reaches Banglalink subscribers only; users on other networks
> use the web / PWA link route.

Built for **AppQuest 2.0** (AppLink / Banglalink) — theme: Human Potential / Future of
Work. Submission due **30 Nov 2026, 23:59 BST**.

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Requires Node.js 24+. No other services. The database is a SQLite file created on
first run at `server/data/dealcraft.db` (gitignored). Photos land in `uploads/`
(gitignored).

```bash
npm test           # full regression: npm run regression
npm run dev        # watch mode
```

## Demo (under 2 minutes)

1. Open http://localhost:3000 and tap **Load demo job** — or `POST /api/demo/seed`.
   Demo phones: hirer `01700000001` (Rahim Uddin), worker `01800000002` (Karim Mistri).
   In sandbox mode the OTP codes are shown on screen, labelled
   **SANDBOX — not a live AppLink call**.
2. **FairScope** — the ৳18,000 apartment electrical rewiring. Wall repair was
   "Not decided" in the first draft; the missing-term warning blocks sending until it
   is resolved to "Worker includes wall repair".
3. **Dual confirmation** — hirer confirms with the hirer-confirm OTP, the worker opens
   the SMS link and confirms with their own OTP. Job becomes **ACTIVE** only after both.
4. **ChangeLock** — the worker proposes +৳2,000 for two extra points; the hirer
   accepts. The record moves to **V2 (৳20,000)**; V1 (৳18,000) stays intact with its
   original fingerprint.
5. **PayProof** — hirer records a ৳5,000 Cash advance; the worker acknowledges receipt
   from their link. Balance: agreed ৳20,000 / acknowledged paid ৳5,000 / remaining ৳15,000.
6. **Milestones + photos** — worker completes all three milestones with a photo;
   hirer approves each; job closes.
7. **ResolvePack** — download the PDF: the whole chronological record on one export.
8. **WorkPassport** — add the closed job; open the public passport page / QR code.
   Amounts, client names and photos stay hidden unless the worker enables them.

The full script is also at `GET /api/demo/script`. The regression test
(`tests/regression/run-demo.mjs`) runs exactly this story over real HTTP and asserts
every step — **142 assertions, PASS**.

## Architecture — one append-only event log

There are no separate modules. There is **one event log per job**; everything else is
a view of it.

```
User ──< Job ──< JobVersion (V1, V2, …) ──< Event (append-only)
              ├─< Payment (ack_status: AWAITING / ACKNOWLEDGED / DISPUTED)
              ├─< Photo (milestone, url, taken_at)
              └─< Dispute ──< DisputeStatement (both sides)
```

| Table | Purpose |
|---|---|
| `User` | id, name, phone, role (hirer / worker) |
| `Job` | id, hirer_id, worker_phone, trade, status, current_version |
| `JobVersion` | job_id, version_no, scope_json, price, deadline, **fingerprint** |
| `Event` | job_id, type, actor, payload_json, created_at |
| `Payment` | job_id, amount, method (Cash / bKash / Nagad), recorded_by, ack_status |
| `Photo` | job_id, milestone, url, taken_at |
| `Dispute` / `DisputeStatement` | category, statements from both sides |

Event types: `AGREEMENT_CREATED`, `CONFIRMED_BY_HIRER`, `CONFIRMED_BY_WORKER`,
`CHANGE_PROPOSED`, `CHANGE_APPROVED`, `CHANGE_REJECTED`, `MILESTONE_COMPLETED`,
`MILESTONE_APPROVED`, `PAYMENT_RECORDED`, `PAYMENT_ACKNOWLEDGED`, `PAYMENT_DISPUTED`,
`PHOTO_ADDED`, `DISPUTE_OPENED`, `STATEMENT_ADDED`, `JOB_CLOSED`.

**Versions are never edited or deleted, only superseded.** Each version stores a
SHA-256 fingerprint of canonical JSON `{job_id, version_no, scope, price, deadline}`
(`server/src/fingerprint.js`). It is an integrity check so later tampering is
detectable — it is not presented as blockchain or legal proof. ResolvePack and
WorkPassport are generated **views** of the same event history, not separate data.

Auth: phone + OTP only (hirer). Workers need no account and no app install — a
per-job token-secured SMS link (`/worker.html?token=…`, random token, 7-day expiry,
scoped to that job) plus OTP for sensitive actions (confirm, change response,
payment acknowledgement).

## AppLink integration (20% of the score)

All four APIs go through one clean adapter layer, `server/src/applink/`, with
**identical interfaces** in sandbox and live mode:

| API | Used for | Files |
|---|---|---|
| OTP | hirer/worker confirmation, login, change approvals, payment acks | `otp.js` |
| SMS | confirmation requests, change alerts, payment-ack requests, closure notices (reference + link only — never the full agreement) | `sms.js` |
| CaaS | ৳10 per confirmed record | `caas.js` |
| Subscription | ৳70/month frequent-hirer plan | `subscription.js` |

**Sandbox is the default** (`APPLINK_MODE=sandbox`). It generates real 6-digit OTPs
(valid 5 minutes, like the real ones), logs every call to
`server/data/applink-log.jsonl`, and shows codes on screen only ever labelled
`SANDBOX — not a live AppLink call`. CaaS returns `PENDING` until the OTP is
verified — money has not moved until verification, so the server
verifies before marking a record paid. See the log any time:
`GET /api/applink/log`.

### Getting real AppLink credentials (portal steps)

The AppLink application **exists and is Pending Approval** — created in the
portal 2026-11-26 14:09: **DealCraft, applicationId `APP_019204`**, APIs
SMS / CaaS / Subscription, operator Banglalink. Short code **21213**
(21212 was unavailable), SMS keyword **dealcraft** (lowercase only —
the portal rejects uppercase), subscription **৳70/month** ("DealCraft
Frequent Hirer", monthly, no free trial), CaaS via Banglalink Mobile
Account. Allowed Host is the placeholder `127.0.0.1` — it must be updated
to the real server IP before any real API call will succeed. **No API key
yet** — it is emailed to the registered address only after approval, so
there is still no live AppLink call; everything runs in labelled sandbox
mode. The portal wizard had no field for the ৳10 CaaS price point and no
SMS-environment selector, so both still need checking after approval.
Rubai's SP account is `SPP_010237` (username Rubai); the SP profile is
still "Account Verification Pending" — Contact Person (DOB, gender,
permanent address, NID/passport scan) and Reconciliation (bank details)
are missing and need his own documents.

What remains, in the portal at https://user.applink.com.bd/:

1. Finish the SP profile (above) and wait for the app approval email.
2. **Whitelist test numbers** for sandbox use — an un-whitelisted number
   returns `E1343`. Also ask AppLink to allow-list the server IP (the docs
   require it), replacing the `127.0.0.1` placeholder. For AppQuest
   fast-track approval, email support@applink.com.bd from the Team Lead's
   registered email with team name, project title and application description.
3. Live SMS needs an SMS bundle bought in the portal (Billing → Buy SMS
   bundle) and the signed go-live forms AppLink collects.

### Switching sandbox → live (real API spec)

Base URL for every API: `https://api.applink.com.bd` (same host for sandbox
and live — there is no separate sandbox host). Every call is `POST` JSON
with `applicationId` + `password` (the API key) in the body — no
Authorization header, no token endpoint. Success is judged by the body's
`statusCode` (`S1000`), never by the HTTP status. Endpoints, exactly as
documented at https://dev.applink.com.bd/docs:

| API | Endpoint | Notes |
|---|---|---|
| SMS | `POST /sms/send` | `destinationAddresses: ["tel:8801…"]`, `message` ≤ 2000 chars |
| OTP | `POST /otp/send`, `POST /otp/verify` | Code valid 5 min; verify needs the `otpTransactionId` from send (stored server-side by the adapter); wrong/expired code → `E1850`/`E1851` |
| CaaS | `POST /caas/charge`, `POST /caas/verify` | Charge returns `P1003` = OTP sent, **not** charged; only verify returning `S1000` means money moved |
| Subscription | `POST /subscription/register` (`action: "1"`), `POST /subscription/unregister` (`action: "0"`), `POST /subscription/get-charging-info`, `POST /subscription/get-base-size` | ৳70/month price/validity is configured on the app in the portal, not in the API call |

Steps:

1. Copy `.env.example` to `.env` and fill in the real values:
   `APPLINK_MODE=live`, `APPLINK_APP_ID`, `APPLINK_PASSWORD`.
   Never commit `.env` (it is gitignored).
2. Restart. `GET /api/applink/mode` must read `live`.
3. In live mode the adapters **never return OTP codes** in responses, and every call
   is still logged with mode `live` (safe fields only — never the password,
   never a code). If live credentials are missing, the live adapter
   throws a clear "live credentials not configured" error instead of silently
   falling back to sandbox. Common failures are mapped to plain messages:
   `E1313` bad credentials/inactive app, `E1323` app not approved,
   `E1343` number not whitelisted in sandbox.

## Features (what is built, nothing more)

1. **FairScope** — guided questions per trade (Electrician 8, Painter 7, Plumber 5;
   `server/src/fairscope.js`). Fixed options incl. "Not decided". Any "Not decided"
   term produces a prominent missing-term warning on review; the hirer must resolve it
   or explicitly skip it before sending.
2. **Agreement + dual OTP confirmation** — one-page Bangla work record; ACTIVE only
   after both confirmations.
3. **ChangeLock** — propose a change (price ±, deadline shift, reason); the other side
   accepts / rejects / asks for clarification. Accept creates a new version; reject
   leaves the current version active; both stay in the log.
4. **PayProof** — record a payment (Cash / bKash / Nagad, a stated fact — DealCraft
   does not verify external transactions); recipient acknowledges or disputes via OTP.
   Running balance always visible.
5. **Milestones + photos** — milestones with amounts; worker marks complete + photo
   upload (`uploads/`, served at `/uploads/*`); hirer approves.
6. **Worker flow** — token-secured per-job links, one action per screen, big buttons,
   plain Bangla, light pages (`public/worker.html`, ~13 KB).
7. **ResolvePack** — open a discrepancy (5 categories), both sides add statements,
   DealCraft never decides. One-click PDF export of the complete chronological record
   (`GET /api/jobs/:id/resolvepack`).
8. **WorkPassport** — after a job closes, the worker may add it. Public page + QR
   (`/passport/:phone`) showing only what the worker chooses. No star ratings anywhere.
9. **Accounts & pricing** — phone + OTP login; ৳10 per confirmed record (CaaS),
   ৳70/month plan (Subscription); workers always free.
10. **Live location** — opt-in per job: the worker taps Share on the job
    page, the hirer sees a moving dot + route + distance/ETA on a live map
    (Leaflet + OpenStreetMap, no key) with En route / Arriving / Arrived
    states; entering 100 m of the job site writes one `ARRIVED_ON_SITE`
    event and notifies the hirer. Only that job's hirer can see it, only
    while sharing is on and the job is ACTIVE; the trail (last 50 points)
    and latest point are deleted on close. A labelled simulated-movement
    demo mode exists for judges without a real phone GPS.

## Design — Direction 03, "Dotted Bangladesh"

Rubai picked Direction 03 from the three design directions in the `dealcraft-website-ui`
chooser (rebuilt from visual teardowns of sharplink.com, terminal-industries.com and
unitedcarriers.com — spirit only, nothing copied). Black hero, dotted map of Bangladesh
(white dots, orange Dhaka/Chattogram markers, orange arcs), hot orange `#FF5A1F` used
sparingly, royal blue `#1E4FFF` only for live/tracking elements, huge condensed poster
type, mono 11–13px all-caps labels, pill buttons only, mostly square edges, pinned
scroll journey, giant numerals. Bangla-first with an EN toggle. No centred hero with
three feature cards, no purple gradients, no emoji, no rounded SaaS card grids.

Design check: `design-taste-frontend` gate on `public/index.html`, 3 rounds —
**GATE: OPEN 14** (106 → 54 → 43 → 34 → 23 → 12, then re-counted at 14 open
FAILs in `.taste-skill/gate.json`; rounds exhausted, 3/3). 3 waivers in
`.taste-skill/waivers.json`: button-styles (pill CTAs are the one action
style; square tab/option controls are form controls by design),
copy-headings (step headings name the product's own parts in Bangla; the
checker matches English nouns only), section-height (the app section is a
working multi-view form, so its height follows the visible view).
Copy-lint: **0 FAIL, 2 WARN** (em-dash budget — most are mono-label
separators and Bangla punctuation, not prose habit; numbered steps — the
FAQ and journey steps genuinely run in order). The remaining open FAILs
are mostly the skill's strict company-site rules applied to an app page
(hero visual coverage 9% vs ~25% wanted, section gaps/heights, journey
3.36 screens on a phone). Fonts are self-hosted now (10 `.woff2` files in
`public/fonts/`, loaded via `public/fonts.css`), but the font files are
**not on the GitHub remote** — the GitHub connector cannot push binary
files, so a fresh checkout falls back to system fonts until the `.woff2`
files are uploaded via the GitHub web UI. The hero pill is mode-aware:
"Sandbox — demo" in sandbox mode, "Live" only in live mode with
credentials configured — it never claims a simulated call was live.

## Scorecard — where each point is evidenced

| Criterion | Weight | Evidence in this repo |
|---|---|---|
| Innovation & Originality | 25% | FairScope missing-term warning (the fight caught before work starts); one append-only event log with SHA-256 version fingerprints; ChangeLock versioning; WorkPassport as proof a worker carries — not a marketplace, not a contract, not escrow |
| AppLink Integration | 20% | `server/src/applink/` — OTP, SMS, CaaS, Subscription adapters with identical interfaces; CaaS PENDING→VERIFIED two-step handled correctly; sandbox labelled + logged, live switch via env; `GET /api/applink/log` |
| Technical Implementation | 20% | Express + SQLite (relational, append-only), random token auth, per-job signed worker links, photo uploads, server-side PDF + QR, PWA with service worker, live location (opt-in, geofenced arrival); `tests/regression/run-demo.mjs` — 142 assertions, PASS |
| Business Viability | 20% | ৳10/record CaaS + ৳70/month subscription, workers free (frees the supply side); Banglalink-only limit stated honestly; demo story is a real, repeatable transaction |
| Problem–Solution Fit & Impact | 10% | The exact fight the product removes: price changes, extra work, disputed payments with no proof — demo story reproduces it end to end in under 2 minutes |
| Presentation & Demo | 5% | One-click demo seed + script (`GET /api/demo/script`), ResolvePack PDF as the one-page story, Direction 03 poster design, Bangla-first |

## API (summary)

```
POST /api/auth/request-otp | POST /api/auth/verify-otp | GET /api/me
POST /api/jobs | GET /api/jobs | GET /api/jobs/:id
POST /api/jobs/:id/hirer-confirm
GET  /api/worker/:token | POST /api/worker/:token/request-otp | POST /api/worker/:token/confirm
POST /api/jobs/:id/changes | POST /api/changes/:id/respond
POST /api/jobs/:id/payments | POST /api/payments/:id/ack
POST /api/jobs/:id/milestones/:i/complete | POST /api/jobs/:id/milestones/:i/approve
POST /api/jobs/:id/photos (multipart, field 'photo')
POST /api/jobs/:id/disputes | POST /api/disputes/:id/statements
POST /api/jobs/:id/close
GET  /api/jobs/:id/resolvepack (PDF) | GET /api/jobs/:id/resolvepack.json
POST /api/passport/add | GET /api/passport/:phone | GET /passport/:phone | GET /api/passport/:phone/qr.png
POST /api/billing/caas | POST /api/billing/caas/:id/verify | POST /api/billing/subscribe
POST /api/billing/unsubscribe | GET /api/billing/status
POST /api/jobs/:id/worker-link | POST /api/disputes/:id/resolve
GET  /api/applink/mode | GET /api/applink/log | GET /api/fairscope | GET /api/health
POST /api/demo/seed | POST /api/demo/reset | GET /api/demo/script
```

## Known limits (honest)

- Sandbox AppLink by default: no real SMS/OTP is sent until live credentials are
  configured (see above). Nothing in the UI or this README claims a simulated call
  was live.
- Google Fonts / Three.js CDN are blocked in the sandbox; the UI falls back to system
  fonts and a CSS/SVG dotted map. The dotted Bangladesh map in the app is generated
  in JS from an approximate border polygon.
- `POST /api/demo/seed` clears all tables (including sessions) — re-login after seeding.
  The demo endpoints return 404 in production (`NODE_ENV=production`) and
  need the `DEALCRAFT_DEMO_TOKEN` (`x-demo-token` header) when one is
  configured. Sessions expire 7 days after login. OTP verify is rate
  limited: 5 failed attempts per phone+purpose per 15 minutes, then 429.
- Photo uploads are stored on local disk (`uploads/`); move to object storage before
  production.

## Hardening (26 Nov 2026 — audit fixes, all covered by the regression)

- **Billing is enforced, not voluntary.** A job cannot become ACTIVE until the ৳10
  record fee is paid (CaaS, PENDING → VERIFIED via OTP) or the hirer has an ACTIVE
  ৳70/month subscription — otherwise the second confirmation returns **402**.
  `POST /api/billing/subscribe` returns the existing subscription instead of a
  duplicate row; `POST /api/billing/unsubscribe` cancels it;
  `GET /api/billing/status` reports record fee / subscription fee / paid and
  unpaid job counts. MT SMS costs **2.00 BDT per message, charged to the
  subscriber** (portal fact).
- **OTP abuse is capped.** Verify: 5 failed attempts per phone+purpose per 15
  minutes, then 429. Send: 5 sends per phone+purpose per 15 minutes, then 429.
  Only Bangladesh mobiles are accepted (`01[3-9]XXXXXXXX`, `+880` accepted).
- **Sessions expire** 7 days after login; expired tokens are rejected (401).
- **AppLink log is hirer-auth only** and masks full phone numbers (`017******001`).
- **ChangeLock:** the proposer cannot accept/reject their own proposal (403);
  "clarify" writes `CLARIFICATION` + a `CHANGE_CLARIFIED` event, not a fresh proposal.
- **Disputes can be resolved:** `POST /api/disputes/:id/resolve` returns the job to
  ACTIVE once both sides have a statement — DealCraft gives no verdict.
- **Closing needs the worker:** `POST /api/jobs/:id/close` requires a worker OTP
  (`close-confirm` purpose) or an explicit `closeAnyway: true`, which is recorded
  as `hirerOnly: true` in the `JOB_CLOSED` event.
- **Worker link is always available** to the hirer, in sandbox and live mode, with
  `POST /api/jobs/:id/worker-link` to resend it.
- **Photos are labelled BEFORE/AFTER** and rendered as thumbnails with timestamps
  in the job detail; the ResolvePack PDF lists each version's scope as labelled
  lines (FairScope question + answer, milestones, fingerprint) and embeds photo
  thumbnails — never raw JSON or file paths. New event types since launch:
  `CHANGE_CLARIFIED`, `DISPUTE_RESOLVED`, `ARRIVED_ON_SITE`.
- The word "escrow" appears in the product only in negations ("does no escrow") —
  the plain-language disclaimer the brief requires. The three forbidden phrases
  from the brief appear nowhere in the product code, UI or docs.

## Database — what to do (SQLite, for now)

- **It is one file:** `server/data/dealcraft.db` (+ `-wal`/`-shm` while running).
  The schema is created by `server/src/db.js` on boot, and every later change
  ships as a migration in the same file (new columns via `ALTER TABLE`, the
  Billing status CHECK via a table rebuild). Never hand-edit the file.
- **Before the demo / deployment:** back the file up (`cp server/data/dealcraft.db
  backups/dealcraft-YYYY-MM-DD.db`) — the demo seed/reset wipes it, and there is
  no undo. Keep `DEALCRAFT_DEMO_TOKEN` set and `NODE_ENV=production` on any
  deployed server so the demo endpoints return 404.
- **After deployment:** back the file up on a schedule (daily copy is enough at
  this scale); uploads live on local disk in `uploads/`, so back that folder up
  with the database or the photos will dangle. If jobs ever pass a few thousand,
  move the database to hosted Postgres (the queries are plain SQL, no ORM to
  fight) and the uploads to object storage (S3-compatible) — the code change is
  small, but do it before the finale sprint, not during it. Until then, SQLite
  is the right call: zero setup, one file to copy, and the whole event log
  travels with the repo's demo.
