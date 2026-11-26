# Features

Everything below is built and covered by the regression suite
(`npm test`, 243 assertions, PASS). Nothing in the Planned section of
[status.md](status.md) is claimed here.

## 1. FairScope

Guided questions per trade (Electrician 8, Painter 7, Plumber 5;
`server/src/fairscope.js`), with fixed options including "Not decided".
Every question has three states — answered / unresolved / explicitly
skipped — and job creation is refused while any term is unresolved. A
term counts as skipped only when the hirer taps "Skip this term" on that
one term; there is no bulk skip, and the server enforces the gate
(`validateSkippedTerms`).

## 2. Agreement + dual OTP confirmation

One-page Bangla work record. The job becomes **ACTIVE** only after both
the hirer and the worker confirm with their own OTP.

## 3. ChangeLock

Propose a change (price ±, deadline shift, reason); the other side
accepts / rejects / asks for clarification. Accepting creates a new
version; rejecting leaves the current version active; both stay in the
event log. The proposer cannot accept or reject their own proposal (403),
and "clarify" writes a `CLARIFICATION` + `CHANGE_CLARIFIED` event, not a
fresh proposal. Accepting runs in a single SQLite transaction (version
insert + active-version update + proposal status + event), and the
revised price must stay positive.

## 4. PayProof

Record a payment (Cash / bKash / Nagad — a stated fact; DealCraft does
not verify external transactions); the recipient acknowledges or disputes
it via OTP. The running balance (agreed / acknowledged paid / remaining)
is always visible.

## 5. Milestones + photos

Milestones with amounts; the worker marks each complete with a photo and
the hirer approves. Photos are validated by magic bytes (PNG/JPEG/GIF/
WebP only — a text file sent as `image/png` is rejected), get random
filenames, are capped at 10 per job, are labelled BEFORE/AFTER, and are
served only to that job's hirer/worker (`GET /uploads/:file` is
job-scoped, not a public directory). They render as thumbnails with
timestamps in the job detail.

## 6. Worker flow

Token-secured per-job links, one action per screen, big buttons, plain
Bangla, light pages (`public/worker.html`, ~13 KB). No account, no app
install for the worker.

## 7. ResolvePack

Open a discrepancy (5 categories); both sides add statements. DealCraft
never decides. Resolution is mutual: the hirer proposes how it is
resolved, the worker accepts or rejects it; the job returns to ACTIVE
only after the worker accepts, and stays DISPUTED on rejection. One-click
PDF export of the complete chronological record
(`GET /api/jobs/:id/resolvepack`); the PDF lists each version's scope as
labelled lines (FairScope question + answer, milestones, fingerprint)
and embeds photo thumbnails — never raw JSON or file paths.

## 8. WorkPassport

After a job closes, only the worker (from their own link) may add it,
choosing what is shown (amounts / client / photos — photos private by
default). The public identifier is a random profile id
(`/passport/:profileId`); no phone number appears in the public URL, API
or page. Completion time is when the job actually closed. No star ratings
anywhere.

## 9. Accounts & pricing

Phone + OTP login (the same number in +880 or 01 form — normalised
identically at request and verify; the user row is created only after
successful verification). ৳10 per confirmed record (CaaS, idempotent per
job — a second charge returns the existing one; verification is
ownership-checked), ৳70/month plan (Subscription). A job cannot become
ACTIVE until the ৳10 record fee is paid (CaaS, PENDING → VERIFIED via
OTP) or the hirer has an ACTIVE ৳70/month subscription — otherwise the
second confirmation returns **402**. `POST /api/billing/subscribe`
returns the existing subscription instead of a duplicate row;
`POST /api/billing/unsubscribe` cancels it;
`GET /api/billing/status` reports record fee / subscription fee / paid
and unpaid job counts.

