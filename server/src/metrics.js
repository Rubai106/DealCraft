// DealCraft — internal metrics (ceiling pass item 15).
// Real numbers from the real SQLite tables; nothing is fabricated and an
// empty database reports honest zeros (every rate guards its divisor).
// Definitions, so the proposal can quote them without ambiguity:
//   totalRecords          every Job row ever created (all statuses).
//   confirmed             jobs that reached mutual confirmation — status
//                         ACTIVE, CLOSED or DISPUTED (a DISPUTED or
//                         CLOSED job was ACTIVE first).
//   activationRate        confirmed / totalRecords, percent.
//   changeLockJobs / Rate  jobs with >= 1 APPROVED ChangeProposal.
//   disputeJobs / Rate    jobs with >= 1 Dispute row.
//   passportQualified     CLOSED jobs whose close was mutual: the first
//                         JOB_CLOSED event has no hirerOnly flag. (A
//                         hirer-only close does not qualify — same rule
//                         as /api/passport/add.)
//   summarySms* / avgSegmentsPerRecord
//                         from SmsLog (kind 'summary'): segments actually
//                         sent on activation, per record —
//                         SUM(segments) / COUNT(DISTINCT job_id), counting
//                         BOTH recipients' messages (one summary goes to
//                         each party: today 3 segments x 2 = 6 per record;
//                         the item-14 short text would make it 2 x 2 = 4).
//                         avgSegmentsPerRecord is the unit-economics
//                         number for the summary SMS (item 14).
const { db } = require('./db');
const { getMode } = require('./applink');

function rateOf(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function computeMetrics() {
  const totalRecords = db.prepare('SELECT COUNT(*) AS n FROM Job').get().n;
  const confirmed = db.prepare(
    "SELECT COUNT(*) AS n FROM Job WHERE status IN ('ACTIVE','CLOSED','DISPUTED')"
  ).get().n;
  const changeLockJobs = db.prepare(
    "SELECT COUNT(DISTINCT job_id) AS n FROM ChangeProposal WHERE status = 'APPROVED'"
  ).get().n;
  const disputeJobs = db.prepare(
    'SELECT COUNT(DISTINCT job_id) AS n FROM Dispute'
  ).get().n;
  let passportQualified = 0;
  const closedJobs = db.prepare("SELECT id FROM Job WHERE status = 'CLOSED'").all();
  for (const { id } of closedJobs) {
    const ev = db.prepare(
      "SELECT payload_json FROM Event WHERE job_id = ? AND type = 'JOB_CLOSED' ORDER BY id ASC LIMIT 1"
    ).get(id);
    let hirerOnly = false;
    try { hirerOnly = JSON.parse(ev ? ev.payload_json || '{}' : '{}').hirerOnly === true; } catch (_e) {}
    if (!hirerOnly) passportQualified++;
  }
  const sms = db.prepare(
    "SELECT COUNT(*) AS messages, COUNT(DISTINCT job_id) AS records, COALESCE(SUM(segments), 0) AS segments FROM SmsLog WHERE kind = 'summary'"
  ).get();
  const avgSegmentsPerRecord = sms.records > 0
    ? Math.round((sms.segments / sms.records) * 100) / 100
    : 0;
  return {
    applinkMode: getMode(),
    generatedAt: new Date().toISOString(),
    totalRecords,
    confirmed,
    activationRate: rateOf(confirmed, totalRecords),
    changeLockJobs,
    changeLockRate: rateOf(changeLockJobs, totalRecords),
    disputeJobs,
    disputeRate: rateOf(disputeJobs, totalRecords),
    passportQualified,
    summarySmsMessages: sms.messages,
    summarySmsRecords: sms.records,
    summarySmsSegments: sms.segments,
    avgSegmentsPerRecord,
  };
}

module.exports = { computeMetrics, rateOf };
