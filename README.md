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
every step — **72 assertions, PASS**.

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

**Sandbox is the default** (`APPLINK_MODE=sandbox`). It generates real 6-digit OTPs,
logs every call to `server/data/applink-log.jsonl`, and shows codes on screen only
ever labelled `SANDBOX — not a live AppLink call`. CaaS returns `PENDING` until the
OTP is verified — money has not moved until verification, so the server polls/verifies
before marking a record paid. See the log any time: `GET /api/applink/log`.

### Switching sandbox → live

1. Copy `.env.example` to `.env` and fill in the real values:
   `APPLINK_MODE=live`, `APPLINK_BASE_URL`, `APPLINK_API_KEY`.
   Never commit `.env` (it is gitignored).
2. Restart. `GET /api/applink/mode` must read `live`.
3. In live mode the adapters **never return OTP codes** in responses, and every call
   is still logged with mode `live`. If live credentials are missing, the live adapter
   throws a clear "live credentials not configured" error instead of silently
   falling back to sandbox.

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
**GATE: OPEN 43** (106 → 54 → 43; 5 waivers in `.taste-skill/waivers.json`:
demo phone numbers, the United-style ticker, the Bangla headline noun, the pinned
V1→V2 journey as the dealt moment, pill-CTA + square form controls). Copy-lint:
**0 FAIL, 2 WARN** (em-dash budget — most are mono-label separators and Bangla
punctuation, not prose habit; numbered steps — the FAQ and journey steps genuinely
run in order). The remaining open FAILs are the skill's strict company-site rules
applied to an app page: sections must be exactly 1–2 screens tall (the interactive
app form section is 1.26 screens), the footer counts as a section, and the Google
Fonts asset check fails because fonts are blocked in the sandbox. The page was
fixed where the checker was right (44 off-grid edge findings → 1, grey body text
failing contrast, missing focus ring, map SVG overflowing the hero). Google Fonts
are blocked in the sandbox, so the page falls back to system fonts there; fonts
load in a real browser.

## Scorecard — where each point is evidenced

| Criterion | Weight | Evidence in this repo |
|---|---|---|
| Innovation & Originality | 25% | FairScope missing-term warning (the fight caught before work starts); one append-only event log with SHA-256 version fingerprints; ChangeLock versioning; WorkPassport as proof a worker carries — not a marketplace, not a contract, not escrow |
| AppLink Integration | 20% | `server/src/applink/` — OTP, SMS, CaaS, Subscription adapters with identical interfaces; CaaS PENDING→VERIFIED two-step handled correctly; sandbox labelled + logged, live switch via env; `GET /api/applink/log` |
| Technical Implementation | 20% | Express + SQLite (relational, append-only), HMAC/random token auth, per-job signed worker links, photo uploads, server-side PDF + QR, PWA with service worker; `tests/regression/run-demo.mjs` — 72 assertions, PASS |
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
- Photo uploads are stored on local disk (`uploads/`); move to object storage before
  production.
- The word "escrow" appears in the product only in negations ("does no escrow") —
  the plain-language disclaimer the brief requires. The three forbidden phrases
  from the brief appear nowhere in the product code, UI or docs.
