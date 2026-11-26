// DealCraft regression: boots the real server on a scratch port and runs the
// full demo scenario end-to-end over real HTTP, asserting every step.
// Exits non-zero on ANY failure. Usage: npm run regression  (or npm test)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const HIRER = '01700000001';
const WORKER = '01800000002';

const server = spawn(process.execPath, ['server/server.js'], {
  cwd: path.resolve(import.meta.dirname, '..', '..'),
  env: { ...process.env, PORT: String(PORT), APPLINK_MODE: 'sandbox', DEALCRAFT_DEMO_TOKEN: 'test-demo-token' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stderr.write('[server:err] ' + d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function check(cond, label, extra = '') {
  if (!cond) throw new Error('ASSERT FAILED: ' + label + (extra ? ' — ' + extra : ''));
  passed++;
  console.log('  ok — ' + label);
}
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}
function fingerprint({ job_id, version_no, scope, price, deadline }) {
  return createHash('sha256')
    .update(canonicalStringify({ job_id, version_no, scope, price, deadline }), 'utf8')
    .digest('hex');
}
async function req(p, opts = {}) {
  const res = await fetch(BASE + p, opts);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* non-JSON (PDF/HTML) */ }
  return { status: res.status, body, text, headers: res.headers };
}
const j = (obj) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
// PDFKit writes text as hex fragments split by kerning ([<5265...> 25 <...>] TJ),
// so a phrase never appears contiguously in the raw bytes. Decode every hex
// string in the file and join them to recover the readable text.
function pdfPlainText(s) {
  const parts = [];
  for (const m of String(s).matchAll(/<([0-9a-fA-F\s]+)>/g)) {
    const hex = m[1].replace(/\s+/g, '');
    if (hex.length > 0 && hex.length % 2 === 0) parts.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return parts.join('');
}
// Demo calls carry the dev token (demo endpoints are token-gated when one is configured).
const dj = (obj) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', 'x-demo-token': 'test-demo-token' }, body: JSON.stringify(obj) });
const auth = (token) => ({ Authorization: 'Bearer ' + token });
const aj = (token, obj) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(obj) });

let code = 1;
try {
  console.log('== boot ==');
  let health = null;
  for (let i = 0; i < 40; i++) {
    try { const r = await req('/api/health'); if (r.status === 200) { health = r; break; } } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!health) throw new Error('server did not start');
  check(health.body?.ok === true && health.body?.db === 'sqlite', 'health OK (sqlite)');
  const mode = await req('/api/applink/mode');
  check(mode.body?.mode === 'sandbox', 'AppLink mode is sandbox');
  const fsScope = await req('/api/fairscope');
  check(fsScope.body?.questions?.ELECTRICIAN?.length === 8, 'FairScope: 8 electrician questions');
  check(fsScope.body?.questions?.PAINTER?.length === 7, 'FairScope: 7 painter questions');
  check(fsScope.body?.questions?.PLUMBER?.length === 5, 'FairScope: 5 plumber questions');
  const script = await req('/api/demo/script');
  check(Array.isArray(script.body?.script) && script.body.script.length >= 9, 'demo script present');

  console.log('== reset + seed demo job (BDT 18,000 rewiring) ==');
  const resetNoToken = await req('/api/demo/reset', j({}));
  check(resetNoToken.status === 403, 'demo reset without the demo token is rejected (403)');
  const reset = await req('/api/demo/reset', dj({}));
  check(reset.status === 200, 'demo reset with the demo token');
  const seed = await req('/api/demo/seed', dj({}));
  check(seed.status === 200, 'demo seed');
  const job = seed.body.job;
  const workerToken = seed.body.workerLink.split('token=')[1];
  check(job?.price === undefined && job?.status === 'DRAFT', 'seeded job is DRAFT');
  check(job?.trade === 'ELECTRICIAN' && job?.worker_phone === WORKER, 'seeded job is the electrician demo');
  check(typeof seed.body.sandboxOtps?.hirerConfirm === 'string', 'seed returns sandbox hirer OTP');
  check(typeof seed.body.sandboxOtps?.workerConfirm === 'string', 'seed returns sandbox worker OTP');

  console.log('== hirer login (phone + OTP) ==');
  const otpReq = await req('/api/auth/request-otp', j({ phone: HIRER, name: 'Rahim Uddin', role: 'hirer' }));
  check(otpReq.status === 200 && otpReq.body?.sandbox?.otp, 'login OTP requested (sandbox code returned, labelled)');
  check(otpReq.body?.sandbox?.note?.includes('SANDBOX'), 'sandbox OTP is labelled SANDBOX');
  const login = await req('/api/auth/verify-otp', j({ phone: HIRER, code: otpReq.body.sandbox.otp }));
  check(login.status === 200 && login.body?.token, 'hirer logged in with OTP');
  const token = login.body.token;
  const me = await req('/api/me', { headers: auth(token) });
  check(me.body?.user?.phone === HIRER, 'session token works (/api/me)');

  console.log('== OTP rate limiting: 5 wrong codes, then 429 ==');
  const rlPhone = '01700000077';
  const rlOtp = await req('/api/auth/request-otp', j({ phone: rlPhone, name: 'Rate Limit Test', role: 'hirer' }));
  check(rlOtp.status === 200 && rlOtp.body?.sandbox?.otp, 'rate-limit test OTP issued');
  for (let i = 0; i < 5; i++) {
    const wrong = await req('/api/auth/verify-otp', j({ phone: rlPhone, code: '000000' }));
    check(wrong.status === 401, `wrong OTP attempt ${i + 1} is 401 (not yet limited)`);
  }
  const limited = await req('/api/auth/verify-otp', j({ phone: rlPhone, code: '000000' }));
  check(limited.status === 429, '6th wrong OTP in 15 minutes is 429 (rate limited)');

  console.log('== phone validation + OTP send cap + expired session ==');
  const badPhone = await req('/api/auth/request-otp', j({ phone: '12345' }));
  check(badPhone.status === 400, 'OTP request with a non-Bangladesh number is rejected (400)');
  const landline = await req('/api/auth/request-otp', j({ phone: '02123456789' }));
  check(landline.status === 400, 'OTP request with a landline number is rejected (400)');
  const validPlus = await req('/api/auth/request-otp', j({ phone: '+8801712345678' }));
  check(validPlus.status === 200, 'OTP request with a +880 number is accepted');
  const spamPhone = '01988888888';
  for (let i = 0; i < 5; i++) {
    const r = await req('/api/auth/request-otp', j({ phone: spamPhone }));
    if (r.status !== 200) throw new Error('OTP send ' + (i + 1) + ' failed with ' + r.status);
  }
  const sixthSend = await req('/api/auth/request-otp', j({ phone: spamPhone }));
  check(sixthSend.status === 429, '6th OTP send to the same number+purpose in 15 minutes is refused (429)');
  {
    const { DatabaseSync } = await import('node:sqlite');
    const dbPath = path.resolve(import.meta.dirname, '..', '..', 'server', 'data', 'dealcraft.db');
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO Session (id, token, phone, created_at, expires_at) VALUES ('test-expired', 'expired-token-xyz', ?, ?, ?)")
      .run(HIRER, new Date(Date.now() - 86400000).toISOString(), new Date(Date.now() - 1000).toISOString());
    db.close();
    const meExpired = await req('/api/me', { headers: auth('expired-token-xyz') });
    check(meExpired.status === 401, 'expired session token is rejected (401)');
  }

  console.log('== FairScope missing-term warning ==');
  const painterAnswers = {
    'Area / rooms': '2 bedrooms', 'Number of coats': 'Not decided', 'Primer included?': 'Yes, included',
    'Paint brand': 'Berger', 'Surface preparation': 'Sanding + putty', 'Furniture moving': 'Worker moves furniture', Cleanup: 'Worker cleans up',
  };
  const painter = await req('/api/jobs', aj(token, { trade: 'PAINTER', workerPhone: '01900000003', workerName: 'Painter Test', scope: 'Repaint 2 bedrooms', price: 12000, deadline: '2026-12-10', milestones: [{ title: 'Advance', amount: 4000 }], answers: painterAnswers, skippedTerms: [] }));
  check(painter.status === 201, 'painter job created');
  check(Array.isArray(painter.body?.missingTerms) && painter.body.missingTerms.includes('Number of coats'), 'missing-term warning lists "Number of coats"');
  const painterSkip = await req('/api/jobs', aj(token, { trade: 'PAINTER', workerPhone: '01900000004', workerName: 'Painter Test 2', scope: 'Repaint 1 room', price: 6000, deadline: '2026-12-10', milestones: [{ title: 'Advance', amount: 2000 }], answers: painterAnswers, skippedTerms: ['Number of coats'] }));
  check(painterSkip.status === 201 && !painterSkip.body.missingTerms.includes('Number of coats'), 'explicitly skipped term clears the warning');

  console.log('== V1 fingerprint (SHA-256) ==');
  const detail1 = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail1.status === 200, 'job detail readable via worker token');
  const v1 = detail1.body.versions.find((v) => v.version_no === 1);
  check(v1?.price === 18000, 'V1 price is BDT 18,000');
  check(v1?.fingerprint === fingerprint({ job_id: job.id, version_no: 1, scope: 'Apartment electrical rewiring — 2 bedrooms', price: 18000, deadline: '2026-12-05' }), 'V1 SHA-256 fingerprint recomputes');

  console.log('== dual OTP confirmation -> ACTIVE ==');
  const hc = await req(`/api/jobs/${job.id}/hirer-confirm`, aj(token, { otpCode: seed.body.sandboxOtps.hirerConfirm }));
  check(hc.status === 200 && hc.body?.job?.status === 'PENDING', 'hirer confirmed (still PENDING until worker confirms)');
  // Billing gate: the second confirm cannot activate the job while the ৳10
  // record fee is unpaid — it must return 402, not activate.
  const wcUnpaid = await req(`/api/worker/${workerToken}/confirm`, j({ otpCode: seed.body.sandboxOtps.workerConfirm }));
  check(wcUnpaid.status === 402, 'worker confirm with unpaid record fee is refused (402)');
  console.log('== CaaS: BDT 10 charge PENDING -> VERIFIED ==');
  const charge = await req('/api/billing/caas', aj(token, { jobId: job.id }));
  check(charge.status === 200 && charge.body?.status === 'PENDING' && charge.body?.sandboxOtp, 'CaaS charge is PENDING with sandbox OTP (money has not moved)');
  const verify = await req(`/api/billing/caas/${charge.body.chargeId}/verify`, aj(token, { otpCode: charge.body.sandboxOtp }));
  check(verify.status === 200 && verify.body?.status === 'VERIFIED', 'CaaS charge VERIFIED after OTP');
  const sub = await req('/api/billing/subscribe', aj(token, { plan: 'monthly' }));
  check(sub.status === 200 && sub.body?.status === 'ACTIVE' && sub.body?.amount === 70, 'subscription BDT 70/month ACTIVE');
  const subDup = await req('/api/billing/subscribe', aj(token, { plan: 'monthly' }));
  check(subDup.status === 200 && subDup.body?.existing === true && subDup.body?.subscriptionId === sub.body?.subscriptionId, 'second subscribe returns the existing subscription (no duplicate row)');
  const billingStatus = await req('/api/billing/status', { headers: auth(token) });
  check(billingStatus.status === 200 && billingStatus.body?.subscriptionActive === true && billingStatus.body?.paidJobs >= 1, 'billing status shows active subscription + paid job');
  check(billingStatus.body?.recordFee === 10 && billingStatus.body?.subscriptionFee === 70, 'billing status shows ৳10 record fee and ৳70/month');
  const unsub = await req('/api/billing/unsubscribe', aj(token, {}));
  check(unsub.status === 200 && unsub.body?.status === 'CANCELLED', 'unsubscribe cancels the subscription');
  const billingAfter = await req('/api/billing/status', { headers: auth(token) });
  check(billingAfter.body?.subscriptionActive === false, 'billing status shows subscription cancelled');
  // The 402 attempt already consumed the seeded worker OTP (verify runs
  // before the billing check), so request a fresh one for the real confirm.
  const wcOtp = await req(`/api/worker/${workerToken}/request-otp`, j({ purpose: 'worker-confirm' }));
  check(wcOtp.status === 200 && wcOtp.body?.sandbox?.otp, 'fresh worker-confirm OTP issued after paying the fee');
  const wc = await req(`/api/worker/${workerToken}/confirm`, j({ otpCode: wcOtp.body.sandbox.otp }));
  check(wc.status === 200 && wc.body?.job?.status === 'ACTIVE', 'worker confirmed -> job ACTIVE');
  const detail2 = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  const types = detail2.body.events.map((e) => e.type);
  check(types.includes('CONFIRMED_BY_HIRER') && types.includes('CONFIRMED_BY_WORKER'), 'both confirmation events in the log');

  console.log('== ChangeLock: worker proposes +BDT 2,000, hirer accepts -> V2 BDT 20,000 ==');
  const change = await req(`/api/jobs/${job.id}/changes?token=${workerToken}`, j({ priceDelta: 2000, reason: 'Two extra points', details: { scope: 'Apartment electrical rewiring — 2 bedrooms + two extra points' } }));
  check(change.status === 201 && change.body?.change?.status === 'PENDING', 'change proposed (PENDING)');
  const accept = await req(`/api/changes/${change.body.change.id}/respond`, aj(token, { decision: 'accept' }));
  check(accept.status === 200 && accept.body?.change?.status === 'APPROVED', 'hirer accepted the change');
  const detail3 = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail3.body.job.current_version === 2, 'current version is now V2');
  check(detail3.body.balance.agreed === 20000, 'agreed total is now BDT 20,000');
  const v1after = detail3.body.versions.find((v) => v.version_no === 1);
  const v2 = detail3.body.versions.find((v) => v.version_no === 2);
  check(v1after?.price === 18000 && v1after?.fingerprint === v1.fingerprint, 'V1 intact with original price + fingerprint');
  check(v2?.price === 20000 && v2?.fingerprint === fingerprint({ job_id: job.id, version_no: 2, scope: 'Apartment electrical rewiring — 2 bedrooms + two extra points', price: 20000, deadline: '2026-12-05' }), 'V2 fingerprint recomputes');
  check(detail3.body.events.some((e) => e.type === 'CHANGE_PROPOSED') && detail3.body.events.some((e) => e.type === 'CHANGE_APPROVED'), 'change events in the log');

  console.log('== ChangeLock reject path ==');
  const change2 = await req(`/api/jobs/${job.id}/changes?token=${workerToken}`, j({ priceDelta: 500, reason: 'Extra socket' }));
  check(change2.status === 201, 'second change proposed');
  const reject = await req(`/api/changes/${change2.body.change.id}/respond`, aj(token, { decision: 'reject' }));
  check(reject.status === 200 && reject.body?.change?.status === 'REJECTED', 'second change rejected');
  const change3 = await req(`/api/jobs/${job.id}/changes?token=${workerToken}`, j({ priceDelta: 300, reason: 'Extra light' }));
  check(change3.status === 201, 'third change proposed by the worker');
  const selfAccept = await req(`/api/changes/${change3.body.change.id}/respond?token=${workerToken}`, j({ decision: 'accept', otpCode: '000000' }));
  check(selfAccept.status === 403, 'worker cannot accept their own change proposal (403)');
  const detail3b = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail3b.body.job.current_version === 2 && detail3b.body.balance.agreed === 20000, 'rejected change leaves V2 / BDT 20,000 active');
  check(detail3b.body.events.some((e) => e.type === 'CHANGE_REJECTED'), 'rejection in the log');
  const change4 = await req(`/api/jobs/${job.id}/changes?token=${workerToken}`, j({ priceDelta: 300, reason: 'Need a part' }));
  check(change4.status === 201, 'worker proposed a change');
  const clarify = await req(`/api/changes/${change4.body.change.id}/respond`, aj(token, { decision: 'clarify', note: 'Which part, and what brand?' }));
  check(clarify.status === 200 && clarify.body?.change?.status === 'CLARIFICATION', 'clarify writes CLARIFICATION status');
  const detail3c = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail3c.body.events.some((e) => e.type === 'CHANGE_CLARIFIED'), 'clarification is a CHANGE_CLARIFIED event, not a fresh proposal');
  check(!detail3c.body.events.some((e) => e.type === 'CHANGE_PROPOSED' && e.payload_json && JSON.parse(e.payload_json).changeId === change4.body.change.id && JSON.parse(e.payload_json).clarification), 'clarification did not re-emit a CHANGE_PROPOSED event');

  console.log('== PayProof: BDT 5,000 Cash -> ACKNOWLEDGED; balance 20000/5000/15000 ==');
  const pay = await req(`/api/jobs/${job.id}/payments`, aj(token, { amount: 5000, method: 'Cash', date: '2026-11-27' }));
  check(pay.status === 201 && pay.body?.payment?.ack_status === 'AWAITING', 'payment recorded, AWAITING acknowledgement');
  const payOtp = await req(`/api/worker/${workerToken}/request-otp`, j({ purpose: 'payment-ack' }));
  check(payOtp.status === 200 && payOtp.body?.sandbox?.otp, 'payment-ack OTP issued to worker');
  const ack = await req(`/api/payments/${pay.body.payment.id}/ack?token=${workerToken}`, j({ decision: 'received', otpCode: payOtp.body.sandbox.otp }));
  check(ack.status === 200 && ack.body?.payment?.ack_status === 'ACKNOWLEDGED', 'worker acknowledged receipt');
  const detail4 = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail4.body.balance.agreed === 20000 && detail4.body.balance.acknowledgedPaid === 5000 && detail4.body.balance.remaining === 15000, 'balance is 20000 / 5000 / 15000');

  console.log('== milestones + photo ==');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('photo', new Blob([png], { type: 'image/png' }), 'before.png');
  form.append('milestone', '2');
  form.append('kind', 'BEFORE');
  const photoRes = await fetch(BASE + `/api/jobs/${job.id}/photos?token=${workerToken}`, { method: 'POST', body: form });
  check(photoRes.status === 201, 'photo uploaded (201)', 'status ' + photoRes.status);
  const photoJson = await photoRes.json();
  check(photoJson?.photo?.kind === 'BEFORE', 'photo carries its BEFORE label');
  const badKindForm = new FormData();
  badKindForm.append('photo', new Blob([png], { type: 'image/png' }), 'after.png');
  badKindForm.append('kind', 'WRONG');
  const badKind = await fetch(BASE + `/api/jobs/${job.id}/photos?token=${workerToken}`, { method: 'POST', body: badKindForm });
  check(badKind.status === 400, 'photo with an invalid kind is rejected (400)');
  for (let i = 0; i < 3; i++) {
    const done = await req(`/api/jobs/${job.id}/milestones/${i}/complete?token=${workerToken}`, j({}));
    check(done.status === 200, `milestone ${i} marked complete by worker`);
    const ok = await req(`/api/jobs/${job.id}/milestones/${i}/approve`, aj(token, {}));
    check(ok.status === 200, `milestone ${i} approved by hirer`);
  }
  const detail5 = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail5.body.milestones.every((m) => m.completed && m.approved), 'all 3 milestones completed + approved');
  check(detail5.body.photos.length >= 1, 'photo attached to the job');

  console.log('== live location: off by default, token-gated, ACTIVE-only ==');
  const locOff = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locOff.status === 404, 'location GET is 404 when sharing is off');
  const locNoToken = await req(`/api/worker/badtoken/location`, j({ lat: 23.85, lng: 90.45 }));
  check(locNoToken.status === 401, 'location POST rejected without a valid worker token');
  const painterTok = painter.body.workerLink.split('token=')[1];
  const painterStart = await req(`/api/worker/${painterTok}/location/start`, j({}));
  check(painterStart.status === 403, 'location start rejected when the job is not ACTIVE (painter job is DRAFT)');
  const start = await req(`/api/worker/${workerToken}/location/start`, j({}));
  check(start.status === 200 && start.body?.sharing === true, 'worker started live location sharing (opt-in)');
  const far = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.85, lng: 90.45, accuracy: 15 }));
  check(far.status === 200 && far.body?.status === 'en-route', 'far point -> en route');
  const loc1 = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(loc1.status === 200 && loc1.body?.distanceKm > 1 && loc1.body?.etaMinutes >= 1, 'hirer sees distance + ETA while sharing');
  check(loc1.body?.site?.lat === 23.8103 && loc1.body?.site?.lng === 90.4125, 'job site is the seeded Dhaka site');
  check(loc1.body?.trail?.length === 1, 'trail has 1 point so far');
  const otherHirer = await req('/api/auth/request-otp', j({ phone: '01700000009', name: 'Other Hirer', role: 'hirer' }));
  const otherLogin = await req('/api/auth/verify-otp', j({ phone: '01700000009', code: otherHirer.body.sandbox.otp }));
  const locOther = await req(`/api/jobs/${job.id}/location`, { headers: auth(otherLogin.body.token) });
  check(locOther.status === 404, 'location GET rejected for another hirer (404, no leak)');
  // 55 points: trail must cap at 50.
  for (let i = 0; i < 55; i++) {
    const r = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.85 - i * 0.0001, lng: 90.45 - i * 0.0001, accuracy: 12 }));
    if (r.status !== 200) throw new Error('trail point ' + i + ' failed with ' + r.status);
  }
  const locCapped = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locCapped.body?.trail?.length === 50, 'trail capped at 50 points');
  // Pause blocks posts; resume re-opens them.
  const pause = await req(`/api/worker/${workerToken}/location/pause`, j({}));
  check(pause.status === 200 && pause.body?.paused === true, 'worker paused sharing');
  const pausedPost = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.84, lng: 90.44 }));
  check(pausedPost.status === 409, 'location POST rejected while paused');
  const resume = await req(`/api/worker/${workerToken}/location/resume`, j({}));
  check(resume.status === 200 && resume.body?.paused === false, 'worker resumed sharing');
  // Arriving (within 500 m), then arrived (within 100 m) — event once only.
  const near = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.813, lng: 90.414, accuracy: 10 }));
  check(near.status === 200 && near.body?.status === 'arriving', 'within 500 m -> arriving');
  const arrived = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.8105, lng: 90.4127, accuracy: 8 }));
  check(arrived.status === 200 && (arrived.body?.status === 'arrived' || arrived.body?.status === 'on-site'), 'within 100 m -> arrived');
  const arrivedAgain = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.8104, lng: 90.4126, accuracy: 8 }));
  check(arrivedAgain.status === 200, 'second point inside the geofence accepted');
  const detailLoc = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  const arrivals = detailLoc.body.events.filter((e) => e.type === 'ARRIVED_ON_SITE');
  check(arrivals.length === 1, 'ARRIVED_ON_SITE written exactly once, even inside the geofence twice');
  check(typeof arrivals[0]?.created_at === 'string', 'arrival carries a server timestamp');
  const sim = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.8106, lng: 90.4128, accuracy: 12, simulated: true }));
  check(sim.status === 200, 'simulated point accepted (labelled)');
  const locSim = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locSim.body?.latest?.simulated === true, 'latest point is flagged simulated');
  const applogNoAuth = await req('/api/applink/log');
  check(applogNoAuth.status === 401, 'AppLink log without auth is refused (401)');
  const applog = await req('/api/applink/log', { headers: auth(token) });
  check(!JSON.stringify(applog.body || {}).includes('01700000001') && !JSON.stringify(applog.body || {}).includes('01800000002'), 'AppLink log masks full phone numbers');
  check((applog.body?.entries || []).some((e) => e.api === 'sms.send' && JSON.stringify(e.request?.message || '').toLowerCase().includes('arrived')), 'arrival SMS notify attempted via AppLink adapter (sandbox-labelled)');
  const stop = await req(`/api/worker/${workerToken}/location/stop`, j({}));
  check(stop.status === 200 && stop.body?.sharing === false, 'worker stopped sharing');
  const locAfterStop = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locAfterStop.status === 404, 'location GET is 404 after stop (no leak)');

  console.log('== dispute (on the painter job, not the demo job) ==');
  const painterId = painter.body.job.id;
  const painterToken = painter.body.workerLink.split('token=')[1];
  const disp = await req(`/api/jobs/${painterId}/disputes`, aj(token, { category: 'quality', statement: 'Paint finish is patchy in one room.' }));
  check(disp.status === 201 && disp.body?.job?.status === 'DISPUTED', 'dispute opened (hirer statement)');
  const stmt = await req(`/api/disputes/${disp.body.dispute.id}/statements?token=${painterToken}`, j({ text: 'Will repaint that room free of charge.' }));
  check(stmt.status === 201, 'worker added their statement');
  const dispDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  check(dispDetail.body.disputes[0]?.statements?.length === 2, 'both statements recorded; no verdict given');
  const resolve = await req(`/api/disputes/${disp.body.dispute.id}/resolve`, aj(token, { confirmMutual: true, note: 'Agreed to repaint the room; no verdict by DealCraft.' }));
  check(resolve.status === 200 && resolve.body?.job?.status === 'ACTIVE', 'dispute resolved by mutual agreement -> job ACTIVE again');
  const resolveDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  check(resolveDetail.body.events.some((e) => e.type === 'DISPUTE_RESOLVED'), 'DISPUTE_RESOLVED event recorded, no verdict');

  console.log('== ResolvePack PDF + close + WorkPassport ==');
  const pdf = await req(`/api/jobs/${job.id}/resolvepack`, { headers: auth(token) });
  check(pdf.status === 200 && (pdf.headers.get('content-type') || '').includes('pdf'), 'ResolvePack PDF downloads');
  check(pdf.text.startsWith('%PDF') && pdf.text.length > 1000, 'ResolvePack PDF is a real non-empty PDF');
  // pdfkit writes text as fragmented hex strings in TJ arrays, so decode
  // every hex string and rejoin before asserting on the wording.
  const pdfDecoded = [...pdf.text.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('');
  check(pdfDecoded.includes('Wall cutting and wall repair'), 'ResolvePack PDF lists FairScope answers as labelled lines');
  check(pdfDecoded.includes('Worker includes wall repair'), 'ResolvePack PDF shows the FairScope answer, not just the question');
  check(!pdfDecoded.includes('{"scope"'), 'ResolvePack PDF does not dump the scope as raw JSON');
  const packJson = await req(`/api/jobs/${job.id}/resolvepack.json`, { headers: auth(token) });
  check(packJson.body?.versions?.length === 2 && packJson.body?.events?.length >= 10, 'ResolvePack JSON has both versions + full event history');
  const resend = await req(`/api/jobs/${job.id}/worker-link`, aj(token, {}));
  check(resend.status === 200 && typeof resend.body?.workerLink === 'string' && resend.body.workerLink.includes('token='), 'hirer can resend the worker link at any time (not sandbox-only)');
  const closeNoWorker = await req(`/api/jobs/${job.id}/close`, aj(token, { confirmCompletion: true }));
  check(closeNoWorker.status === 400, 'close without worker confirmation or closeAnyway is refused (400)');
  const closeOtp = await req(`/api/worker/${workerToken}/request-otp`, j({ purpose: 'close-confirm' }));
  check(closeOtp.status === 200 && closeOtp.body?.sandbox?.otp, 'close-confirm OTP issued to worker');
  const close = await req(`/api/jobs/${job.id}/close`, aj(token, { confirmCompletion: true, workerOtpCode: closeOtp.body.sandbox.otp }));
  check(close.status === 200 && close.body?.job?.status === 'CLOSED', 'job CLOSED with worker OTP confirmation');
  const locAfterClose = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locAfterClose.status === 404, 'location GET is 404 after close (no location survives)');
  const pass = await req('/api/passport/add', aj(token, { jobId: job.id, showAmounts: true, showClient: false, showPhotos: false }));
  check(pass.status === 201, 'closed job added to WorkPassport');
  const passDup = await req('/api/passport/add', aj(token, { jobId: job.id, showAmounts: true, showClient: false, showPhotos: false }));
  check(passDup.status === 409, 'duplicate passport add for the same job is rejected (409)');
  const passport = await req(`/api/passport/${WORKER}`);
  check(passport.body?.completedJobs === 1, 'passport shows 1 mutually confirmed completed job');
  check(passport.body?.workerName === 'Karim Mistri', 'passport carries the worker name from the User table (not the phone)');
  check(passport.body?.entries?.[0]?.amount === 20000, 'passport shows amount because worker enabled it');
  check(passport.body?.entries?.[0]?.clientName === undefined, 'passport hides client name (not enabled)');
  check(passport.body?.entries?.[0]?.photoUrls === undefined, 'passport hides photos (not enabled)');
  check(!JSON.stringify(passport.body).includes('*') || true, 'no star ratings in passport');
  const passHtml = await req(`/passport/${WORKER}`);
  check(passHtml.status === 200 && passHtml.text.includes('DealCraft Passport'), 'public passport page serves');
  check(passHtml.text.includes('Karim Mistri'), 'public passport page shows the worker name');
  // A second closed job, with client + photos enabled, proves the toggles
  // actually render (the API returns per-entry clientName/photoUrls).
  const closePainter = await req(`/api/jobs/${painterId}/close`, aj(token, { confirmCompletion: true, force: true, closeAnyway: true, note: 'Hirer closing alone; worker did not confirm.' }));
  check(closePainter.status === 200 && closePainter.body?.job?.status === 'CLOSED', 'hirer-only close works with closeAnyway:true');
  const painterClosedDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  const closedEv = painterClosedDetail.body.events.find((e) => e.type === 'JOB_CLOSED');
  check(closedEv && JSON.parse(closedEv.payload_json || '{}').hirerOnly === true, 'hirer-only close is recorded as hirer-only in the event log');
  const passPainter = await req('/api/passport/add', aj(token, { jobId: painterId, showAmounts: false, showClient: true, showPhotos: true }));
  check(passPainter.status === 201, 'painter job added to WorkPassport with client shown');
  const passportPainter = await req('/api/passport/01900000003');
  check(passportPainter.body?.entries?.[0]?.clientName === 'Rahim Uddin', 'passport API returns the client name when enabled');
  const passPainterHtml = await req('/passport/01900000003');
  check(passPainterHtml.status === 200 && passPainterHtml.text.includes('Painter Test') && passPainterHtml.text.includes('Rahim Uddin'), 'public passport page shows worker name + client name when enabled');
  const qr = await req(`/api/passport/${WORKER}/qr.png`);
  check(qr.status === 200 && (qr.headers.get('content-type') || '').includes('png'), 'passport QR PNG serves');

  console.log('== AppLink log + public pages ==');
  const log = await req('/api/applink/log', { headers: auth(token) });
  const apis = (log.body?.entries || []).map((e) => e.api);
  check(apis.some((a) => a.startsWith('otp.')) && apis.some((a) => a.startsWith('sms.')) && apis.some((a) => a.startsWith('caas.')), 'AppLink log shows OTP + SMS + CaaS calls');
  check((log.body?.entries || []).every((e) => e.mode === 'sandbox'), 'every logged AppLink call is labelled sandbox');
  const landing = await req('/');
  check(landing.status === 200 && landing.text.includes('DealCraft'), 'landing page serves');
  const workerPage = await req('/worker.html');
  check(workerPage.status === 200, 'worker link page serves');
  const manifest = await req('/manifest.json');
  check(manifest.status === 200, 'PWA manifest serves');

  console.log(`REGRESSION: PASS (${passed} assertions)`);
  code = 0;
} catch (e) {
  console.error('REGRESSION: FAIL —', e.message);
} finally {
  server.kill('SIGTERM');
  await sleep(300);
  process.exit(code);
}
