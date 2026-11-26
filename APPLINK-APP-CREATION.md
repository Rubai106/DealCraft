# AppLink — Step 1 + Step 2 sheet for DealCraft

Prepared 2026-11-26. Step 1 = finish the SP profile. Step 2 = create the API app.
Steps 3 (approval emails) and 4 (live credentials into DealCraft) come after — do NOT do them yet.

## Step 1 — SP profile (user.applink.com.bd)

Account on file: username **Rubai**, SP ID **SPP_010237**, email samin.yeasar.rubai@g.bracu.ac.bd,
phone 8801757007084. Portal popup says Approved, but the profile page says
"Account Verification Pending / Your profile is incomplete".

Check / fill in the profile form (Settings > SP Profile):
- Full name: Samin Yeasar Rubai
- Organisation: BRAC University, type Educational, industry Education, country Bangladesh
- Website: https://www.bracu.ac.bd
- Mobile, date of birth, gender, occupation
- Address line 1 + line 2, city, ZIP code
- ID type (NID / Driving Licence / Passport) + ID number
- Upload: ID document front + back, profile photo (JPG/PNG, max 5 MB each)
- Submit, then check email (including spam) for approval — can take up to 24h.

Do not send any approval email until Step 2 is also done.

## Step 2 — Create the API app (API Apps > Create New Application)

Fill exactly this. Where the portal offers a dropdown, pick the closest match
and note what you picked — the exact dropdown labels vary.

### Step 1 — Details
| Field | Enter |
|---|---|
| Application Name | DealCraft |
| Application Description | Mutually confirmed digital work record for informal jobs in Bangladesh. A phone-call agreement becomes a versioned record confirmed by both hirer and worker by OTP. No money is held, no escrow, payment acknowledgements only. |
| Application Category | Business (or Productivity / Utility if Business is not listed) |
| Application URL | https://github.com/Rubai106/DealCraft |
| Callback URL | https://github.com/Rubai106/DealCraft (placeholder until the app is deployed — update it to the live server URL before go-live; the server callback endpoints are /api/applink/sms-report, /api/applink/caas-notify and /api/applink/subscription-notify) |
| Terms & Conditions | Agree |

### Step 2 — Services (Add API)
Tick: **SMS, CaaS, Subscription**. Also tick **USSD** only if the wizard forces a
choice — DealCraft does not use USSD. OTP is not a separate tickbox in the wizard;
it comes with the app.

### SMS Sender Details
| Field | Enter |
|---|---|
| Sender Name | DealCraft |
| Default SMS keyword | DEALCRAFT |
| SMS environment | Sandbox |

### Subscription Service Details
| Field | Enter |
|---|---|
| Service Category | Business (or the closest match) |
| Service Name | DealCraft Frequent Hirer |
| Amount | 70 |
| Currency | BDT |
| Validity Type | Monthly / 1 month |
| Validity Value | 1 |
| Validity Unit | Month |
| Auto Subscription | Off |
| Free Trial | Off |

### CaaS Charging Details
| Field | Enter |
|---|---|
| Charging Model | Default |
| Price Point | 10 |
| Currency | BDT |
| Service Name | DealCraft Record Fee |
| Service Category | Business (or the closest match) |
| Free Trial | Off |

### Short Code
Enter a short code of 2+ characters. Try **21212** first — if the portal says it is
taken, pick another number it accepts and write it down here.

### Finish
Click **Finish Provisioning**, enter your portal password when asked.
Do NOT expect an API key yet — the key is emailed only after the app is approved
(Step 3, separate approval emails).

## After Step 2 — write down here
- Application ID (APP_…): ____________________
- Short code accepted: ____________________
- App status in portal: ____________________
- Any error the portal showed: ____________________

## What DealCraft already matches
Base https://api.applink.com.bd, POST JSON, applicationId + password in the body,
success = statusCode S1000. OTP send/verify (5 min), SMS send, CaaS charge
(P1003 = OTP sent, NOT charged) + verify (S1000 = charged), Subscription
register action "1" / unregister "0". Credentials live in APPLINK_APP_ID and
APPLINK_PASSWORD, server-side only, never committed. Without them the app runs
in labelled sandbox mode.

## ACTUALS — filled 2026-11-26 14:09 +06 (portal)
- Application ID: APP_019204 — status Pending Approval
- Short code accepted: 21213 (21212 was NOT available — portal offered only 21213)
- SMS keyword: dealcraft (lowercase — portal rejected DEALCRAFT)
- Default Sender Address: 21213
- Allowed Host Address(es): 127.0.0.1 — PLACEHOLDER, must be updated to the real
  server public IP before any real API call will succeed
- Subscription: DealCraft Frequent Hirer, 70.00 BDT, monthly, Free Trial NO
- CaaS: payment instrument "Mobile Account for banglalink" enabled;
  Service Charge Percentage 20 is a portal default (disabled field).
  No Price Point 10 field existed in the wizard — verify after approval.
- SMS charging default: MT SMS charged to subscriber, 2.00 BDT
- No API key shown anywhere — appears only after approval.
- SP profile: Organisation Details saved (BRAC University, Bangladesh,
  8801757007084). STILL MISSING: Contact Person (DOB, gender, permanent
  address, NID/Passport scan) and Reconciliation Details (beneficiary name,
  bank name/branch/routing/account). Profile status: Account Verification Pending.
