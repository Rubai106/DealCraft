// DealCraft — photo retention.
// Photos of jobs CLOSED more than 90 days ago are deleted: the Photo row
// AND the file in uploads/. The close time comes from the JOB_CLOSED
// event's created_at in the append-only Event log (a Job row carries no
// close timestamp). Photos of jobs closed recently — or not closed at
// all — are never touched. One console.log line per run, however many
// photos were deleted (including zero).
const fs = require('node:fs');
const path = require('node:path');

const UPLOADS_DIR = process.env.DEALCRAFT_UPLOADS_DIR
  ? path.resolve(process.env.DEALCRAFT_UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'uploads');
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function runRetention(db, now) {
  const nowIso = typeof now === 'function' ? now()
    : now instanceof Date ? now.toISOString()
    : now;
  const cutoff = new Date(new Date(nowIso).getTime() - RETENTION_MS).toISOString();
  // Oldest close per job: the first JOB_CLOSED event is the close.
  const closed = db.prepare(
    "SELECT job_id, MIN(created_at) AS closed_at FROM Event WHERE type = 'JOB_CLOSED' GROUP BY job_id"
  ).all().filter((row) => row.closed_at <= cutoff);
  let deletedPhotos = 0;
  for (const row of closed) {
    const photos = db.prepare('SELECT * FROM Photo WHERE job_id = ?').all(row.job_id);
    for (const photo of photos) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(photo.url))); } catch (_e) { /* file already gone */ }
      db.prepare('DELETE FROM Photo WHERE id = ?').run(photo.id);
      deletedPhotos += 1;
    }
  }
  // eslint-disable-next-line no-console
  console.log('[retention] deleted ' + deletedPhotos + ' photo(s) from ' + closed.length + ' job(s) closed more than 90 days ago');
  return { deletedPhotos, jobs: closed.length };
}

module.exports = { runRetention, RETENTION_MS };
