// DealCraft prompt parser — deterministic, rule-based, no network, no LLM.
// Mirrors server/src/prompt-parse.js — keep in sync.
'use strict';

const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

function toLatinDigits(s) {
  return String(s).replace(/[০-৯]/g, (d) => BN_DIGITS[d]);
}

// Word boundary that works for Latin and Bengali alike: a keyword must not
// be glued to another letter or digit on either side. (\b is ASCII-only,
// so it would let "রং" match inside "রংধনু" and "paint" match inside
// "painter".) Bengali vowel signs are marks, not letters, so a trailing
// inflection such as "শুক্রবারের" still counts as a word end.
const NOT_WORD = '[\\p{L}\\p{N}]';
function wordRe(alt) {
  return new RegExp('(?<!' + NOT_WORD + ')(?:' + alt + ')(?!' + NOT_WORD + ')', 'iu');
}

// --- Dhaka calendar --------------------------------------------------------
function dhakaParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: get('weekday') };
}

const WEEKDAY_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function isoFromParts(y, m, d) {
  const p = (n) => String(n).padStart(2, '0');
  return y + '-' + p(m) + '-' + p(d);
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function dhakaTodayIso() {
  const p = dhakaParts(new Date());
  return isoFromParts(p.year, p.month, p.day);
}

function dhakaWeekdayNum() {
  return WEEKDAY_NUM[dhakaParts(new Date()).weekday];
}

function isRealDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// --- Deadline --------------------------------------------------------------
const MONTHS_EN = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTHS_BN = {
  'জানুয়ারি': 1, 'ফেব্রুয়ারি': 2, 'মার্চ': 3, 'এপ্রিল': 4, 'মে': 5, 'জুন': 6,
  'জুলাই': 7, 'আগস্ট': 8, 'সেপ্টেম্বর': 9, 'অক্টোবর': 10, 'নভেম্বর': 11, 'ডিসেম্বর': 12,
};
const WEEKDAYS = [
  { names: ['sunday', 'sun', 'রবিবার'], num: 0 },
  { names: ['monday', 'mon', 'সোমবার'], num: 1 },
  { names: ['tuesday', 'tue', 'tues', 'মঙ্গলবার'], num: 2 },
  { names: ['wednesday', 'wed', 'বুধবার'], num: 3 },
  { names: ['thursday', 'thu', 'thur', 'thurs', 'বৃহস্পতিবার'], num: 4 },
  { names: ['friday', 'fri', 'শুক্রবার'], num: 5 },
  { names: ['saturday', 'sat', 'শনিবার'], num: 6 },
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Each candidate returns { start, end, iso, text } or null. The earliest
// match in the text wins; ties are broken by the order below (explicit
// dates first, then weekdays, then relative words).
function deadlineCandidates(low, norm, todayIso, todayNum) {
  const out = [];
  const push = (start, end, iso) => {
    if (start < 0 || !iso) return;
    out.push({ start, end, iso, text: norm.slice(start, end).trim() });
  };

  // Explicit dates: "4 Dec", "4 December 2026", "Dec 4", "৪ ডিসেম্বর".
  // A date with no year that already passed rolls to next year.
  const monthAlt = Object.keys(MONTHS_EN).concat(Object.keys(MONTHS_BN)).map(escapeRe).join('|');
  const monthOf = (name) => MONTHS_EN[name.toLowerCase()] || MONTHS_BN[name] || null;
  const dateFromParts = (day, monthName, year) => {
    const m = monthOf(monthName);
    const d = Number(day);
    if (!m || !isRealDate(year || 2000, m, d)) return null;
    const y = year || Number(todayIso.slice(0, 4));
    let iso = isoFromParts(y, m, d);
    if (!year && iso < todayIso) iso = isoFromParts(y + 1, m, d);
    return iso;
  };
  let m = wordRe('(\\d{1,2})\\s*(' + monthAlt + ')(?:\\s*,?\\s*(\\d{4}))?').exec(low);
  if (m) push(m.index, m.index + m[0].length, dateFromParts(m[1], m[2], m[3] ? Number(m[3]) : null));
  m = wordRe('(' + monthAlt + ')\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?').exec(low);
  if (m) push(m.index, m.index + m[0].length, dateFromParts(m[2], m[1], m[3] ? Number(m[3]) : null));

  // Weekdays: "Friday", "by Friday", "শুক্রবার" — the next occurrence
  // from today (today itself when the prompt names today's weekday).
  // A trailing "ের মধ্যে" / "এর মধ্যে" / "র মধ্যে" ("by Friday",
  // "within Friday") is part of the deadline span: leaving it behind
  // garbled the scope ("শুক্রবারের মধ্যে" left "ের মধ্যে" in it).
  const wdAlt = WEEKDAYS.flatMap((w) => w.names).map(escapeRe).join('|');
  m = wordRe('(?:by\\s+)?(' + wdAlt + ')(?:\\s*(?:ের|এর|র)?\\s*মধ্যে)?').exec(low);
  if (m) {
    const wd = WEEKDAYS.find((w) => w.names.some((n) => n.toLowerCase() === m[1].toLowerCase()));
    if (wd) push(m.index, m.index + m[0].length, addDaysIso(todayIso, (wd.num - todayNum + 7) % 7));
  }

  // Relative words and phrases.
  const rel = [
    { re: wordRe('(?:within\\s+)?(?:a|one)\\s+week|এক\\s*সপ্তাহের?\\s*মধ্যে'), days: 7 },
    { re: wordRe('(?:in|within)\\s+(\\d+)\\s+days?|(\\d+)\\s*দিনের?\\s*মধ্যে|(\\d+)\\s*দিনে'), days: null },
    { re: wordRe('day\\s+after\\s+tomorrow|পরশু'), days: 2 },
    { re: wordRe('tomorrow|আগামীকাল|কাল'), days: 1 },
    { re: wordRe('today|আজ'), days: 0 },
  ];
  for (const r of rel) {
    const hit = r.re.exec(low);
    if (!hit) continue;
    let days = r.days;
    if (days == null) days = Number(hit[1] || hit[2] || hit[3]);
    if (!Number.isFinite(days)) continue;
    push(hit.index, hit.index + hit[0].length, addDaysIso(todayIso, days));
    break; // first relative pattern that matches wins (longest phrases first)
  }

  return out;
}

// --- Trade -----------------------------------------------------------------
// Specific keywords first. A bare "mistri"/"মিস্ত্রি" on its own says
// nothing about the trade (a mistri can be any trade), so it must NOT
// default to ELECTRICIAN — trade stays null and the chat asks "Which
// trade?" (server/src/prompt-parse.js mirrors this rule).
const TRADE_KEYWORDS = [
  { trade: 'ELECTRICIAN', words: ['ইলেকট্রিশিয়ান', 'ইলেকট্রিক মিস্ত্রি', 'ইলেকট্রিক মিস্ত্রী', 'electric mistri', 'electrician', 'electrical', 'rewiring', 'rewire', 'wiring', 'রিওয়্যারিং', 'ওয়্যারিং', 'switch', 'socket', 'ফ্যান', 'fan', 'সুইচ', 'light', 'bulb', 'লাইট'] },
  { trade: 'PAINTER', words: ['পেইন্টার', 'পেইন্ট', 'রং', 'রঙ', 'painter', 'painting', 'paint'] },
  { trade: 'PLUMBER', words: ['প্লাম্বার', 'প্লাম্বিং', 'plumber', 'plumbing', 'পাইপ', 'pipe', 'ট্যাপ', 'tap', 'লিক', 'leak', 'drain', 'faucet'] },
];

function tradeMatch(low) {
  let best = null;
  for (const t of TRADE_KEYWORDS) {
    for (const w of t.words) {
      const hit = wordRe(escapeRe(w)).exec(low);
      if (hit && (best == null || hit.index < best.start)) {
        best = { trade: t.trade, start: hit.index, end: hit.index + hit[0].length, word: w };
      }
    }
  }
  if (best) return best;
  return null;
}

// Every occurrence of the matched trade word, not just the first: the
// description used to keep a second "rewiring" behind ("2 bedroom flat,
// rewiring again"), which read as a garbled scope.
function tradeOccurrences(low, word) {
  if (!word) return [];
  const re = new RegExp('(?<!' + NOT_WORD + ')(?:' + escapeRe(word) + ')(?!' + NOT_WORD + ')', 'igu');
  const out = [];
  let hit;
  while ((hit = re.exec(low)) !== null) {
    out.push({ start: hit.index, end: hit.index + hit[0].length });
  }
  return out;
}

// --- Price -----------------------------------------------------------------
function priceMatch(low, masked) {
  // Currency-marked first ("৳18,000", "18000 taka", "১৮০০০ টাকা").
  const cur = '(?:৳|টাকা|taka|bdt|tk)';
  let m = wordRe(cur + '\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)').exec(masked);
  if (m) {
    return { value: toNumber(m[1]), start: m.index, end: m.index + m[0].length };
  }
  m = wordRe('([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*' + cur).exec(masked);
  if (m) {
    return { value: toNumber(m[1]), start: m.index, end: m.index + m[0].length };
  }
  // Bare number: the largest one of 100 or more ("2 bedroom" must never
  // win over the price). Deadline spans are already masked out, so a
  // "4 Dec" can never be read as a price.
  let best = null;
  const bare = /[0-9][0-9,]*(?:\.[0-9]+)?/g;
  let hit;
  while ((hit = bare.exec(masked)) !== null) {
    const v = toNumber(hit[0]);
    if (v >= 100 && (best == null || v > best.value)) {
      best = { value: v, start: hit.index, end: hit.index + hit[0].length };
    }
  }
  return best;
}

function toNumber(s) {
  return Math.round(Number(String(s).replace(/,/g, '')));
}

// --- Description -----------------------------------------------------------
function cleanDescription(norm, spans) {
  let masked = norm;
  // Mask spans from the end so earlier indices stay valid.
  const ordered = spans.filter(Boolean).slice().sort((a, b) => b.start - a.start);
  for (const s of ordered) {
    masked = masked.slice(0, s.start) + ' '.repeat(Math.max(0, s.end - s.start)) + masked.slice(s.end);
  }
  let desc = masked.replace(/\s+/g, ' ').trim();
  // Filler words ("need", "লাগবে", "দরকার") carry no scope — drop them
  // wherever they sit, then tidy the punctuation they leave behind.
  desc = desc.replace(/(?<![\p{L}\p{N}])(need|please|দরকার|চাই|লাগবে|a|an)(?![\p{L}\p{N}])/giu, ' ');
  desc = desc.replace(/,\s*,/g, ',').replace(/\s+,/g, ',');
  desc = desc.replace(/^[,.;:\-–—\s]+|[,.;:\-–—\s]+$/g, '').trim();
  desc = desc.replace(/\s+/g, ' ');
  return desc;
}

// --- Entry point -----------------------------------------------------------
function parsePrompt(text) {
  const raw = text == null ? '' : String(text);
  const norm = toLatinDigits(raw);
  const low = norm.toLowerCase();
  const todayIso = dhakaTodayIso();
  const todayNum = dhakaWeekdayNum();

  const cands = deadlineCandidates(low, norm, todayIso, todayNum);
  cands.sort((a, b) => a.start - b.start);
  const deadline = cands.length ? cands[0] : null;

  // Price is matched on text with the deadline span blanked out.
  let masked = low;
  if (deadline) masked = masked.slice(0, deadline.start) + ' '.repeat(deadline.end - deadline.start) + masked.slice(deadline.end);
  const price = priceMatch(low, masked);
  const trade = tradeMatch(low);

  const missing = [];
  if (!trade) missing.push('trade');
  if (!price) missing.push('price');
  if (!deadline) missing.push('deadline');

  // description is the historical field and stays byte-for-byte what it
  // was (existing assertions pin "2 bedroom flat" for the canonical
  // line): trade keyword (every occurrence), price and deadline masked
  // out. scope is the same line minus only the recognised price and
  // deadline — the brief's scope ("2 bedroom flat rewiring") — and is
  // what the chips and the job-scope field show.
  const description = cleanDescription(norm, [...tradeOccurrences(low, trade ? trade.word : null), price, deadline]);
  const scope = cleanDescription(norm, [price, deadline]);

  return {
    trade: trade ? trade.trade : null,
    price: price ? price.value : null,
    deadline: deadline ? deadline.iso : null,
    deadlineText: deadline ? deadline.text : null,
    description,
    scope,
    missing,
  };
}

window.DealCraftPrompt = { parsePrompt };
