// DealCraft — live AppLink OTP transactions, persisted in SQLite.
// AppLink's /otp/verify needs the otpTransactionId from the matching
// /otp/send. Keeping it in an in-memory Map meant a server restart lost
// it and every pending verification failed. This store survives restarts:
// same phone+purpose key, same SQLite database as the rest of the app.
const { db, init, now } = require('../db');
init(); // idempotent — creates the table when this module is used standalone

function saveOtpTransaction(phone, purpose, otpTransactionId) {
  db.prepare(
    `INSERT INTO OtpTransaction (phone, purpose, otp_transaction_id, sent_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(phone, purpose) DO UPDATE SET otp_transaction_id = excluded.otp_transaction_id, sent_at = excluded.sent_at`
  ).run(phone, purpose, otpTransactionId, now());
}

function getOtpTransaction(phone, purpose) {
  const row = db.prepare(
    'SELECT * FROM OtpTransaction WHERE phone = ? AND purpose = ?'
  ).get(phone, purpose);
  if (!row) return null;
  return { otpTransactionId: row.otp_transaction_id, sentAt: new Date(row.sent_at).getTime() };
}

function deleteOtpTransaction(phone, purpose) {
  db.prepare('DELETE FROM OtpTransaction WHERE phone = ? AND purpose = ?').run(phone, purpose);
}

module.exports = { saveOtpTransaction, getOtpTransaction, deleteOtpTransaction };