No DealCraft fee for workers — but a worker may incur carrier charges
for AppLink SMS (MT SMS 2.00 BDT, charged to the subscriber). A ৳10
record fee yields roughly ৳4–5 to DealCraft under the AppLink revenue
share, before costs — not presented as profitable without settlement
data. A local ACTIVE subscription is not proof of auto-renewal; it is
reconciled against AppLink callbacks.

Closing a job needs the worker: `POST /api/jobs/:id/close` requires a
worker OTP (`close-confirm` purpose) or an explicit `closeAnyway: true`,
which is recorded as `hirerOnly: true` in the `JOB_CLOSED` event. The
worker link is always available to the hirer, in sandbox and live mode,
with `POST /api/jobs/:id/worker-link` to resend it.

## 10. Live location

Opt-in per job: the worker taps Share on the job page, the hirer sees a
moving dot + route + distance/ETA on a live map (Leaflet + OpenStreetMap,
no key) with En route / Arriving / Arrived states. Entering 100 m of the
job site writes one `ARRIVED_ON_SITE` event (timestamp + status only —
no coordinates are kept in the permanent history) and notifies the hirer.
Distance shown is straight-line distance, never presented as road
routing. Only that job's hirer can see it, only while sharing is on and
the job is ACTIVE; the trail (last 50 points) and latest point are
deleted on close. A labelled simulated-movement demo mode exists for
judges without a real phone GPS.

## 11. Find a Repairer

A separate, optional discovery mode — not a replacement for the direct
record flow. A hirer posts a repair problem with 1–3 photos, a trade, a
Bangla description, and a job site. Workers see open jobs nearest first
and bid a price in BDT + note + earliest start. Bids expire after 24
hours; one live bid per worker per job, max 10 bids per job, no
self-bidding. The hirer sees bids cheapest first, with distance and the
worker's WorkPassport facts (completed jobs, trades) — no star ratings,
no scores.

Picking a bid is **not** an agreement: it creates a normal DRAFT job
pre-filled from the bid (price = bid price, worker = bidder, site and
problem photos carried over as BEFORE photos), which still needs
FairScope and dual OTP confirmation — plus the ৳10 record fee — before
it becomes ACTIVE. Losing bids are marked `NOT_SELECTED` in the event
log, and the hirer can close bidding without picking anyone
(`BID_JOB_CLOSED_NO_HIRE`).

## Judging evidence

| Criterion | Weight | Evidence in this repo |
|---|---|---|
| Innovation & Originality | 25% | FairScope missing-term warning (the fight caught before work starts); one append-only event log with SHA-256 version fingerprints; ChangeLock versioning; WorkPassport as proof a worker carries — not a marketplace, not a contract, not escrow |
| AppLink Integration | 20% | `server/src/applink/` — OTP, SMS, CaaS, Subscription adapters with identical interfaces; CaaS PENDING→VERIFIED two-step handled correctly; sandbox labelled + logged, live switch via env; `GET /api/applink/log` |
| Technical Implementation | 20% | Express + SQLite (relational, append-only), random token auth, per-job signed worker links, magic-byte-validated photo uploads served job-scoped, server-side PDF + QR, PWA with service worker, live location (opt-in, geofenced arrival, no coordinates kept); `tests/regression/run-demo.mjs` — 243 assertions, PASS, plus GitHub Actions CI on Node 24 |
| Business Viability | 20% | ৳10/record CaaS (idempotent, ownership-checked) + ৳70/month subscription, no DealCraft fee for workers (carrier SMS charges disclosed); ৳10 yields ~৳4–5 under the revenue share before costs — not claimed profitable without settlement data; Banglalink-only limit stated honestly; demo story is a real, repeatable transaction |
| Problem–Solution Fit & Impact | 10% | The exact fight the product removes: price changes, extra work, disputed payments with no proof — demo story reproduces it end to end in under 2 minutes |
| Presentation & Demo | 5% | One-click demo seed + script (`GET /api/demo/script`), ResolvePack PDF as the one-page story, Direction 03 poster design, Bangla-first |
