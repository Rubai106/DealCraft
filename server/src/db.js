// DealCraft — SQLite storage (built-in node:sqlite, DatabaseSync).
// Relational, append-only at app level: the app never UPDATEs or DELETEs
// rows in JobVersion or Event. (Otp.used and Session/Billing status flags
// are the only mutable rows, and they are not job records.)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'dealcraft.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      name TEXT,
      phone TEXT UNIQUE NOT NULL,
      role TEXT CHECK (role IN ('hirer','worker')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Job (
      id TEXT PRIMARY KEY,
      hirer_id TEXT NOT NULL,
      worker_phone TEXT NOT NULL,
      worker_name TEXT,
      trade TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','PENDING','ACTIVE','CLOSED','DISPUTED')),
      current_version INTEGER NOT NULL DEFAULT 1,
      billing_paid INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS JobVersion (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      version_no INTEGER NOT NULL,
      scope_json TEXT NOT NULL,
      price INTEGER NOT NULL,
      deadline TEXT,
      fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      type TEXT NOT NULL,
      actor TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Payment (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT CHECK (method IN ('Cash','bKash','Nagad')),
      recorded_by TEXT,
      ack_status TEXT NOT NULL DEFAULT 'AWAITING'
        CHECK (ack_status IN ('AWAITING','ACKNOWLEDGED','DISPUTED')),
      date TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Photo (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      milestone INTEGER,
      url TEXT NOT NULL,
      taken_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Dispute (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS DisputeStatement (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      side TEXT CHECK (side IN ('hirer','worker')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ChangeProposal (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      proposed_by TEXT,
      price_delta INTEGER NOT NULL DEFAULT 0,
      deadline TEXT,
      reason TEXT,
      details_json TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','APPROVED','REJECTED','CLARIFICATION')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Otp (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS Session (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS WorkerToken (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      job_id TEXT NOT NULL,
      action TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Billing (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      kind TEXT CHECK (kind IN ('caas','subscription')),
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','VERIFIED','ACTIVE')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS PassportEntry (
      id TEXT PRIMARY KEY,
      worker_phone TEXT NOT NULL,
      job_id TEXT NOT NULL,
      show_amounts INTEGER NOT NULL DEFAULT 0,
      show_client INTEGER NOT NULL DEFAULT 0,
      show_photos INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobversion_job ON JobVersion(job_id, version_no);
    CREATE INDEX IF NOT EXISTS idx_event_job ON Event(job_id, id);
    CREATE INDEX IF NOT EXISTS idx_payment_job ON Payment(job_id);
    CREATE INDEX IF NOT EXISTS idx_photo_job ON Photo(job_id);
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON Otp(phone, purpose, used);
    CREATE INDEX IF NOT EXISTS idx_session_token ON Session(token);
    CREATE INDEX IF NOT EXISTS idx_workertoken_token ON WorkerToken(token);
  `);
}

function now() {
  return new Date().toISOString();
}

function clearAllTables() {
  const tables = ['PassportEntry', 'Billing', 'WorkerToken', 'Session', 'Otp',
    'ChangeProposal', 'DisputeStatement', 'Dispute', 'Photo', 'Payment',
    'Event', 'JobVersion', 'Job', 'User'];
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
}

module.exports = { db, init, now, clearAllTables, DATA_DIR, DB_PATH };
