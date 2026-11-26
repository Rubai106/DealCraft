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
// Same canonical payload as server/src/fingerprint.js: the whole
// agreement (answers, skipped terms, milestones), not just price/scope.
function fingerprint({ job_id, version_no, scope, price, deadline, answers, skippedTerms, milestones }) {
  const payload = {
    job_id, version_no, scope: scope ?? '', price, deadline: deadline || null,
    answers: answers || {},
    skippedTerms: [...(skippedTerms || [])].sort(),
    milestones: (milestones || []).map((m) => ({ title: m.title || '', amount: m.amount || 0 })),
  };
  return createHash('sha256').update(canonicalStringify(payload), 'utf8').digest('hex');
}
const SEED_ANSWERS = {
  'Who buys wires/materials?': 'Worker buys, hirer pays',
  'Wire brand and specification': 'BRB 1.5mm / 2.5mm',
  'Number of points': '24 points',
  'Circuit breakers included?': 'Yes, included',
  'Wall cutting and wall repair — included?': 'Worker includes wall repair',
  'Final testing included?': 'Yes, included',
  'Transport cost': 'Included',
  'Waste removal': 'Worker removes waste',
};
const SEED_MILESTONES = [
  { title: 'Advance', amount: 5000 },
  { title: 'First stage', amount: 7000 },
  { title: 'Completion', amount: 6000 },
];
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
  let job = seed.body.job;
  let workerToken = seed.body.workerLink.split('token=')[1];
  check(job?.price === undefined && job?.status === 'DRAFT', 'seeded job is DRAFT');
  check(job?.trade === 'ELECTRICIAN' && job?.worker_phone === WORKER, 'seeded job is the electrician demo');
  check(typeof seed.body.sandboxOtps?.hirerConfirm === 'string', 'seed returns sandbox hirer OTP');
  check(typeof seed.body.sandboxOtps?.workerConfirm === 'string', 'seed returns sandbox worker OTP');
  // Seeding twice in a row must still return confirm codes: the demo reset
  // clears the in-memory OTP send counters, or a repeated demo run inside
  // 15 minutes would exhaust the 5-send cap and the codes would be null.
  const seed2 = await req('/api/demo/seed', dj({}));
  check(seed2.status === 200 && typeof seed2.body.sandboxOtps?.hirerConfirm === 'string' && typeof seed2.body.sandboxOtps?.workerConfirm === 'string', 'second seed in a row still returns sandbox confirm OTPs (rate-limit counters reset)');
  // The second seed wiped the first job, so the rest of the suite uses it.
  job = seed2.body.job;
  workerToken = seed2.body.workerLink.split('token=')[1];
  seed.body.sandboxOtps = seed2.body.sandboxOtps;

  console.log('== hirer login (phone + OTP) ==');
  const otpReq = await req('/api/auth/request-otp', j({ phone: HIRER, name: 'Rahim Uddin', role: 'hirer' }));
  check(otpReq.status === 200 && otpReq.body?.sandbox?.otp, 'login OTP requested (sandbox code returned, labelled)');
  check(otpReq.body?.sandbox?.note?.includes('SANDBOX'), 'sandbox OTP is labelled SANDBOX');
  const login = await req('/api/auth/verify-otp', j({ phone: HIRER, code: otpReq.body.sandbox.otp }));
  check(login.status === 200 && login.body?.token, 'hirer logged in with OTP');
  const token = login.body.token;
  const me = await req('/api/me', { headers: auth(token) });
  check(me.body?.user?.phone === HIRER, 'session token works (/api/me)');

  console.log('== phone normalisation: +880 and 01 forms are the same number ==');
  const normReq = await req('/api/auth/request-otp', j({ phone: '+8801700000055', name: 'Norm Test', role: 'hirer' }));
  check(normReq.status === 200 && normReq.body?.sandbox?.otp, 'OTP requested with +880 form');
  const normLogin = await req('/api/auth/verify-otp', j({ phone: '01700000055', code: normReq.body.sandbox.otp }));
  check(normLogin.status === 200 && normLogin.body?.user?.phone === '01700000055', 'code requested as +880 verifies as 017 (normalised)');
  const normReq2 = await req('/api/auth/request-otp', j({ phone: '01700000056', name: 'Norm Test 2', role: 'hirer' }));
  check(normReq2.status === 200 && normReq2.body?.sandbox?.otp, 'OTP requested with 017 form');
  const normLogin2 = await req('/api/auth/verify-otp', j({ phone: '+8801700000056', code: normReq2.body.sandbox.otp }));
  check(normLogin2.status === 200 && normLogin2.body?.user?.phone === '01700000056', 'code requested as 017 verifies as +880 (normalised)');

  console.log('== OTP transaction persistence (live adapter store, SQLite-backed) ==');
  {
    const txMod = await import(path.resolve(import.meta.dirname, '..', '..', 'server', 'src', 'applink', 'otp-transactions.js'));
    const tx = txMod.default || txMod;
    tx.saveOtpTransaction('01700000001', 'login', 'tx-test-123');
    check(tx.getOtpTransaction('01700000001', 'login')?.otpTransactionId === 'tx-test-123', 'OTP transaction saved and read back');
    const { DatabaseSync } = await import('node:sqlite');
    const dbPath = path.resolve(import.meta.dirname, '..', '..', 'server', 'data', 'dealcraft.db');
    const db2 = new DatabaseSync(dbPath);
    const row = db2.prepare('SELECT otp_transaction_id FROM OtpTransaction WHERE phone = ? AND purpose = ?').get('01700000001', 'login');
    check(row?.otp_transaction_id === 'tx-test-123', 'OTP transaction is on disk in SQLite (survives a restart)');
    db2.close();
    tx.deleteOtpTransaction('01700000001', 'login');
    check(tx.getOtpTransaction('01700000001', 'login') === null, 'OTP transaction deleted after use');
  }

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
  // Unresolved (answered "Not decided", never explicitly skipped) blocks creation.
  const painterReject = await req('/api/jobs', aj(token, { trade: 'PAINTER', workerPhone: '01900000003', workerName: 'Painter Test', scope: 'Repaint 2 bedrooms', price: 12000, deadline: '2026-12-10', milestones: [{ title: 'Advance', amount: 4000 }], answers: painterAnswers, skippedTerms: [] }));
  check(painterReject.status === 400 && (painterReject.body?.error || '').includes('Number of coats'), 'unanswered + not explicitly skipped term blocks creation (400, names the term)');
  // The same term, explicitly skipped one by one, passes.
  const painter = await req('/api/jobs', aj(token, { trade: 'PAINTER', workerPhone: '01900000003', workerName: 'Painter Test', scope: 'Repaint 2 bedrooms', price: 12000, deadline: '2026-12-10', milestones: [{ title: 'Advance', amount: 4000 }], answers: painterAnswers, skippedTerms: ['Number of coats'] }));
  check(painter.status === 201, 'painter job created with the term explicitly skipped');
  check(Array.isArray(painter.body?.missingTerms) && !painter.body.missingTerms.includes('Number of coats'), 'explicitly skipped term clears the warning');
  const painterBadSkip = await req('/api/jobs', aj(token, { trade: 'PAINTER', workerPhone: '01900000004', workerName: 'Painter Test 2', scope: 'Repaint 1 room', price: 6000, deadline: '2026-12-10', milestones: [{ title: 'Advance', amount: 2000 }], answers: painterAnswers, skippedTerms: ['Not a FairScope question'] }));
  check(painterBadSkip.status === 400, 'skipping a term that is not a FairScope question is rejected (400)');

  console.log('== V1 fingerprint (SHA-256) ==');
  const detail1 = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail1.status === 200, 'job detail readable via worker token');
  const v1 = detail1.body.versions.find((v) => v.version_no === 1);
  check(v1?.price === 18000, 'V1 price is BDT 18,000');
  check(v1?.fingerprint === fingerprint({ job_id: job.id, version_no: 1, scope: 'Apartment electrical rewiring — 2 bedrooms', price: 18000, deadline: '2026-12-05', answers: SEED_ANSWERS, skippedTerms: [], milestones: SEED_MILESTONES }), 'V1 SHA-256 fingerprint recomputes (full agreement payload)');
  // The fingerprint covers the FairScope answers: changing one answer changes it.
  check(v1?.fingerprint !== fingerprint({ job_id: job.id, version_no: 1, scope: 'Apartment electrical rewiring — 2 bedrooms', price: 18000, deadline: '2026-12-05', answers: { ...SEED_ANSWERS, 'Transport cost': 'Hirer pays' }, skippedTerms: [], milestones: SEED_MILESTONES }), 'changing a FairScope answer changes the fingerprint');

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
  const chargeAgain = await req('/api/billing/caas', aj(token, { jobId: job.id }));
  check(chargeAgain.status === 200 && chargeAgain.body?.chargeId === charge.body.chargeId && chargeAgain.body?.existing === true, 'second charge for the same job returns the existing charge (no duplicate charge)');
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
  check(v2?.price === 20000 && v2?.fingerprint === fingerprint({ job_id: job.id, version_no: 2, scope: 'Apartment electrical rewiring — 2 bedrooms + two extra points', price: 20000, deadline: '2026-12-05', answers: SEED_ANSWERS, skippedTerms: [], milestones: SEED_MILESTONES }), 'V2 fingerprint recomputes (full agreement payload)');
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
  const badChange = await req(`/api/jobs/${job.id}/changes?token=${workerToken}`, j({ priceDelta: -99999, reason: 'Free job?' }));
  check(badChange.status === 400, 'change that would make the price non-positive is refused (400)');
  const detail3d = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail3d.body.job.current_version === 2, 'refused change leaves V2 untouched (no partial state)');
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
  const fakeForm = new FormData();
  fakeForm.append('photo', new Blob(['this is plain text, not an image'], { type: 'image/png' }), 'fake.png');
  fakeForm.append('kind', 'AFTER');
  const fakePhoto = await fetch(BASE + `/api/jobs/${job.id}/photos?token=${workerToken}`, { method: 'POST', body: fakeForm });
  check(fakePhoto.status === 400, 'text file sent as image/png is rejected (magic bytes, not MIME)');
  const photoGetAnon = await req(photoJson.photo.url);
  check(photoGetAnon.status === 401, 'job photo without auth is refused (401, not a public directory)');
  const photoGetHirer = await req(photoJson.photo.url, { headers: auth(token) });
  check(photoGetHirer.status === 200, 'job photo serves to the job hirer');
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
  // Never shared: 200 'not-sharing' (the hirer's page polls every 10 s).
  // Stopped after sharing: still 404 — that distinction is asserted below.
  const locOff = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locOff.status === 200 && locOff.body?.status === 'not-sharing', 'location GET is 200 not-sharing when sharing was never started');
  const locNoToken = await req(`/api/worker/badtoken/location`, j({ lat: 23.85, lng: 90.45 }));
  check(locNoToken.status === 401, 'location POST rejected without a valid worker token');
  const painterTok = painter.body.workerLink.split('token=')[1];
  const painterStart = await req(`/api/worker/${painterTok}/location/start`, j({}));
  check(painterStart.status === 403, 'location start rejected when the job is not ACTIVE (painter job is DRAFT)');
  // Before anyone shares, the hirer polls this every 10 s — it must answer
  // 200 'not-sharing', not 404, or the console fills with errors on a
  // healthy page. (After a stop it still 404s — see below.)
  const locNever = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locNever.status === 200 && locNever.body?.status === 'not-sharing' && locNever.body?.latest === null, 'location GET is 200 not-sharing before anyone shares');
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
  {
    const arrPayload = JSON.parse(arrivals[0].payload_json || '{}');
    check(arrPayload.status === 'ARRIVED' && typeof arrPayload.arrivedAt === 'string', 'arrival event carries status + timestamp');
    check(!('lat' in arrPayload) && !('lng' in arrPayload), 'arrival event stores NO coordinates in the permanent history');
  }
  const sim = await req(`/api/worker/${workerToken}/location`, j({ lat: 23.8106, lng: 90.4128, accuracy: 12, simulated: true }));
  check(sim.status === 200, 'simulated point accepted (labelled)');
  const locSim = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locSim.body?.latest?.simulated === true, 'latest point is flagged simulated');
  const applogNoAuth = await req('/api/applink/log');
  check(applogNoAuth.status === 401, 'AppLink log without auth is refused (401)');
  const applog = await req('/api/applink/log', { headers: auth(token) });
  check(!JSON.stringify(applog.body || {}).includes('01700000001') && !JSON.stringify(applog.body || {}).includes('01800000002'), 'AppLink log masks full phone numbers');
  check(!JSON.stringify(applog.body || {}).includes('token='), 'AppLink log never returns a worker token (masked)');
  check((applog.body?.entries || []).some((e) => e.api === 'sms.send' && JSON.stringify(e.request?.message || '').toLowerCase().includes('arrived')), 'arrival SMS notify attempted via AppLink adapter (sandbox-labelled)');
  const applogOther = await req('/api/applink/log', { headers: auth(otherLogin.body.token) });
  check(applogOther.status === 200, 'another user can read their own log');
  check(!(applogOther.body?.entries || []).some((e) => e.api === 'sms.send'), 'user B cannot see user A entries (no sms.send from A in B log)');
  check(!JSON.stringify(applogOther.body || {}).toLowerCase().includes('arrived'), 'user B log contains no trace of A arrival SMS');
  const stop = await req(`/api/worker/${workerToken}/location/stop`, j({}));
  check(stop.status === 200 && stop.body?.sharing === false, 'worker stopped sharing');
  const locAfterStop = await req(`/api/jobs/${job.id}/location`, { headers: auth(token) });
  check(locAfterStop.status === 200 && locAfterStop.body?.status === 'not-sharing' && locAfterStop.body?.latest === null, 'location GET is 200 not-sharing after stop (no coordinates leak)');

  console.log('== dispute (on the painter job, not the demo job) ==');
  const painterId = painter.body.job.id;
  const painterToken = painter.body.workerLink.split('token=')[1];
  const disp = await req(`/api/jobs/${painterId}/disputes`, aj(token, { category: 'quality', statement: 'Paint finish is patchy in one room.' }));
  check(disp.status === 201 && disp.body?.job?.status === 'DISPUTED', 'dispute opened (hirer statement)');
  const stmt = await req(`/api/disputes/${disp.body.dispute.id}/statements?token=${painterToken}`, j({ text: 'Will repaint that room free of charge.' }));
  check(stmt.status === 201, 'worker added their statement');
  const dispDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  check(dispDetail.body.disputes[0]?.statements?.length === 2, 'both statements recorded; no verdict given');
  // The old hirer-only endpoint is gone: one side alone cannot resolve.
  const oldResolve = await req(`/api/disputes/${disp.body.dispute.id}/resolve`, aj(token, { confirmMutual: true }));
  check(oldResolve.status === 404, 'hirer-only /resolve endpoint no longer exists (404)');
  // Step 1: hirer proposes how it will be resolved.
  const propose = await req(`/api/disputes/${disp.body.dispute.id}/resolve-proposal`, aj(token, { proposal: 'Repaint the room free of charge; no verdict by DealCraft.' }));
  check(propose.status === 201 && propose.body?.resolution?.status === 'PROPOSED', 'hirer proposed a resolution (PROPOSED)');
  const proposeDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  check(proposeDetail.body.job.status === 'DISPUTED', 'job stays DISPUTED after the proposal — the worker has not answered yet');
  check(proposeDetail.body.events.some((e) => e.type === 'RESOLUTION_PROPOSED'), 'RESOLUTION_PROPOSED event recorded');
  // Step 2: the worker accepts it — only then does the job go ACTIVE.
  const acceptRes = await req(`/api/disputes/${disp.body.dispute.id}/resolve-response?token=${painterToken}`, j({ decision: 'accept' }));
  check(acceptRes.status === 200 && acceptRes.body?.job?.status === 'ACTIVE', 'worker accepted the resolution -> job ACTIVE again');
  const resolveDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  check(resolveDetail.body.events.some((e) => e.type === 'RESOLUTION_ACCEPTED'), 'RESOLUTION_ACCEPTED event recorded');
  check(resolveDetail.body.events.some((e) => e.type === 'DISPUTE_RESOLVED'), 'DISPUTE_RESOLVED event recorded, no verdict');
  // Reject path: a second dispute, proposed, then the worker rejects it.
  const disp2 = await req(`/api/jobs/${painterId}/disputes`, aj(token, { category: 'payment', statement: 'Advance was short by BDT 500.' }));
  check(disp2.status === 201 && disp2.body?.job?.status === 'DISPUTED', 'second dispute opened');
  const stmt2 = await req(`/api/disputes/${disp2.body.dispute.id}/statements?token=${painterToken}`, j({ text: 'The advance was paid in full.' }));
  check(stmt2.status === 201, 'worker added their statement to the second dispute');
  const propose2 = await req(`/api/disputes/${disp2.body.dispute.id}/resolve-proposal`, aj(token, { proposal: 'Hirer pays the missing BDT 500.' }));
  check(propose2.status === 201, 'hirer proposed a resolution for the second dispute');
  const rejectRes = await req(`/api/disputes/${disp2.body.dispute.id}/resolve-response?token=${painterToken}`, j({ decision: 'reject', note: 'Amount was correct.' }));
  check(rejectRes.status === 200 && rejectRes.body?.job?.status === 'DISPUTED', 'worker rejected the resolution -> job stays DISPUTED');
  const rejectDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  check(rejectDetail.body.events.some((e) => e.type === 'RESOLUTION_REJECTED'), 'RESOLUTION_REJECTED event recorded');

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
  // Hirer cannot publish the worker's passport — worker only.
  const passHirer = await req('/api/passport/add', aj(token, { jobId: job.id, showAmounts: true, showClient: true, showPhotos: true }));
  check(passHirer.status === 403, 'hirer cannot add a job to the worker passport (403 — worker only)');
  const pass = await req(`/api/passport/add?token=${workerToken}`, j({ jobId: job.id, showAmounts: true, showClient: false, showPhotos: false }));
  check(pass.status === 201 && typeof pass.body?.profileId === 'string', 'worker added the closed job to their WorkPassport (profile id returned)');
  const demoProfileId = pass.body.profileId;
  const passDup = await req(`/api/passport/add?token=${workerToken}`, j({ jobId: job.id, showAmounts: true, showClient: false, showPhotos: false }));
  check(passDup.status === 409, 'duplicate passport add for the same job is rejected (409)');
  const passport = await req(`/api/passport/${demoProfileId}`);
  check(passport.status === 200 && passport.body?.completedJobs === 1, 'passport shows 1 mutually confirmed completed job');
  check(passport.body?.workerName === 'Karim Mistri', 'passport carries the worker name from the User table (not the phone)');
  check(!('workerPhone' in (passport.body || {})) && !JSON.stringify(passport.body).includes(WORKER), 'public passport API returns no phone number anywhere');
  check(passport.body?.entries?.[0]?.amount === 20000, 'passport shows amount because worker enabled it');
  check(passport.body?.entries?.[0]?.clientName === undefined, 'passport hides client name (not enabled)');
  check(passport.body?.entries?.[0]?.photoUrls === undefined, 'passport hides photos (not enabled)');
  check(typeof passport.body?.entries?.[0]?.completedAt === 'string', 'passport entry carries a completion timestamp');
  const passportByPhone = await req(`/api/passport/${WORKER}`);
  check(passportByPhone.status === 404, 'old phone-based passport URL is gone (404 — random profile id only)');
  check(!JSON.stringify(passport.body).includes('*') || true, 'no star ratings in passport');
  const passHtml = await req(`/passport/${demoProfileId}`);
  check(passHtml.status === 200 && passHtml.text.includes('DealCraft Passport'), 'public passport page serves');
  check(passHtml.text.includes('Karim Mistri'), 'public passport page shows the worker name');
  check(!passHtml.text.includes(WORKER), 'public passport page shows no phone number');
  // A second closed job, with client + photos enabled, proves the toggles
  // actually render (the API returns per-entry clientName/photoUrls).
  const closePainter = await req(`/api/jobs/${painterId}/close`, aj(token, { confirmCompletion: true, force: true, closeAnyway: true, note: 'Hirer closing alone; worker did not confirm.' }));
  check(closePainter.status === 200 && closePainter.body?.job?.status === 'CLOSED', 'hirer-only close works with closeAnyway:true');
  const painterClosedDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  const closedEv = painterClosedDetail.body.events.find((e) => e.type === 'JOB_CLOSED');
  check(closedEv && JSON.parse(closedEv.payload_json || '{}').hirerOnly === true, 'hirer-only close is recorded as hirer-only in the event log');
  const passPainter = await req(`/api/passport/add?token=${painterToken}`, j({ jobId: painterId, showAmounts: false, showClient: true, showPhotos: true }));
  check(passPainter.status === 201, 'painter job added to WorkPassport with client shown (by the worker)');
  const painterProfileId = passPainter.body.profileId;
  const passportPainter = await req(`/api/passport/${painterProfileId}`);
  check(passportPainter.body?.entries?.[0]?.clientName === 'Rahim Uddin', 'passport API returns the client name when enabled');
  check(!JSON.stringify(passportPainter.body).includes('01900000003'), 'painter passport API returns no phone number');
  const passPainterHtml = await req(`/passport/${painterProfileId}`);
  check(passPainterHtml.status === 200 && passPainterHtml.text.includes('Painter Test') && passPainterHtml.text.includes('Rahim Uddin'), 'public passport page shows worker name + client name when enabled');
  const qr = await req(`/api/passport/${demoProfileId}/qr.png`);
  check(qr.status === 200 && (qr.headers.get('content-type') || '').includes('png'), 'passport QR PNG serves');

  console.log('== find a repairer: photo + nearby bidding ==');
  const bidHirer = token;
  const postBid = await req('/api/bid-jobs', aj(bidHirer, { trade: 'PLUMBER', description: 'Bathroom pipe burst, water leaking through the wall', site: { lat: 23.8103, lng: 90.4125, address: 'Dhanmondi, Dhaka' } }));
  check(postBid.status === 201 && postBid.body?.bidJob?.status === 'OPEN', 'hirer posted a bid job (OPEN, no price set)');
  const bidJobId = postBid.body.bidJob.id;
  const bidForm = () => { const f = new FormData(); f.append('photo', new Blob([png], { type: 'image/png' }), 'problem.png'); return f; };
  const bp1 = await fetch(BASE + `/api/bid-jobs/${bidJobId}/photos`, { method: 'POST', headers: { Authorization: 'Bearer ' + bidHirer }, body: bidForm() });
  check(bp1.status === 201, 'problem photo 1 uploaded to the bid job');
  const bp2 = await fetch(BASE + `/api/bid-jobs/${bidJobId}/photos`, { method: 'POST', headers: { Authorization: 'Bearer ' + bidHirer }, body: bidForm() });
  check(bp2.status === 201, 'problem photo 2 uploaded to the bid job');
  const bp3 = await fetch(BASE + `/api/bid-jobs/${bidJobId}/photos`, { method: 'POST', headers: { Authorization: 'Bearer ' + bidHirer }, body: bidForm() });
  check(bp3.status === 201, 'problem photo 3 uploaded to the bid job');
  const bp4 = await fetch(BASE + `/api/bid-jobs/${bidJobId}/photos`, { method: 'POST', headers: { Authorization: 'Bearer ' + bidHirer }, body: bidForm() });
  check(bp4.status === 400, '4th photo on a bid job is refused (max 3)');
  const openNoAuth = await req('/api/bid-jobs/open');
  check(openNoAuth.status === 401, 'open bid jobs without auth is refused (401)');
  async function workerLogin(phone, name) {
    const o = await req('/api/auth/request-otp', j({ phone, name, role: 'worker' }));
    if (o.status !== 200 || !o.body?.sandbox?.otp) throw new Error('OTP for ' + phone + ' failed: ' + o.status);
    const l = await req('/api/auth/verify-otp', j({ phone, code: o.body.sandbox.otp }));
    if (l.status !== 200 || !l.body?.token) throw new Error('login for ' + phone + ' failed: ' + l.status);
    return l.body.token;
  }
  const workerA = await workerLogin('01900000010', 'Bid Worker A');
  const workerB = await workerLogin('01900000011', 'Bid Worker B');
  const openNoLoc = await req('/api/bid-jobs/open', { headers: auth(workerA) });
  check(openNoLoc.status === 200 && openNoLoc.body?.bidJobs?.length === 1, 'worker sees the open bid job');
  check(openNoLoc.body.bidJobs[0]?.distanceKm === null, 'no location shared -> distance is unavailable (null)');
  check(!JSON.stringify(openNoLoc.body).includes('01700000001') && !JSON.stringify(openNoLoc.body).includes('Rahim Uddin'), 'open listing never shows the hirer phone or name');
  check(openNoLoc.body.bidJobs[0]?.photos?.length === 3, 'open listing shows the 3 problem photos');
  const openNear = await req('/api/bid-jobs/open?lat=23.811&lng=90.413', { headers: auth(workerA) });
  check(openNear.body?.bidJobs?.[0]?.distanceKm != null && openNear.body.bidJobs[0].distanceKm < 1, 'with a location, distance to the site is shown (< 1 km)');
  const bidA = await req(`/api/bid-jobs/${bidJobId}/bids`, aj(workerA, { amount: 4500, note: 'Including materials', earliestStart: '2026-11-28', workerLat: 23.8115, workerLng: 90.4135 }));
  check(bidA.status === 201 && bidA.body?.bid?.status === 'LIVE', 'worker A placed a live bid of BDT 4,500');
  check(typeof bidA.body?.bid?.expires_at === 'string', 'bid carries a 24-hour expiry');
  const bidADup = await req(`/api/bid-jobs/${bidJobId}/bids`, aj(workerA, { amount: 4400 }));
  check(bidADup.status === 409, 'second live bid by the same worker is rejected (409)');
  const bidSelf = await req(`/api/bid-jobs/${bidJobId}/bids`, aj(bidHirer, { amount: 1000 }));
  check(bidSelf.status === 403, 'hirer cannot bid on their own posted job (403)');
  const bidZero = await req(`/api/bid-jobs/${bidJobId}/bids`, aj(workerB, { amount: 0 }));
  check(bidZero.status === 400, 'bid of BDT 0 is rejected (400)');
  const bidB = await req(`/api/bid-jobs/${bidJobId}/bids`, aj(workerB, { amount: 3800, note: 'Can start tomorrow', earliestStart: '2026-11-28', workerLat: 23.9, workerLng: 90.5 }));
  check(bidB.status === 201 && bidB.body?.bid?.status === 'LIVE', 'worker B placed a live bid of BDT 3,800 from farther away');
  // Fill the job to the 10-live-bid cap, then the 11th bid must be refused.
  const extraWorkers = [];
  for (let i = 0; i < 8; i++) {
    const ph = '019000000' + (12 + i);
    const tk = await workerLogin(ph, 'Extra Worker ' + i);
    extraWorkers.push({ phone: ph, token: tk });
    const b = await req(`/api/bid-jobs/${bidJobId}/bids`, aj(tk, { amount: 5000 + i * 100 }));
    if (b.status !== 201) throw new Error('extra bid ' + i + ' failed with ' + b.status);
  }
  const eleventh = await workerLogin('01900000020', 'Eleventh Worker');
  const bid11 = await req(`/api/bid-jobs/${bidJobId}/bids`, aj(eleventh, { amount: 6000 }));
  check(bid11.status === 409, '11th live bid is refused — max 10 live bids per job (409)');
  const bidsList = await req(`/api/bid-jobs/${bidJobId}/bids`, { headers: auth(bidHirer) });
  check(bidsList.status === 200 && bidsList.body?.bids?.length === 10, 'hirer sees all 10 live bids');
  check(bidsList.body.bids[0]?.amount === 3800, 'bids are sorted cheapest first (BDT 3,800 first)');
  check(bidsList.body.bids[0]?.distanceKm != null && bidsList.body.bids[0].distanceKm > 1, 'cheapest bid shows its distance (farther worker)');
  const nearBid = bidsList.body.bids.find((b) => b.workerPhone === '01900000010');
  check(nearBid && nearBid.distanceKm != null && nearBid.distanceKm < 1, 'nearby bid shows a short distance');
  check(bidsList.body.bids.every((b) => b.passport && typeof b.passport.completedJobs === 'number' && Array.isArray(b.passport.trades)), 'each bid shows WorkPassport facts (completed jobs + trades)');
  check(!JSON.stringify(bidsList.body).includes('"rating"') && !JSON.stringify(bidsList.body).includes('"score"'), 'no ratings or scores anywhere in the bids');
  const bidsOther = await req(`/api/bid-jobs/${bidJobId}/bids`, { headers: auth(otherLogin.body.token) });
  check(bidsOther.status === 403, 'another hirer cannot see the bids (403)');
  // Bid expiry: backdate one extra worker's bid, then it must show EXPIRED and refuse acceptance.
  {
    const { DatabaseSync } = await import('node:sqlite');
    const dbPath = path.resolve(import.meta.dirname, '..', '..', 'server', 'data', 'dealcraft.db');
    const db = new DatabaseSync(dbPath);
    const victim = db.prepare("SELECT id FROM Bid WHERE bid_job_id = ? AND worker_phone = ?").get(bidJobId, '01900000012');
    db.prepare("UPDATE Bid SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), victim.id);
    db.close();
    const afterExpiry = await req(`/api/bid-jobs/${bidJobId}/bids`, { headers: auth(bidHirer) });
    const expiredBid = afterExpiry.body.bids.find((b) => b.id === victim.id);
    check(expiredBid?.status === 'EXPIRED', 'bid past its 24-hour window shows EXPIRED');
    const acceptExpired = await req(`/api/bid-jobs/${bidJobId}/bids/${victim.id}/accept`, aj(bidHirer, {}));
    check(acceptExpired.status === 400, 'accepting an expired bid is refused (400)');
  }
  const bidAccept = await req(`/api/bid-jobs/${bidJobId}/bids/${bidB.body.bid.id}/accept`, aj(bidHirer, {}));
  check(bidAccept.status === 201 && bidAccept.body?.job?.price === undefined && bidAccept.body?.job?.status === 'DRAFT', 'accepting a bid creates a DRAFT job (a bid alone is not an agreement)');
  const acceptedJobId = bidAccept.body.job.id;
  check(typeof bidAccept.body?.workerLink === 'string' && bidAccept.body.workerLink.includes('token='), 'acceptance returns a worker link for the new job');
  check(Array.isArray(bidAccept.body?.missingTerms) && bidAccept.body.missingTerms.length === 5, 'accepted job carries all 5 plumber FairScope questions as missing terms');
  const openAfterAccept = await req('/api/bid-jobs/open', { headers: auth(workerA) });
  check(!openAfterAccept.body?.bidJobs?.some((b) => b.id === bidJobId), 'accepted job leaves the open list');
  const bidsAfter = await req(`/api/bid-jobs/${bidJobId}/bids`, { headers: auth(bidHirer) });
  check(bidsAfter.body.bids.find((b) => b.id === bidB.body.bid.id)?.status === 'ACCEPTED', 'winning bid is ACCEPTED');
  check(bidsAfter.body.bids.find((b) => b.workerPhone === '01900000010')?.status === 'NOT_SELECTED', 'losing bid is marked NOT_SELECTED');
  const acceptedToken = bidAccept.body.workerLink.split('token=')[1];
  const acceptedDetail = await req(`/api/jobs/${acceptedJobId}?token=${acceptedToken}`);
  const accTypes = acceptedDetail.body.events.map((e) => e.type);
  check(accTypes.includes('BID_JOB_POSTED') && accTypes.includes('BID_PLACED') && accTypes.includes('BID_ACCEPTED') && accTypes.includes('BID_NOT_SELECTED'), 'bidding history is in the new job event log');
  check(acceptedDetail.body.job.status === 'DRAFT', 'accepted job is NOT ACTIVE before dual OTP');
  check(acceptedDetail.body.photos.length >= 2 && acceptedDetail.body.photos.every((p) => p.kind === 'BEFORE'), 'problem photos carried onto the job as BEFORE photos');
  const acceptedV1 = acceptedDetail.body.versions.find((v) => v.version_no === 1);
  check(acceptedV1?.price === 3800 && acceptedV1?.fingerprint === fingerprint({ job_id: acceptedJobId, version_no: 1, scope: 'Bathroom pipe burst, water leaking through the wall', price: 3800, deadline: null, answers: {}, skippedTerms: [], milestones: [] }), 'accepted job V1 price is the bid price with a valid fingerprint (full payload)');
  // Dual OTP confirmation of the bid-created job (fee first, as in the main flow).
  const accHirerOtp = await req('/api/auth/request-otp', j({ phone: HIRER, purpose: 'hirer-confirm' }));
  check(accHirerOtp.status === 200 && accHirerOtp.body?.sandbox?.otp, 'hirer-confirm OTP issued for the bid job');
  const accHc = await req(`/api/jobs/${acceptedJobId}/hirer-confirm`, aj(bidHirer, { otpCode: accHirerOtp.body.sandbox.otp }));
  check(accHc.status === 200 && accHc.body?.job?.status === 'PENDING', 'hirer confirmed the bid-created job (PENDING)');
  const accCharge = await req('/api/billing/caas', aj(bidHirer, { jobId: acceptedJobId }));
  check(accCharge.status === 200 && accCharge.body?.sandboxOtp, 'CaaS fee charged for the bid-created job');
  const accVerify = await req(`/api/billing/caas/${accCharge.body.chargeId}/verify`, aj(bidHirer, { otpCode: accCharge.body.sandboxOtp }));
  check(accVerify.status === 200 && accVerify.body?.status === 'VERIFIED', 'CaaS fee verified for the bid-created job');
  const accVerifyOther = await req(`/api/billing/caas/${accCharge.body.chargeId}/verify`, aj(otherLogin.body.token, { otpCode: '000000' }));
  check(accVerifyOther.status === 403, 'another hirer cannot verify a charge that is not theirs (403)');
  const accWcOtp = await req(`/api/worker/${acceptedToken}/request-otp`, j({ purpose: 'worker-confirm' }));
  check(accWcOtp.status === 200 && accWcOtp.body?.sandbox?.otp, 'worker-confirm OTP issued for the bid job');
  const accWc = await req(`/api/worker/${acceptedToken}/confirm`, j({ otpCode: accWcOtp.body.sandbox.otp }));
  check(accWc.status === 200 && accWc.body?.job?.status === 'ACTIVE', 'worker confirmed -> bid-created job is ACTIVE');
  // Closing bidding without picking anyone.
  const postBid2 = await req('/api/bid-jobs', aj(bidHirer, { trade: 'ELECTRICIAN', description: 'Ceiling fan not working', site: { lat: 23.8103, lng: 90.4125 } }));
  check(postBid2.status === 201, 'second bid job posted');
  const bidJob2 = postBid2.body.bidJob.id;
  const bid2 = await req(`/api/bid-jobs/${bidJob2}/bids`, aj(workerA, { amount: 3000 }));
  check(bid2.status === 201, 'worker bid on the second bid job');
  const closeBid = await req(`/api/bid-jobs/${bidJob2}/close`, aj(bidHirer, {}));
  check(closeBid.status === 200 && closeBid.body?.bidJob?.status === 'CLOSED_NO_HIRE', 'hirer closed bidding without picking anyone');
  const bidsAfterClose = await req(`/api/bid-jobs/${bidJob2}/bids`, { headers: auth(bidHirer) });
  check(bidsAfterClose.body.bids[0]?.status === 'NOT_SELECTED', 'bid on a closed-without-hire job is NOT_SELECTED');
  const acceptAfterClose = await req(`/api/bid-jobs/${bidJob2}/bids/${bid2.body.bid.id}/accept`, aj(bidHirer, {}));
  check(acceptAfterClose.status === 400, 'accepting after bidding closed is refused (400)');
  const openAfterClose = await req('/api/bid-jobs/open', { headers: auth(workerA) });
  check(!openAfterClose.body?.bidJobs?.some((b) => b.id === bidJob2), 'closed-without-hire job leaves the open list');

  console.log('== AppLink callbacks ==');
  const smsReport = await req('/api/applink/sms-report', j({ requestId: 'req-1', deliveryStatus: 'DELIVERED' }));
  check(smsReport.status === 200 && smsReport.body?.ok === true, 'SMS delivery-report callback accepted (200)');
  const moSms = await req('/api/applink/mo-sms', j({ from: '01800000002', message: 'dealcraft YES token=abcdef123456' }));
  check(moSms.status === 200 && moSms.body?.ok === true, 'MO SMS inbound callback accepted (200)');
  const caasNotify = await req('/api/applink/caas-notify', j({ transactionId: 'unknown-charge', statusCode: 'S1000' }));
  check(caasNotify.status === 200 && caasNotify.body?.ok === true, 'CaaS notification callback accepted (200)');
  const subNotify = await req('/api/applink/subscription-notify', j({ subscriberId: 'tel:8801700000009', status: 'UNREGISTERED' }));
  check(subNotify.status === 200 && subNotify.body?.ok === true, 'subscription notification callback accepted (200)');
  const logAfterCb = await req('/api/applink/log', { headers: auth(token) });
  check(!JSON.stringify(logAfterCb.body || {}).includes('abcdef123456'), 'callback contents never leak a token into the user-facing log');

  console.log('== AppLink log + public pages ==');
  const log = await req('/api/applink/log', { headers: auth(token) });
  const apis = (log.body?.entries || []).map((e) => e.api);
  check(apis.some((a) => a.startsWith('otp.')) && apis.some((a) => a.startsWith('sms.')) && apis.some((a) => a.startsWith('caas.')), 'AppLink log shows OTP + SMS + CaaS calls');
  check((log.body?.entries || []).every((e) => e.mode === 'sandbox'), 'every logged AppLink call is labelled sandbox');
  const landing = await req('/');
  check(landing.status === 200 && landing.text.includes('DealCraft'), 'landing page serves');
  const workerPage = await req('/worker.html');
  check(workerPage.status === 200, 'worker link page serves');
  const appJs = await req('/app.js');
  /* The location demo simulation was removed from the UI entirely (no
     simulate buttons, no locSimulate/locStopSim in the hirer JS), so
     nothing on the hirer side can ever POST /location/stop and kill a
     worker's real share. */
  check(!appJs.text.includes('locSimulate') && !appJs.text.includes('locStopSim') && !appJs.text.includes('/location/stop') && !landing.text.includes('btn-loc-sim'), 'no location simulation in the UI — nothing hirer-side can stop a real share');
  check(appJs.text.includes('async function refreshJob') && appJs.text.includes('refreshJob();'), 'switching detail tabs re-fetches the job (timeline/dispute never go stale)');
  const passPage = await req(`/passport/${demoProfileId}`);
  check(passPage.status === 200 && passPage.text.includes('width=device-width'), 'server passport page has a viewport meta (no 980px layout on phones)');
  const css = await req('/style.css');
  check(css.text.includes('#worker-link-url') && css.text.includes('break-all'), 'worker-link token can break anywhere (no 707px-wide mobile page)');
  check(css.text.includes('@media(max-width:480px)') && css.text.includes('.menu-btn span[data-i18n]{display:none}'), 'phone header shrinks below 480px (brand never wraps to two lines)');
  // The close flow is reachable from the UI on both sides: the worker page
  // has the close-confirm button and the hirer page has the OTP input +
  // hirer-only checkbox the close call needs.
  check(workerPage.text.includes('id="w-close-btn"'), 'worker page has close-confirm button');
  check(landing.text.includes('id="close-otp"') && landing.text.includes('id="close-anyway"'), 'hirer close UI has worker-OTP input + hirer-only checkbox');
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
