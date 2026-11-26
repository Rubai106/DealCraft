# API reference (summary)

Base: same origin as the app. Authenticated endpoints take
`Authorization: Bearer <token>` unless noted. See
[architecture.md](architecture.md) for the data model.

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
POST /api/disputes/:id/resolve-proposal | POST /api/disputes/:id/resolve-response
POST /api/jobs/:id/close
GET  /api/jobs/:id/resolvepack (PDF) | GET /api/jobs/:id/resolvepack.json
POST /api/passport/add | GET /api/passport/:profileId | GET /passport/:profileId | GET /api/passport/:profileId/qr.png
POST /api/billing/caas | POST /api/billing/caas/:id/verify | POST /api/billing/subscribe
POST /api/billing/unsubscribe | GET /api/billing/status
POST /api/jobs/:id/worker-link
GET  /api/jobs/:id/location
POST /api/worker/:token/location/start | POST /api/worker/:token/location
POST /api/worker/:token/location/pause | POST /api/worker/:token/location/resume
POST /api/worker/:token/location/stop
POST /api/bid-jobs | GET /api/bid-jobs/open | GET /api/bid-jobs/mine | GET /api/bid-jobs/:id
POST /api/bid-jobs/:id/photos | POST /api/bid-jobs/:id/bids
GET  /api/bid-jobs/:id/bids | POST /api/bid-jobs/:id/bids/:bidId/accept
POST /api/bid-jobs/:id/close
GET  /uploads/:file (job-scoped; hirer or worker of the job only)
GET  /api/applink/mode | GET /api/applink/log | GET /api/fairscope | GET /api/health
POST /api/applink/sms-report | POST /api/applink/mo-sms
POST /api/applink/caas-notify | POST /api/applink/subscription-notify
POST /api/demo/seed | POST /api/demo/reset | GET /api/demo/script
```

Notes:

- Demo endpoints return 404 unless `DEMO_MODE=true`, and 404 always in
  production; they also need `DEALCRAFT_DEMO_TOKEN` when one is
  configured (see [setup.md](setup.md)).
- OTP verify is rate limited: 5 failed attempts per phone+purpose per 15
  minutes, then 429.
- Photo uploads: multipart, image only, 5 MB max, magic-byte validated.
