# DealCraft

[![CI](https://github.com/Rubai106/DealCraft/actions/workflows/test.yml/badge.svg)](https://github.com/Rubai106/DealCraft/actions/workflows/test.yml)
[![Node.js >= 24](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)

**A phone call can start a job. It shouldn't be the only record of what was promised.**

DealCraft turns a phone-call agreement for an informal job — electrician,
painter, plumber — into a **mutually confirmed digital work record**. Before
work starts, both sides agree the scope clearly. During work, every change
and payment is recorded with both sides' confirmation. After work, both
sides hold the complete history, and the worker carries the proof into future jobs.

> **Honest limits, stated plainly.** DealCraft is not a contract service.
> It holds no money, does no escrow, does not guarantee payment, and does
> not decide who is right in a disagreement. Payment entries are
> acknowledgements only. This record is not a legal document. AppLink
> reaches Banglalink subscribers only; users on other networks use the web / PWA link route.

<!-- Demo GIF: add after recording -->
> **Demo video:** _GIF coming after the recording — the 2-minute demo
> script is in [docs/setup.md](docs/setup.md)._

Built for **AppQuest 2.0** (AppLink / Banglalink) — theme: Human Potential
/ Future of Work. Submission due **30 Nov 2026, 23:59 BST**.

## Demo scenario — a ৳18,000 rewiring, in five lines

1. Hirer records a full flat rewiring — 24 points, ৳18,000 — through
   FairScope; creation is refused until every term is answered or explicitly skipped.
2. Hirer and worker each confirm by OTP; only then does the record go ACTIVE.
3. Two extra points are proposed; ChangeLock makes V2 at ৳20,000 (+৳2,000)
   while V1 stays intact with its original fingerprint.
4. A ৳5,000 Cash advance is recorded in PayProof and acknowledged
   "Received" by the worker — balance ৳20,000 / paid ৳5,000 / left ৳15,000.
5. Three milestones close with BEFORE/AFTER photos and hirer approval;
   the whole history exports as one ResolvePack PDF.

## How it works

- **One append-only event log per job** — everything else is a view of it.
- **Versions, never edits** — a change supersedes the old version, each
  with a SHA-256 fingerprint covering scope, price, deadline, FairScope
  answers, skipped terms and milestones.
- **Dual OTP confirmation** — nothing takes effect until both sides confirm.
- **Tamper-evident export** — ResolvePack carries a QR code that verifies
  against the live record.

## Quick start

```bash
npm install
npm start          # http://localhost:3000
npm test           # full regression — 783 assertions, PASS (see tests/regression/run-demo.mjs; the count grows as coverage is added)
```

Requires Node.js 24+. No other services. The database is a SQLite file
created on first run at `server/data/dealcraft.db`. A repo-root `.env`
file is honoured (dotenv) — see [docs/setup.md](docs/setup.md) for
environment variables and the 2-minute demo script.

## Features

| Feature | What it does |
|---|---|
| **FairScope** | Guided trade questions; creation is refused while any term is unresolved — answer it or explicitly skip it, one term at a time |
| **Dual OTP confirmation** | A job becomes ACTIVE only after hirer and worker each confirm by OTP |
| **ChangeLock** | Price/scope changes create a new version (V1 → V2); the old version stays intact with its fingerprint |
| **PayProof** | Payments recorded (Cash / bKash / Nagad) and acknowledged by the recipient; balance always visible |
| **Milestones + photos** | Work marked complete with BEFORE/AFTER photos; hirer approves each step |
| **Live location** | Opt-in sharing — hirer sees distance/ETA and a geofenced arrival; shared only while the job is active, deleted when it closes; the permanent record stores arrival events without coordinates |
| **WorkPassport** | Worker-owned public record of completed jobs — random profile id, no phone number, no star ratings |
| **ResolvePack** | Disputes with both sides' statements, resolved only by mutual agreement; one-click PDF export of the full record |
| **Billing** | ৳10 per confirmed record (CaaS) or ৳70/month plan; no DealCraft fee for workers |

Full detail: [docs/features.md](docs/features.md).

Read more: [Setup & demo](docs/setup.md) · [Architecture](docs/architecture.md) · [AppLink](docs/applink.md) · [API reference](docs/api.md) · [Security & privacy](docs/security.md) · [Database](docs/database.md) · [Design](docs/design.md) · [Project status](docs/status.md)

---

# Details

Everything below the line above is the detail behind the pitch: the
architecture, the AppLink status, what works and what does not yet, and
the team and AI disclosure. Nothing here is hidden — it is just below
the fold.

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
  (783 assertions, PASS — the count grows as coverage is added) and CI on every push to main.
- **Sandbox-only:** all AppLink calls, until live credentials exist.
- **Planned:** real GPS/map tiles, offline PWA re-visit, photo
  retention pass, withdraw-bid endpoint.
- **Roadmap:** Find a Repairer photo-job bidding — a secondary mode
  behind `FEATURE_BIDDING` (default off); detail in
  [docs/features.md](docs/features.md) §11, not a live promoted mode.

## Team & AI disclosure

**Team** (AppQuest 2.0, 2 members):

| Role | Name |
|---|---|
| Team Lead | Samin Yeasar Rubai — BRAC University — samin.yeasar.rubai@g.bracu.ac.bd |
| Teammate | [TEAM TO SUPPLY — name, university, role] |

**Tools used:** Node.js 24 + Express, SQLite (`node:sqlite`), vanilla
HTML/CSS/JS (PWA), AppLink portal + API (OTP, SMS, CaaS,
Subscription), GitHub + GitHub Actions (Node 24 CI), Playwright /
`design-taste-frontend` skill for design checks.

**AI use — stated honestly.** AI assistants (including Muse) were used
throughout this project: for research and competitor checks, for
drafting and reviewing code and documentation, for design iterations,
and for preparing this proposal and the demo script. Every feature was
verified by the project's own regression suite (783 assertions, PASS)
and by reading the code and the running app — AI output was never
submitted unreviewed, and no product claim in this repo rests on an
AI's word alone. The AppLink adapter was built against AppLink's
published API documentation and verified against a mock-live harness;
no live AppLink call has been made yet, and nothing in this repo
pretends otherwise.

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
- Screenshots from the QA passes are kept in a local QA archive outside
  the repo and are not committed to this repo.
- PWA icons: `public/manifest.json` currently lists the SVG icon only.
  PNG icons (`icon-192.png`, `icon-512.png`) still need to be uploaded
  via the GitHub web UI — the repo's push route is text-only and cannot
  carry binary files — before the PWA is fully installable.
- The full AppLink portal sheet (with account values) lives in the
  gitignored `APPLINK-APP-CREATION.local.md` and is never pushed.
