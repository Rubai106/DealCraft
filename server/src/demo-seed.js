// DealCraft demo seed — the ONE demo dataset (P2-8).
// The demo route, the landing demo and the regression suite all read
// this module, so the seeded job, the worker page and the passport can
// never drift apart: one dataset, one source. Per-visitor phone
// derivation lives in server/routes/demo.js and is untouched — the
// suite's agent-D checks require distinct derived phones per visitor
// and cross-visitor isolation, so the phones stay derived, not fixed.
'use strict';

const DEMO_SEED = {
  hirerName: 'Rahim Uddin',
  workerName: 'Karim Mistri',
  trade: 'ELECTRICIAN',
  scope: 'Apartment electrical rewiring — 2 bedrooms',
  price: 18000,
  milestones: [
    { title: 'Advance', amount: 5000 },
    { title: 'First stage', amount: 7000 },
    { title: 'Completion', amount: 6000 },
  ],
  answers: {
    'Who buys wires/materials?': 'Worker buys, hirer pays',
    'Wire brand and specification': 'BRB 1.5mm / 2.5mm',
    'Number of points': '24 points',
    'Circuit breakers included?': 'Yes, included',
    'Wall cutting and wall repair — included?': 'Worker includes wall repair',
    'Final testing included?': 'Yes, included',
    'Transport cost': 'Included',
    'Waste removal': 'Worker removes waste',
  },
  site: { lat: 23.8103, lng: 90.4125, address: 'Demo flat, Dhaka' },
};

module.exports = { DEMO_SEED };
