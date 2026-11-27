# DealCraft backend

Mutually confirmed digital work record for informal jobs in Bangladesh
(electrician / painter / plumber).

**Honest limits:** DealCraft holds no money and does not guarantee
payment. Payment entries are acknowledgements only. This record is not a
legal document. AppLink reaches Banglalink subscribers only.

## Run

```sh
npm install
npm start          # listens on PORT (default 3000)
npm test           # full regression (783 assertions; the count grows as coverage is added)
```

Full documentation lives in [`../docs/`](../docs/):

- [Setup & demo](../docs/setup.md) — run locally, env vars, backups
- [Architecture](../docs/architecture.md) — event log, versions,
  fingerprints, code layout
- [API reference](../docs/api.md) — endpoint summary
- [AppLink](../docs/applink.md) — adapters, sandbox vs live
- [Security & privacy](../docs/security.md) — hardening, rate limits

Auth: phone + OTP only. Sessions expire 7 days after login. Workers use
a `?token=` worker token scoped to one job (7-day expiry), no account
needed. OTP verify is rate limited: 5 failed attempts per phone+purpose
per 15 minutes, then 429.
