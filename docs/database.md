# Database

## Now: SQLite, one file

- **It is one file:** `server/data/dealcraft.db` (+ `-wal`/`-shm` while
  running). The schema is created by `server/src/db.js` on boot, and
  every later change ships as a migration in the same file (new columns
  via `ALTER TABLE`, the Billing status CHECK via a table rebuild). Never
  hand-edit the file.
- **Before the demo / deployment:** back the file up
  (`cp server/data/dealcraft.db backups/dealcraft-YYYY-MM-DD.db`) — the
  demo seed/reset wipes it, and there is no undo. Keep
  `DEALCRAFT_DEMO_TOKEN` set, `DEMO_MODE` unset and `NODE_ENV=production`
  on any deployed server so the demo endpoints return 404.
- **After deployment:** back the file up on a schedule (daily copy is
  enough at this scale); uploads live on local disk in `uploads/`, so
  back that folder up with the database or the photos will dangle.
- **Test isolation:** `DEALCRAFT_DATA_DIR` overrides the data directory
  (database + AppLink log) and `DEALCRAFT_UPLOADS_DIR` overrides the
  photo directory. The regression suite sets both to fresh temp dirs
  per run, so repeated `npm test` runs never see each other's rows or
  photos; with both unset the server uses `server/data` + `uploads/`
  exactly as before. Never set these on a deployed server.

## Later: hosted Postgres + object storage

If jobs ever pass a few thousand, move the database to hosted Postgres
(the queries are plain SQL, no ORM to fight) and the uploads to object
storage (S3-compatible) — the code change is small, but do it before the
finale sprint, not during it. Until then, SQLite is the right call: zero
setup, one file to copy, and the whole event log travels with the repo's
demo.

Keep the append-only event log exactly as-is, just in Postgres tables,
and add migrations discipline and daily backups in the same move.
