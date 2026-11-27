// DealCraft — SMS segment counting + short record codes.
// Carriers bill by segment, so the count is a unit-economics number:
// the summary SMS log (SmsLog) and the internal metrics view read it
// from here, never from a guess.
//
// Rules (standard SMS concatenation):
//   GSM 7-bit: 160 chars in one segment, 153 per part when concatenated.
//     Characters from the GSM 03.38 extension table (^ { } \ [ ~ ] | €)
//     cost 2 septets each. Any character outside the GSM alphabet —
//     Bangla, ৳, —, । — forces the whole message to UCS-2.
//   UCS-2: 70 chars in one segment, 67 per part when concatenated.
//     Length is counted in Unicode code points, not UTF-16 units, so an
//     astral character counts once, the way a handset counts it.
// A Bangla message with a full verify URL cannot fit in 1 segment (the
// URL alone is ~48 chars and the shortest honest Bangla line is ~55),
// so the ceiling for the summary SMS is 2 segments — see the staged
// replacement text in the Part 3 report (item 14, STOPPED on the live
// switch pending the coordinator's assertion update).
const GSM_EXT_SEPTETS = new Set([0x5e, 0x7b, 0x7d, 0x5c, 0x5b, 0x7e, 0x5d, 0x7c, 0x20ac]); // ^ { } \ [ ~ ] | €
const GSM_EXTRA = new Set([
  0x00a3, 0x00a5, // £ ¥
  0x00e8, 0x00e9, 0x00f9, 0x00ec, 0x00f2, 0x00c7, // è é ù ì ò Ç
  0x00d8, 0x00f8, 0x00c5, 0x00e5, // Ø ø Å å
  0x0394, 0x03a6, 0x0393, 0x039b, 0x03a9, 0x03a0, 0x03a8, 0x03a3, 0x0398, 0x039e, // Δ Φ Γ Λ Ω Π Ψ Σ Θ Ξ
  0x00c6, 0x00e6, 0x00df, 0x00c9, // Æ æ ß É
  0x00a1, 0x00c4, 0x00d6, 0x00d1, 0x00dc, 0x00a7, 0x00bf, // ¡ Ä Ö Ñ Ü § ¿
  0x00e4, 0x00f6, 0x00f1, 0x00fc, 0x00e0, // ä ö ñ ü à
]);

function isGsm7(text) {
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp === 0x0a || cp === 0x0d) continue; // LF / CR
    if (cp >= 0x20 && cp <= 0x7e && cp !== 0x60) continue; // printable ASCII except backtick (not in GSM 03.38)
    if (GSM_EXT_SEPTETS.has(cp) || GSM_EXTRA.has(cp)) continue;
    return false;
  }
  return true;
}

function smsSegments(text) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  if (isGsm7(s)) {
    let septets = 0;
    for (const ch of s) septets += GSM_EXT_SEPTETS.has(ch.codePointAt(0)) ? 2 : 1;
    return septets <= 160 ? 1 : Math.ceil(septets / 153);
  }
  const len = [...s].length;
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

// The short record code is the first 8 hex characters of the version
// fingerprint — the same prefix the summary SMS has always carried and
// /api/verify already resolves (unique prefix match, labelled
// "prefix match from SMS"). No new identifier, no new lookup path.
function shortCodeFor(fingerprint) {
  return (fingerprint || '').slice(0, 8).toLowerCase();
}

module.exports = { smsSegments, isGsm7, shortCodeFor };
