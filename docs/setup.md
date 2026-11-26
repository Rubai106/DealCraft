# Setup

## Requirements

- Node.js 24+ (see `engines` in `package.json`). No other services.
- The database is a SQLite file created on first run at
  `server/data/dealcraft.db` (gitignored). Photos land in `uploads/`
  (gitignored).

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

```bash
npm test           # full regression: npm run regression (243 assertions)
npm run dev        # watch mode
```

CI runs the same regression on every push to main
(`.github/workflows/test.yml`, Node 24, `npm ci` + `npm test`).

## Environment

Copy `.env.example` to `.env` and fill in the real values. Never commit
`.env` (it is gitignored).

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default `3000`) |
| `APPLINK_MODE` | `sandbox` (default) or `live` |
| `APPLINK_APP_ID` | AppLink applicationId — leave blank until the API key arrives |
| `APPLINK_PASSWORD` | AppLink API key (password) — emailed only after approval |
| `APPLINK_BASE_URL` | Override the API host (default `https://api.applink.com.bd`); only set if AppLink says so |
| `APPLINK_OTP_MESSAGE` | Optional template text for a live OTP SMS |
| `APPLINK_DELIVERY_REPORT_URL` | Optional delivery-report callback URL |
| `DEALCRAFT_DEMO_TOKEN` | Token required by the demo endpoints when set (see below) |
| `SESSION_SECRET` | Session signing secret |
| `NODE_ENV` | Set to `production` on any deployed server (demo endpoints return 404) |

## Demo (under 2 minutes)

1. Open http://localhost:3000 and tap **Load demo job** — or
   `POST /api/demo/seed`. Demo phones: hirer `01700000001` (Rahim Uddin),
   worker `01800000002` (Karim Mistri). In sandbox mode the OTP codes are
   shown on screen, labelled **SANDBOX — not a live AppLink call**.
2. **FairScope** — the ৳18,000 apartment electrical rewiring. Wall repair
   was "Not decided" in the first draft; creation is refused while any term
   is unresolved — it must be answered or explicitly skipped, one term at a
   time (the demo resolves it to "Worker includes wall repair").
3. **Dual confirmation** — hirer confirms with the hirer-confirm OTP, the
   worker opens the SMS link and confirms with their own OTP. Job becomes
   **ACTIVE** only after both.
4. **ChangeLock** — the worker proposes +৳2,000 for two extra points; the
   hirer accepts. The record moves to **V2 (৳20,000)**; V1 (৳18,000) stays
   intact with its original fingerprint.
5. **PayProof** — hirer records a ৳5,000 Cash advance; the worker
   acknowledges receipt from their link. Balance: agreed ৳20,000 /
   acknowledged paid ৳5,000 / remaining ৳15,000.
6. **Milestones + photos** — worker completes all three milestones with a
   photo; hirer approves each; job closes.
7. **ResolvePack** — download the PDF: the whole chronological record on
   one export.
8. **WorkPassport** — the worker adds the closed job from their own link,
   choosing what is shown; open the public passport page / QR code.
   Amounts, client names and photos stay hidden unless the worker enables
   them.

The full script is also at `GET /api/demo/script`. The regression test
(`tests/regression/run-demo.mjs`) runs exactly this story over real HTTP
and asserts every step.

## Demo endpoints — dangerous by design

`POST /api/demo/seed` and `POST /api/demo/reset` wipe every table,
including sessions — re-login after seeding. They return 404 when
`NODE_ENV=production`, and when `DEALCRAFT_DEMO_TOKEN` is set they need
the same value as the `x-demo-token` header (or a `demoToken`
body/query field). Set `NODE_ENV=production` on any public deployment.

## Backups

Back up the database file before any demo or deployment — the demo
seed/reset wipes it, and there is no undo:

```bash
cp server/data/dealcraft.db backups/dealcraft-YYYY-MM-DD.db
```

Back up `uploads/` with it, or the photos will dangle. See
[database.md](database.md) for the longer-term plan.
