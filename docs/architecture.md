# Architecture

DealCraft is an Express + SQLite app with no other services. There are no
separate modules for the product's parts — there is **one append-only event
log per job**, and everything else (ResolvePack, WorkPassport, the job
timeline) is a view of that log.

```
User ──< Job ──< JobVersion (V1, V2, …) ──< Event (append-only)
              ├─< Payment (ack_status: AWAITING / ACKNOWLEDGED / DISPUTED)
              ├─< Photo (milestone, url, taken_at)
              └─< Dispute ──< DisputeStatement (both sides)
```

## Data model

| Table | Purpose |
|---|---|
| `User` | id, name, phone, role (hirer / worker) |
| `Job` | id, hirer_id, worker_phone, trade, status, current_version |
| `JobVersion` | job_id, version_no, scope_json, price, deadline, **fingerprint** |
| `Event` | job_id, type, actor, payload_json, created_at |
| `Payment` | job_id, amount, method (Cash / bKash / Nagad), recorded_by, ack_status |
| `Photo` | job_id, milestone, url, taken_at |
| `Dispute` / `DisputeStatement` | category, statements from both sides |
| `BidJob` / `Bid` / `BidJobPhoto` | Find a Repairer postings, bids, and their photos |
| `Billing` | CaaS charges and subscriptions per hirer |
| `OtpTransaction` | persisted AppLink OTP transaction ids (survives restarts) |
| `PassportProfile` | worker-owned public passport profiles (random profile id) |
| `DisputeResolution` | mutual dispute-resolution proposals and responses |

Event types: `AGREEMENT_CREATED`, `CONFIRMED_BY_HIRER`,
`CONFIRMED_BY_WORKER`, `CHANGE_PROPOSED`, `CHANGE_APPROVED`,
`CHANGE_REJECTED`, `CHANGE_CLARIFIED`, `MILESTONE_COMPLETED`,
`MILESTONE_APPROVED`, `PAYMENT_RECORDED`, `PAYMENT_ACKNOWLEDGED`,
`PAYMENT_DISPUTED`, `PHOTO_ADDED`, `DISPUTE_OPENED`, `STATEMENT_ADDED`,
`DISPUTE_RESOLVED`, `JOB_CLOSED`, `ARRIVED_ON_SITE`,
`BID_JOB_POSTED`, `BID_PLACED`, `BID_ACCEPTED`, `BID_NOT_SELECTED`,
`BID_JOB_PHOTO_ADDED`, `BID_JOB_CLOSED_NO_HIRE`.

## Versions and fingerprints

**Versions are never edited or deleted, only superseded.** Each version
stores a SHA-256 fingerprint of the canonical agreement payload —
scope, price, deadline, FairScope answers, explicitly skipped terms, and
milestones (`server/src/fingerprint.js`). Changing any answer changes the
fingerprint. Older stored fingerprints remain readable as stored.

The fingerprint is an integrity check so later tampering is detectable.
It is not presented as blockchain or legal proof.

## Auth

- Hirer: phone + OTP only. Sessions expire 7 days after login.
- Worker: no account, no app install. A per-job token-secured SMS link
  (`/worker.html?token=…`, random token, 7-day expiry, scoped to that
  job), plus OTP for sensitive actions (confirm, change response, payment
  acknowledgement, close).
- Phone numbers are normalised identically at OTP request and verify
  (`+880` and `01` forms are the same number); the user row is created
  only after a successful verification.

## Code layout

- `server/server.js` — Express app: auth, jobs, changes, payments,
  milestones, photos, disputes, close, ResolvePack, passport, billing,
  live location, Find a Repairer, demo.
- `server/src/db.js` — SQLite schema (built-in `node:sqlite`) and
  migrations. Append-only at app level for `JobVersion` and `Event`.
- `server/src/fingerprint.js` — SHA-256 fingerprint of canonical job JSON.
- `server/src/fairscope.js` — FairScope questions per trade, missing-term
  states, and the creation gate (`validateSkippedTerms`).
- `server/src/tokens.js` — random token helpers.
- `server/src/applink/` — adapters with identical interfaces:
  `otp.js`, `sms.js`, `caas.js`, `subscription.js`, `live.js`,
  `index.js` (selects by `APPLINK_MODE`, default `sandbox`),
  `log.js` (scoped, masked call log), `otp-rate-limit.js`,
  `otp-transactions.js` (persisted OTP transaction ids).
- `public/` — PWA frontend (`index.html`, `app.js`, `worker.html`,
  `passport.html`, `style.css`, `fonts.css`, `sw.js`, `manifest.json`).
- `tests/regression/run-demo.mjs` — the full regression suite (243
  assertions, run by `npm test` and by CI).
