// DealCraft — security headers (item 3b of the technical hardening pass).
// One middleware, applied to every response: the app is same-origin
// (the UI is served by this server, API calls are same-origin fetch),
// so the headers below cost nothing and break nothing.
//
// Content-Security-Policy is derived from the actual pages, not guessed:
//   public/index.html, public/worker.html, public/passport.html,
//   public/verify.html load, between them:
//   - scripts: same-origin app.js / inline <script> blocks (every page
//     has one: index.html:25, worker.html:154, passport.html:52,
//     verify.html:55), plus self-hosted Leaflet (public/vendor/leaflet/);
//     passport.html also has an inline onerror= handler
//   - styles: same-origin style.css / fonts.css, <style> blocks
//     (worker.html, verify.html), inline style="..." attributes on all
//     pages, Google Fonts CSS, self-hosted Leaflet CSS
//   - fonts: Google Fonts (fonts.gstatic.com) and self-hosted .woff2
//     under public/fonts/ (fonts.css @font-face, same-origin)
//   - images: same-origin photos (/uploads/*), QR PNGs
//     (/api/passport/:id/qr.png), data: favicons, Leaflet tiles from
//     tile.openstreetmap.org, Leaflet marker images (same-origin, under
//     public/vendor/leaflet/images/)
//   - network: same-origin fetch only (connect-src 'self')
// Because the pages carry inline scripts, inline styles and an inline
// event handler, script-src and style-src keep 'unsafe-inline': removing
// those would be a UI change, out of scope for this pass. The policy
// still confines every external load to the three inventoried hosts
// (fonts.googleapis.com, fonts.gstatic.com,
// tile.openstreetmap.org) and blocks plugins, foreign frames and
// foreign form targets outright. unpkg.com was removed: Leaflet is now
// self-hosted, so no page loads anything from it.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'frame-ancestors \'none\'',
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', CSP);
  next();
}

module.exports = { securityHeaders, CSP };
