// DealCraft routes — internal metrics (ceiling pass item 15).
// Team-only: every route reuses the existing DEMO_MODE + demo-token gate
// (demoAllowed) — no new auth system. Without DEMO_MODE the routes are
// 404; with a token configured, a missing/wrong token is 403.
// The page itself (/metrics) carries no data — it fetches /api/metrics
// with the demo token, so the gate is enforced on the data, not the shell.
const express = require('express');
const path = require('node:path');
const { PUBLIC_DIR, demoAllowed } = require('../src/shared');
const { computeMetrics } = require('../src/metrics');
const router = express.Router();

router.get('/api/metrics', (req, res) => {
  if (!demoAllowed(req, res)) return;
  res.json(computeMetrics());
});

router.get('/api/metrics.csv', (req, res) => {
  if (!demoAllowed(req, res)) return;
  const m = computeMetrics();
  const rows = [['metric', 'value']].concat(
    Object.entries(m).map(([k, v]) => [k, String(v)])
  );
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n') + '\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dealcraft-metrics.csv"');
  res.send(csv);
});

router.get('/metrics', (req, res) => {
  if (!demoAllowed(req, res)) return;
  res.sendFile(path.join(PUBLIC_DIR, 'metrics.html'));
});

module.exports = router;
