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
db.exec('PRAGMA busy_timeout = 5000;');

function init() {
  // Foreign keys: declared here for fresh databases only. CREATE TABLE
  // IF NOT EXISTS never alters an existing table, so a database created
  // before this change keeps its old schema untouched (no migration, no
  // data change) — the FKs apply to new databases. Deliberately NOT
  // constrained, because the code stores values no parent row can
  // satisfy: Event.job_id is polymorphic (bidding events store a BidJob
  // id, not a Job id); Job.worker_phone names a worker who may never
  // have registered; Billing.job_id is '' for subscription rows (no
  // job); PassportProfile/PassportEntry worker_phone and the
  // Session/Otp/OtpTransaction phone columns may precede registration.
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
      hirer_id TEXT NOT NULL REFERENCES User(id),
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
      job_id TEXT NOT NULL REFERENCES Job(id),
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
      job_id TEXT NOT NULL REFERENCES Job(id),
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
      job_id TEXT NOT NULL REFERENCES Job(id),
      milestone INTEGER,
      url TEXT NOT NULL,
      taken_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Dispute (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES Job(id),
      category TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS DisputeStatement (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL REFERENCES Dispute(id),
      side TEXT CHECK (side IN ('hirer','worker')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ChangeProposal (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES Job(id),
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
      job_id TEXT NOT NULL REFERENCES Job(id),
      action TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Billing (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      kind TEXT CHECK (kind IN ('caas','subscription')),
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','VERIFIED','ACTIVE','CANCELLED')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS PassportEntry (
      id TEXT PRIMARY KEY,
      worker_phone TEXT NOT NULL,
      job_id TEXT NOT NULL REFERENCES Job(id),
      show_amounts INTEGER NOT NULL DEFAULT 0,
      show_client INTEGER NOT NULL DEFAULT 0,
      show_photos INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS LocationShare (
      job_id TEXT PRIMARY KEY REFERENCES Job(id),
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      sharing_on INTEGER NOT NULL DEFAULT 0,
      paused INTEGER NOT NULL DEFAULT 0,
      simulated INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      arrived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS LocationTrail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES Job(id),
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      simulated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS BidJob (
      id TEXT PRIMARY KEY,
      hirer_id TEXT NOT NULL REFERENCES User(id),
      trade TEXT NOT NULL,
      description TEXT NOT NULL,
      site_lat REAL,
      site_lng REAL,
      site_address TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN','ACCEPTED','CLOSED_NO_HIRE')),
      job_id TEXT REFERENCES Job(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Bid (
      id TEXT PRIMARY KEY,
      bid_job_id TEXT NOT NULL REFERENCES BidJob(id),
      worker_phone TEXT NOT NULL REFERENCES User(phone),
      worker_name TEXT,
      amount INTEGER NOT NULL,
      note TEXT,
      earliest_start TEXT,
      worker_lat REAL,
      worker_lng REAL,
      status TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (status IN ('LIVE','EXPIRED','NOT_SELECTED','ACCEPTED')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS BidJobPhoto (
      id TEXT PRIMARY KEY,
      bid_job_id TEXT NOT NULL REFERENCES BidJob(id),
      url TEXT NOT NULL,
      taken_at TEXT NOT NULL
    );
    -- Random public WorkPassport identifier (never a phone number).
    CREATE TABLE IF NOT EXISTS PassportProfile (
      profile_id TEXT PRIMARY KEY,
      worker_phone TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );
    -- Mutual dispute resolution: the hirer proposes, the worker accepts or
    -- rejects. A job returns to ACTIVE only after the worker accepts.
    CREATE TABLE IF NOT EXISTS DisputeResolution (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL REFERENCES Dispute(id),
      proposed_by TEXT NOT NULL,
      proposal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PROPOSED'
        CHECK (status IN ('PROPOSED','ACCEPTED','REJECTED')),
      created_at TEXT NOT NULL
    );
    -- Live AppLink OTP transactions, persisted so a server restart does
    -- not lose the otpTransactionId a verification needs.
    CREATE TABLE IF NOT EXISTS OtpTransaction (
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      otp_transaction_id TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      PRIMARY KEY (phone, purpose)
    );
    -- Name/role supplied at OTP request time, held until the code is
    -- verified — the User row is created/updated ONLY after a successful
    -- verification, never before. Persisted (not an in-memory Map) so a
    -- profile started before a restart still completes after it. There
    -- is no expiry: entries live until the matching verify consumes
    -- them, exactly as the Map behaved (get-then-delete, no timestamp,
    -- no stale-entry cleanup).
    CREATE TABLE IF NOT EXISTS pending_profiles (
      phone TEXT PRIMARY KEY,
      name TEXT,
      role TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bidjob_hirer ON BidJob(hirer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_bidjob_status ON BidJob(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_bid_job ON Bid(bid_job_id, amount);
    CREATE INDEX IF NOT EXISTS idx_bidjobphoto_job ON BidJobPhoto(bid_job_id);
    CREATE INDEX IF NOT EXISTS idx_locationtrail_job ON LocationTrail(job_id, id);
    CREATE INDEX IF NOT EXISTS idx_jobversion_job ON JobVersion(job_id, version_no);
    CREATE INDEX IF NOT EXISTS idx_event_job ON Event(job_id, id);
    CREATE INDEX IF NOT EXISTS idx_payment_job ON Payment(job_id);
    CREATE INDEX IF NOT EXISTS idx_photo_job ON Photo(job_id);
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON Otp(phone, purpose, used);
    CREATE INDEX IF NOT EXISTS idx_session_token ON Session(token);
    CREATE INDEX IF NOT EXISTS idx_workertoken_token ON WorkerToken(token);
  `);
  // Migration: job-site columns on Job (older DBs were created without them).
  const cols = db.prepare('PRAGMA table_info(Job)').all().map((c) => c.name);
  for (const [name, type] of [['site_lat', 'REAL'], ['site_lng', 'REAL'], ['site_address', 'TEXT']]) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE Job ADD COLUMN ${name} ${type}`);
  }
  // Migration: Session expiry (older DBs were created without it).
  // Sessions without an expiry are treated as expired by authedUser().
  const sessionCols = db.prepare('PRAGMA table_info(Session)').all().map((c) => c.name);
  if (!sessionCols.includes('expires_at')) db.exec('ALTER TABLE Session ADD COLUMN expires_at TEXT');
  // Migration: photo before/after label (BEFORE/AFTER; NULL = unspecified, old photos).
  const photoCols = db.prepare('PRAGMA table_info(Photo)').all().map((c) => c.name);
  if (!photoCols.includes('kind')) db.exec("ALTER TABLE Photo ADD COLUMN kind TEXT CHECK (kind IN ('BEFORE','AFTER'))");
  // Migration: Billing.user_phone, so a subscription can be linked to the
  // hirer who bought it (subscription rows have no job_id of their own).
  const billingCols = db.prepare('PRAGMA table_info(Billing)').all().map((c) => c.name);
  if (!billingCols.includes('user_phone')) db.exec('ALTER TABLE Billing ADD COLUMN user_phone TEXT');
  // Migration: Billing status 'CANCELLED' (unsubscribe). Older databases were
  // created with CHECK (status IN ('PENDING','VERIFIED','ACTIVE')) and
  // CREATE TABLE IF NOT EXISTS never updates an existing table, so an
  // unsubscribe on an old DB crashed the server with a constraint error.
  // Rebuild the table with the current constraint, preserving all rows.
  const billingSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Billing'").get();
  if (billingSql && !billingSql.sql.includes('CANCELLED')) {
    db.exec(`
      ALTER TABLE Billing RENAME TO Billing_old;
      CREATE TABLE Billing (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        kind TEXT CHECK (kind IN ('caas','subscription')),
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','VERIFIED','ACTIVE','CANCELLED')),
        created_at TEXT NOT NULL,
        user_phone TEXT
      );
      INSERT INTO Billing (id, job_id, kind, amount, status, created_at, user_phone)
        SELECT id, job_id, kind, amount, status, created_at, user_phone FROM Billing_old;
      DROP TABLE Billing_old;
    `);
  }
}

function now() {
  return new Date().toISOString();
}

// Pending profiles (Item 2): name/role captured at OTP request time.
// setPendingProfile overwrites any earlier entry for the phone, exactly
// like Map.set; takePendingProfile returns the entry (or {} when there
// is none) and deletes it, exactly like Map get-then-delete on verify.
// Both statements run synchronously back-to-back with no await between,
// so no other request can interleave.
function setPendingProfile(phone, name, role) {
  db.prepare(`INSERT INTO pending_profiles (phone, name, role) VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET name = excluded.name, role = excluded.role`)
    .run(phone, name, role);
}

function takePendingProfile(phone) {
  const row = db.prepare('SELECT name, role FROM pending_profiles WHERE phone = ?').get(phone);
  db.prepare('DELETE FROM pending_profiles WHERE phone = ?').run(phone);
  return row || {};
}

function clearAllTables() {
  const tables = ['pending_profiles', 'OtpTransaction', 'DisputeResolution', 'PassportProfile', 'Bid', 'BidJobPhoto', 'BidJob', 'LocationTrail', 'LocationShare', 'PassportEntry', 'Billing', 'WorkerToken', 'Session', 'Otp',
    'ChangeProposal', 'DisputeStatement', 'Dispute', 'Photo', 'Payment',
    'Event', 'JobVersion', 'Job', 'User'];
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
}

module.exports = { db, init, now, setPendingProfile, takePendingProfile, clearAllTables, DATA_DIR, DB_PATH };
