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

// Three states per FairScope question — an unanswered question is NEVER
// an explicit skip. "Unresolved" means the hirer has neither answered it
// nor deliberately skipped it, and a job may not be created while any
// term is unresolved.
function termStates(trade, answers = {}, skippedTerms = []) {
  const skipped = new Set((skippedTerms || []).map(String));
  const ans = answers || {};
  return questionsFor(trade).map((q) => {
    const a = ans[q];
    const answered = a !== undefined && a !== null && a !== '' && a !== 'Not decided';
    if (answered) return { question: q, state: 'answered', answer: a };
    if (skipped.has(q)) return { question: q, state: 'skipped' };
    return { question: q, state: 'unresolved' };
  });
}

// validateSkippedTerms: the gate the job-creation endpoint enforces.
// Returns { unresolved, invalid }: unresolved terms block creation;
// invalid terms are skippedTerms that are not questions of this trade
// (or are already answered — an answered term needs no skip).
function validateSkippedTerms(trade, answers = {}, skippedTerms = []) {
  const qs = questionsFor(trade);
  const ans = answers || {};
  const skipped = Array.isArray(skippedTerms) ? skippedTerms.map(String) : [];
  const invalid = skipped.filter((q) => !qs.includes(q));
  const unresolved = qs.filter((q) => {
    const a = ans[q];
    const answered = a !== undefined && a !== null && a !== '' && a !== 'Not decided';
    return !answered && !skipped.includes(q);
  });
  // Only genuinely skipped (unanswered) terms are recorded as skipped.
  const effectiveSkipped = skipped.filter((q) => qs.includes(q) && !(() => {
    const a = ans[q];
    return a !== undefined && a !== null && a !== '' && a !== 'Not decided';
  })());
  return { unresolved, invalid, effectiveSkipped };
}

module.exports = { FAIRSCOPE_QUESTIONS, normalizeTrade, questionsFor, computeMissingTerms, termStates, validateSkippedTerms };
