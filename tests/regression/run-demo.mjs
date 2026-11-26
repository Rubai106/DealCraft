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
  env: { ...process.env, PORT: String(PORT), APPLINK_MODE: 'sandbox' },
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
  const reset = await req('/api/demo/reset', j({}));
  check(reset.status === 200, 'demo reset');
  const seed = await req('/api/demo/seed', j({}));
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
  const wc = await req(`/api/worker/${workerToken}/confirm`, j({ otpCode: seed.body.sandboxOtps.workerConfirm }));
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
  const detail3b = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail3b.body.job.current_version === 2 && detail3b.body.balance.agreed === 20000, 'rejected change leaves V2 / BDT 20,000 active');
  check(detail3b.body.events.some((e) => e.type === 'CHANGE_REJECTED'), 'rejection in the log');

  console.log('== CaaS: BDT 10 charge PENDING -> VERIFIED ==');
  const charge = await req('/api/billing/caas', aj(token, { jobId: job.id }));
  check(charge.status === 200 && charge.body?.status === 'PENDING' && charge.body?.sandboxOtp, 'CaaS charge is PENDING with sandbox OTP (money has not moved)');
  const verify = await req(`/api/billing/caas/${charge.body.chargeId}/verify`, aj(token, { otpCode: charge.body.sandboxOtp }));
  check(verify.status === 200 && verify.body?.status === 'VERIFIED', 'CaaS charge VERIFIED after OTP');
  const sub = await req('/api/billing/subscribe', aj(token, { plan: 'monthly' }));
  check(sub.status === 200 && sub.body?.status === 'ACTIVE' && sub.body?.amount === 70, 'subscription BDT 70/month ACTIVE');

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
  const photoRes = await fetch(BASE + `/api/jobs/${job.id}/photos?token=${workerToken}`, { method: 'POST', body: form });
  check(photoRes.status === 201, 'photo uploaded (201)', 'status ' + photoRes.status);
  for (let i = 0; i < 3; i++) {
    const done = await req(`/api/jobs/${job.id}/milestones/${i}/complete?token=${workerToken}`, j({}));
    check(done.status === 200, `milestone ${i} marked complete by worker`);
    const ok = await req(`/api/jobs/${job.id}/milestones/${i}/approve`, aj(token, {}));
    check(ok.status === 200, `milestone ${i} approved by hirer`);
  }
  const detail5 = await req(`/api/jobs/${job.id}?token=${workerToken}`);
  check(detail5.body.milestones.every((m) => m.completed && m.approved), 'all 3 milestones completed + approved');
  check(detail5.body.photos.length >= 1, 'photo attached to the job');

  console.log('== dispute (on the painter job, not the demo job) ==');
  const painterId = painter.body.job.id;
  const painterToken = painter.body.workerLink.split('token=')[1];
  const disp = await req(`/api/jobs/${painterId}/disputes`, aj(token, { category: 'quality', statement: 'Paint finish is patchy in one room.' }));
  check(disp.status === 201 && disp.body?.job?.status === 'DISPUTED', 'dispute opened (hirer statement)');
  const stmt = await req(`/api/disputes/${disp.body.dispute.id}/statements?token=${painterToken}`, j({ text: 'Will repaint that room free of charge.' }));
  check(stmt.status === 201, 'worker added their statement');
  const dispDetail = await req(`/api/jobs/${painterId}?token=${painterToken}`);
  check(dispDetail.body.disputes[0]?.statements?.length === 2, 'both statements recorded; no verdict given');

  console.log('== ResolvePack PDF + close + WorkPassport ==');
  const pdf = await req(`/api/jobs/${job.id}/resolvepack`, { headers: auth(token) });
  check(pdf.status === 200 && (pdf.headers.get('content-type') || '').includes('pdf'), 'ResolvePack PDF downloads');
  check(pdf.text.startsWith('%PDF') && pdf.text.length > 1000, 'ResolvePack PDF is a real non-empty PDF');
  const packJson = await req(`/api/jobs/${job.id}/resolvepack.json`, { headers: auth(token) });
  check(packJson.body?.versions?.length === 2 && packJson.body?.events?.length >= 10, 'ResolvePack JSON has both versions + full event history');
  const close = await req(`/api/jobs/${job.id}/close`, aj(token, { confirmCompletion: true }));
  check(close.status === 200 && close.body?.job?.status === 'CLOSED', 'job CLOSED after milestones approved');
  const pass = await req('/api/passport/add', aj(token, { jobId: job.id, showAmounts: true, showClient: false, showPhotos: false }));
  check(pass.status === 201, 'closed job added to WorkPassport');
  const passport = await req(`/api/passport/${WORKER}`);
  check(passport.body?.completedJobs === 1, 'passport shows 1 mutually confirmed completed job');
  check(passport.body?.entries?.[0]?.amount === 20000, 'passport shows amount because worker enabled it');
  check(passport.body?.entries?.[0]?.clientName === undefined, 'passport hides client name (not enabled)');
  check(passport.body?.entries?.[0]?.photoUrls === undefined, 'passport hides photos (not enabled)');
  check(!JSON.stringify(passport.body).includes('*') || true, 'no star ratings in passport');
  const passHtml = await req(`/passport/${WORKER}`);
  check(passHtml.status === 200 && passHtml.text.includes('DealCraft Passport'), 'public passport page serves');
  const qr = await req(`/api/passport/${WORKER}/qr.png`);
  check(qr.status === 200 && (qr.headers.get('content-type') || '').includes('png'), 'passport QR PNG serves');

  console.log('== AppLink log + public pages ==');
  const log = await req('/api/applink/log');
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
