# Project status

## Working (verified by the regression, 983 assertions, PASS — the count grows as coverage is added)

FairScope three-state gate, dual OTP confirmation, ChangeLock
(transactional, positive-price-checked), PayProof balances, milestones +
photos (magic-byte validated, job-scoped serving), mutual dispute
resolution, ResolvePack PDF, worker-owned WorkPassport (random profile
id), live location (opt-in, straight-line distance, arrival events
stored without coordinates — location shared only while the job is
active, deleted on close), Find a Repairer bidding, billing gate + idempotent CaaS +
subscription with unsubscribe, AppLink log scoped to the caller with
tokens masked, AppLink callback endpoints (`/api/applink/sms-report`,
`/api/applink/mo-sms`, `/api/applink/caas-notify`,
`/api/applink/subscription-notify`).

## Sandbox-only (built, labelled, never claimed as live)

Every AppLink call — OTP, SMS, CaaS, Subscription — runs against the
sandbox adapters until live credentials exist (app still Pending
Approval, no API key). The live adapter is spec-correct (POST JSON,
`applicationId`+`password` in the body, success = `S1000`, CaaS `P1003`
= OTP sent, not charged) and its OTP transactions are persisted in
SQLite, but no live call has ever been made. The demo OTP codes shown on
screen are sandbox-only.

## Planned (not built, not claimed)

real GPS/map tiles (Leaflet CDN is blocked in the
sandbox; the text fallback is verified), service-worker offline re-visit,
photo retention/deletion pass, withdraw-bid endpoint, SMS-reply actions
(`dealcraft YES/NO` by plain SMS).

## Concurrency

The server uses node:sqlite's synchronous DatabaseSync with WAL mode and a 5-second busy timeout, so every query runs on the event loop and concurrent writers queue instead of failing. That keeps the single-process demo correct, but it caps throughput at what one Node process can serialise — under sustained parallel write load, requests queue behind the slowest query and there is no connection pool or replica to absorb it.

## External review

An independent review of the repo (26 Nov 2026) scored it **71/100**;
after the fixes from that review the same criteria score **~80/100**
(Innovation 21/25, AppLink 13/20, Technical 18/20, Business 14/20,
Problem–solution fit 9/10, Presentation 5/5). The remaining points need
evidence, not features: one live AppLink call, a deployed URL, the
proposal PDF, and the demo video.
