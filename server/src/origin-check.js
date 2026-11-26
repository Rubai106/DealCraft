// DealCraft — origin validation for mutating requests (item 3a of the
// technical hardening pass). A cross-site request made by a browser
// always carries an Origin header (POST fetch / form) or a Referer, so a
// mutating request whose Origin/Referer host is not this server's own
// host is rejected with 403 in the app's existing { error } shape.
//
// A request with NEITHER header is allowed through. That is a deliberate,
// documented rule, not a hole:
//   - the regression suite (tests/regression/run-demo.mjs) uses node
//     fetch, which sends no Origin/Referer, as do curl and other
//     non-browser clients — a missing header cannot be told apart from
//     a legitimate same-origin non-browser call, and rejecting it would
//     break the suite and every scripted client;
//   - this app has no ambient cookie auth (sessions are Bearer headers,
//     worker access is a token in the URL), so there is no credential a
//     cross-site page could ride on anyway; the check still blocks the
//     actual CSRF vector, a cross-site page in a browser, which always
//     sends Origin.
// An Origin of the literal string "null" (sandboxed iframe / file://
// context) is rejected: it is not same-origin and it is not absent.
//
// EXEMPTIONS (full — no origin check at all):
//   POST /api/applink/caas-notify, /api/applink/mo-sms,
//   /api/applink/sms-report, /api/applink/subscription-notify —
//   server-to-server webhooks from AppLink, not browser requests.
//   AppLink sends no Origin header, and a third-party sender may send
//   any Origin; the handlers are log-only / keyed to phones already on
//   file, and their logic is untouched by this pass.
// Everything else — including the demo endpoints (token-gated) and the
// worker-token endpoints (the token in the URL path is a non-ambient
// credential a cross-site page does not know) — goes through the check
// above: mismatched Origin/Referer is rejected, absent headers pass.
const { err } = require('./shared');

const MUTATING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function originCheck(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  // AppLink callbacks are server-to-server webhooks: exempt (see above).
  if (req.path.startsWith('/api/applink/')) return next();
  const host = (req.get('host') || '').toLowerCase();
  const origin = req.get('origin');
  if (origin) {
    if (origin === 'null') return err(res, 403, 'cross-site request rejected');
    let originHost;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch (_e) {
      return err(res, 403, 'cross-site request rejected');
    }
    if (originHost !== host) return err(res, 403, 'cross-site request rejected');
    return next();
  }
  const referer = req.get('referer');
  if (referer) {
    let refererHost;
    try {
      refererHost = new URL(referer).host.toLowerCase();
    } catch (_e) {
      return err(res, 403, 'cross-site request rejected');
    }
    if (refererHost !== host) return err(res, 403, 'cross-site request rejected');
  }
  // No Origin and no Referer: allowed — see the header comment.
  next();
}

module.exports = { originCheck };
