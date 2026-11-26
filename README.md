# DealCraft

[![CI](https://github.com/Rubai106/DealCraft/actions/workflows/test.yml/badge.svg)](https://github.com/Rubai106/DealCraft/actions/workflows/test.yml)
[![Node.js >= 24](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)

**A phone call can start a job. It shouldn't be the only record of what was promised.**

DealCraft turns a phone-call agreement for an informal job — electrician,
painter, plumber — into a **mutually confirmed digital work record**.
Before work starts, both sides agree the scope clearly. During work,
every change and payment is recorded with both sides' confirmation.
After work, both sides hold the complete history, and the worker carries
the proof into future jobs.

> **Honest limits, stated plainly.** DealCraft is not a contract service.
> It holds no money, does no escrow, does not guarantee payment, and does
> not decide who is right in a disagreement. Payment entries are
> acknowledgements only. This record is not a legal document. AppLink
> reaches Banglalink subscribers only; users on other networks use the
> web / PWA link route.

Built for **AppQuest 2.0** (AppLink / Banglalink) — theme: Human Potential
/ Future of Work. Submission due **30 Nov 2026, 23:59 BST**.

## Quick start

```bash
npm install
npm start          # http://localhost:3000
npm test           # full regression — 254 assertions, PASS
```

Requires Node.js 24+. No other services. The database is a SQLite file
created on first run at `server/data/dealcraft.db`. See
[docs/setup.md](docs/setup.md) for environment variables and the
2-minute demo script.

## Features

| Feature | What it does |
|---|---|
| **FairScope** | Guided trade questions; creation is refused while any term is unresolved — answer it or explicitly skip it, one term at a time |
| **Dual OTP confirmation** | A job becomes ACTIVE only after hirer and worker each confirm by OTP |
| **ChangeLock** | Price/scope changes create a new version (V1 → V2); the old version stays intact with its fingerprint |
| **PayProof** | Payments recorded (Cash / bKash / Nagad) and acknowledged by the recipient; balance always visible |
| **Milestones + photos** | Work marked complete with BEFORE/AFTER photos; hirer approves each step |
| **Live location** | Opt-in sharing — hirer sees distance/ETA and a geofenced arrival; no coordinates kept in the record |
| **Find a Repairer** | Optional mode: post a photo job, nearby workers bid, picking a bid creates a DRAFT record (dual OTP still required) |
| **ResolvePack** | Disputes with both sides' statements, resolved only by mutual agreement; one-click PDF export of the full record |
| **WorkPassport** | Worker-owned public record of completed jobs — random profile id, no phone number, no star ratings |
| **Billing** | ৳10 per confirmed record (CaaS) or ৳70/month plan; no DealCraft fee for workers |

Full detail: [docs/features.md](docs/features.md).

## Architecture

One append-only event log per job; everything else is a view of it.
Versions are never edited, only superseded, each with a SHA-256
fingerprint covering scope, price, deadline, FairScope answers, skipped
terms and milestones. See [docs/architecture.md](docs/architecture.md).

## AppLink

OTP, SMS, CaaS and Subscription go through one adapter layer
(`server/src/applink/`) with identical interfaces in sandbox and live
mode. Sandbox is the default and every sandbox call is labelled. The
AppLink application exists and is **Pending Approval** — no API key yet,
so no live call has been made. See
[docs/applink.md](docs/applink.md) and the redacted portal worksheet in
[APPLINK-APP-CREATION.md](APPLINK-APP-CREATION.md).

## Status

- **Working:** everything in the table above, verified by the regression
  (254 assertions, PASS) and CI on every push to main.
- **Sandbox-only:** all AppLink calls, until live credentials exist.
- **Planned:** real GPS/map tiles, offline PWA re-visit, photo
  retention pass, withdraw-bid endpoint.

An independent review of this repo (26 Nov 2026) scored it **~80/100**;
the remaining points need evidence, not features — one live AppLink
call, a deployed URL, the proposal PDF, and the demo video. Details:
[docs/status.md](docs/status.md).

## Docs

- [Setup & demo](docs/setup.md) — run locally, env vars, backups
- [Features](docs/features.md) — every feature, plus the judging evidence
- [Architecture](docs/architecture.md) — event log, versions, fingerprints
- [AppLink](docs/applink.md) — adapters, sandbox vs live, approval status
- [Security & privacy](docs/security.md) — hardening, rate limits, limits
- [Database](docs/database.md) — SQLite now, Postgres plan
- [API reference](docs/api.md) — endpoint summary
- [Design](docs/design.md) — Direction 03 "Dotted Bangladesh", gate status
- [Project status](docs/status.md) — working / sandbox-only / planned

## Notes

- This is a hackathon entry, built for AppQuest 2.0. It is not a
  production service: see [docs/security.md](docs/security.md) for the
  known limits before deploying it anywhere public.
- Screenshots from the QA passes are kept locally in
  `.taste-skill/shots/` and are not committed to this repo.
- The full AppLink portal sheet (with account values) lives in the
  gitignored `APPLINK-APP-CREATION.local.md` and is never pushed.
