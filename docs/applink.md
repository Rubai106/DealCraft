# AppLink integration

All four APIs go through one adapter layer, `server/src/applink/`, with
**identical interfaces** in sandbox and live mode. The full portal
worksheet (Step 1 + Step 2, redacted) is at
[`../APPLINK-APP-CREATION.md`](../APPLINK-APP-CREATION.md); the full
sheet with account values lives in the gitignored
`APPLINK-APP-CREATION.local.md` and is never pushed.

## What each API is used for

| API | Used for | Files |
|---|---|---|
| OTP | hirer/worker confirmation, login, change approvals, payment acks | `otp.js` |
| SMS | confirmation requests, change alerts, payment-ack requests, closure notices (reference + link only — never the full agreement) | `sms.js` |
| CaaS | ৳10 per confirmed record | `caas.js` |
| Subscription | ৳70/month frequent-hirer plan | `subscription.js` |

## Sandbox (the default)

`APPLINK_MODE=sandbox`. It generates real 6-digit OTPs (valid 5 minutes,
like the real ones) and logs every call to
`server/data/applink-log.jsonl`. Codes are delivered by the sandbox SMS
path only and never appear in an API response body — except when the
server runs with `TEST_MODE=true`, a test-only flag the regression suite
sets so it can read the codes it needs (see [security.md](security.md)).
CaaS returns `PENDING`
until the OTP is verified — money has not moved until verification, so
the server verifies before marking a record paid. See the log any time:
`GET /api/applink/log` (scoped to the caller; see
[security.md](security.md)).

## Application status (2026-11-26)

The AppLink application **exists and is Pending Approval** — created in
the portal 2026-11-26 14:09: **DealCraft**, APIs SMS / CaaS /
Subscription, operator Banglalink. Short code **21213** (21212 was
unavailable), SMS keyword **dealcraft** (lowercase only — the portal
rejects uppercase), subscription **৳70/month** ("DealCraft Frequent
Hirer", monthly, no free trial), CaaS via Banglalink Mobile Account.
Allowed Host is the placeholder `127.0.0.1` — it must be updated to the
real server IP before any real API call will succeed. **No API key yet**
— it is emailed to the registered address only after approval, so there
is still no live AppLink call; everything runs in labelled sandbox mode.
The portal wizard had no field for the ৳10 CaaS price point and no
SMS-environment selector, so both still need checking after approval.

The SP profile is still "Account Verification Pending" — Contact Person
(DOB, gender, permanent address, NID/passport scan) and Reconciliation
(bank details) are missing and need the account owner's own documents.
Application and SP ids are redacted from this public repo.

What remains, in the portal at https://user.applink.com.bd/:

1. Finish the SP profile (above) and wait for the app approval email.
2. **Whitelist test numbers** for sandbox use — an un-whitelisted number
   returns `E1343`. Also ask AppLink to allow-list the server IP (the docs
   require it), replacing the `127.0.0.1` placeholder. For AppQuest
   fast-track approval, email support@applink.com.bd from the Team Lead's
   registered email with team name, project title and application
   description.
3. Live SMS needs an SMS bundle bought in the portal (Billing → Buy SMS
   bundle) and the signed go-live forms AppLink collects.

## Switching sandbox → live (real API spec)

Base URL for every API: `https://api.applink.com.bd` (same host for
sandbox and live — there is no separate sandbox host). Every call is
`POST` JSON with `applicationId` + `password` (the API key) in the body
— no Authorization header, no token endpoint. Success is judged by the
body's `statusCode` (`S1000`), never by the HTTP status. Endpoints,
exactly as documented at https://dev.applink.com.bd/docs:

| API | Endpoint | Notes |
|---|---|---|
| SMS | `POST /sms/send` | `destinationAddresses: ["tel:8801…"]`, `message` ≤ 2000 chars |
| OTP | `POST /otp/send`, `POST /otp/verify` | Code valid 5 min; verify needs the `otpTransactionId` from send (stored server-side by the adapter, persisted in SQLite so it survives restarts); wrong/expired code → `E1850`/`E1851` |
| CaaS | `POST /caas/charge`, `POST /caas/verify` | Charge returns `P1003` = OTP sent, **not** charged; only verify returning `S1000` means money moved |
| Subscription | `POST /subscription/register` (`action: "1"`), `POST /subscription/unregister` (`action: "0"`), `POST /subscription/get-charging-info`, `POST /subscription/get-base-size` | ৳70/month price/validity is configured on the app in the portal, not in the API call |

Steps:

1. Copy `.env.example` to `.env` and fill in the real values:
   `APPLINK_MODE=live`, `APPLINK_APP_ID`, `APPLINK_PASSWORD`.
   Never commit `.env` (it is gitignored).
2. Restart. `GET /api/applink/mode` must read `live`.
3. In live mode the adapters **never return OTP codes** in responses, and
   every call is still logged with mode `live` (safe fields only — never
   the password, never a code). If live credentials are missing, the live
   adapter throws a clear "live credentials not configured" error instead
   of silently falling back to sandbox. Common failures are mapped to
   plain messages: `E1313` bad credentials/inactive app, `E1323` app not
   approved, `E1343` number not whitelisted in sandbox.

## Callbacks

The server implements the callback endpoints the AppLink setup lists
(`POST /api/applink/sms-report`, `/api/applink/mo-sms`,
`/api/applink/caas-notify`, `/api/applink/subscription-notify`). They log
masked and update local state only where safe — for example, a CaaS
notify with `S1000` marks the named charge VERIFIED, and a
subscription-end notify cancels the local ACTIVE row. The callback URL
configured in the portal is currently a placeholder (the repo URL) and
must be updated to the live server URL before go-live.
