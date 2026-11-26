// DealCraft — FairScope questions per trade.
// An answer of "Not decided" counts as a missing term unless the hirer
// explicitly lists the question in skippedTerms when creating the job.
const FAIRSCOPE_QUESTIONS = {
  ELECTRICIAN: [
    'Who buys wires/materials?',
    'Wire brand and specification',
    'Number of points',
    'Circuit breakers included?',
    'Wall cutting and wall repair — included?',
    'Final testing included?',
    'Transport cost',
    'Waste removal',
  ],
  PAINTER: [
    'Area / rooms',
    'Number of coats',
    'Primer included?',
    'Paint brand',
    'Surface preparation',
    'Furniture moving',
    'Cleanup',
  ],
  PLUMBER: [
    'Pipe material',
    'Fixtures included or supplied by hirer',
    'Wall breaking and restoration',
    'Leak testing',
    'Materials responsibility',
  ],
};

function normalizeTrade(trade) {
  if (!trade) return null;
  const t = String(trade).trim().toUpperCase();
  if (FAIRSCOPE_QUESTIONS[t]) return t;
  return null;
}

function questionsFor(trade) {
  const t = normalizeTrade(trade);
  return t ? FAIRSCOPE_QUESTIONS[t] : [];
}

// missingTerms: questions answered "Not decided" (or left unanswered)
// and not explicitly listed in skippedTerms.
function computeMissingTerms(trade, answers = {}, skippedTerms = []) {
  const skipped = new Set((skippedTerms || []).map(String));
  return questionsFor(trade).filter((q) => {
    if (skipped.has(q)) return false;
    const a = answers ? answers[q] : undefined;
    return a === undefined || a === null || a === '' || a === 'Not decided';
  });
}

module.exports = { FAIRSCOPE_QUESTIONS, normalizeTrade, questionsFor, computeMissingTerms };
