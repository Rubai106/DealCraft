// DealCraft — read-aloud record (Ceiling Pass, Part 2, item 13).
// One-tap "শুনুন / Listen": the record read aloud in plain language —
// trade, scope in simple words, agreed price, paid, remaining, deadline —
// using the browser's built-in speech synthesis (window.speechSynthesis,
// no external API, no cost). The script follows the UI language: Bangla
// when the UI is Bangla, English when English.
//
// UMD: the pure script builder is Node-testable (the regression suite
// imports this file and asserts on buildReadAloudScript); in the browser
// it also exposes speakRecord / stopSpeaking on window.DealCraftReadAloud.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DealCraftReadAloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TRADE_BN = { ELECTRICIAN: 'ইলেকট্রিশিয়ান', PAINTER: 'পেইন্টার', PLUMBER: 'প্লাম্বার' };
  var TRADE_EN = { ELECTRICIAN: 'Electrician', PAINTER: 'Painter', PLUMBER: 'Plumber' };

  var BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  function toBnDigits(s) {
    return String(s == null ? '' : s).replace(/[0-9]/g, function (d) { return BN_DIGITS[Number(d)]; });
  }
  function formatTaka(n, lang) {
    if (n == null || isNaN(Number(n))) return lang === 'bn' ? '—' : '—';
    var grouped = Number(n).toLocaleString('en-IN');
    return lang === 'bn' ? '৳' + toBnDigits(grouped) : '৳' + grouped;
  }
  function formatDateBn(dateStr) {
    if (!dateStr) return '';
    // YYYY-MM-DD stays in that order, digits in Bengali — a bn voice
    // reads it naturally; any other shape is read as-is, digits converted.
    return toBnDigits(String(dateStr));
  }
  function cleanScope(scope) {
    var s = String(scope || '').replace(/\s+/g, ' ').trim();
    if (s.length > 200) s = s.slice(0, 200).trim() + '…';
    return s;
  }

  // Pure function: plain-language script from the record's own fields.
  // record: { trade, scope, price, paid, remaining, deadline }.
  // lang: 'bn' (default) or 'en'. Missing price/deadline degrade to a
  // spoken "not set" line instead of inventing a number.
  function buildReadAloudScript(record, lang) {
    var r = record || {};
    var bn = lang !== 'en';
    var tradeKey = String(r.trade || '').toUpperCase();
    var trade = bn ? (TRADE_BN[tradeKey] || r.trade || '') : (TRADE_EN[tradeKey] || r.trade || '');
    var scope = cleanScope(r.scope);
    var price = r.price != null ? r.price : null;
    var paid = r.paid != null ? r.paid : 0;
    var remaining = r.remaining != null ? r.remaining : (price != null ? price - paid : 0);
    if (bn) {
      var parts = ['এই কাজের রেকর্ড।'];
      if (trade) parts.push('কাজ: ' + trade + '।');
      if (scope) parts.push('কাজের বিবরণ: ' + scope + '।');
      if (price != null) parts.push('মোট দাম ' + formatTaka(price, 'bn') + '।');
      else parts.push('মোট দাম ঠিক হয়নি।');
      parts.push('দেওয়া হয়েছে ' + formatTaka(paid, 'bn') + '।');
      parts.push('বাকি ' + formatTaka(remaining, 'bn') + '।');
      if (r.deadline) parts.push('শেষ তারিখ ' + formatDateBn(r.deadline) + '।');
      else parts.push('শেষ তারিখ দেওয়া হয়নি।');
      return parts.join(' ');
    }
    var enParts = ['This is your work record.'];
    if (trade) enParts.push('Trade: ' + trade + '.');
    if (scope) enParts.push('Scope: ' + scope + '.');
    if (price != null) enParts.push('Agreed price: ' + formatTaka(price, 'en') + '.');
    else enParts.push('Agreed price is not set.');
    enParts.push('Paid: ' + formatTaka(paid, 'en') + '.');
    enParts.push('Remaining: ' + formatTaka(remaining, 'en') + '.');
    if (r.deadline) enParts.push('Deadline: ' + String(r.deadline) + '.');
    else enParts.push('No deadline set.');
    return enParts.join(' ');
  }

  // Browser only: speak the record, picking a Bangla voice when the UI
  // is Bangla and one is available; falls back to the default voice.
  // Returns the spoken text, or null when speech synthesis is unavailable
  // (old browser, or Node). Calling it while speaking restarts the read.
  function speakRecord(record, lang) {
    var text = buildReadAloudScript(record, lang);
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return null;
    try {
      window.speechSynthesis.cancel();
      var u = new window.SpeechSynthesisUtterance(text);
      var bn = lang !== 'en';
      u.lang = bn ? 'bn-BD' : 'en-IN';
      var voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      var pick = null;
      if (bn) {
        for (var i = 0; i < voices.length; i++) {
          var l = String(voices[i].lang || '').toLowerCase();
          if (l.indexOf('bn') === 0) { pick = voices[i]; break; }
        }
      }
      if (pick) u.voice = pick;
      window.speechSynthesis.speak(u);
      return text;
    } catch (_e) { return null; }
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_e) { /* no speech to stop */ }
    }
  }

  function isSpeaking() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    try { return !!window.speechSynthesis.speaking; } catch (_e) { return false; }
  }

  return { buildReadAloudScript: buildReadAloudScript, speakRecord: speakRecord, stopSpeaking: stopSpeaking, isSpeaking: isSpeaking, toBnDigits: toBnDigits, formatTaka: formatTaka };
});
