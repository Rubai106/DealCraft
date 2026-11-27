# Design — Direction 03, "Dotted Bangladesh"

The design direction was picked from three directions in a chooser
(rebuilt from visual teardowns of sharplink.com, terminal-industries.com
and unitedcarriers.com — spirit only, nothing copied). Black hero, dotted
map of Bangladesh (white dots, orange Dhaka/Chattogram markers, orange
arcs), hot orange `#FF5A1F` used sparingly, royal blue `#1E4FFF` only for
live/tracking elements, huge condensed poster type, mono 11–13px all-caps
labels, pill buttons only, mostly square edges, pinned scroll journey,
giant numerals. Bangla-first with an EN toggle. No centred hero with
three feature cards, no purple gradients, no emoji, no rounded SaaS card
grids.

## Design check

`design-taste-frontend` gate on `public/index.html`, 3 rounds —
**GATE: OPEN 14** (106 → 54 → 43 → 34 → 23 → 12, then re-counted at 14
open FAILs in `.taste-skill/gate.json`; rounds exhausted, 3/3). 3 waivers
in `.taste-skill/waivers.json`: button-styles (pill CTAs are the one
action style; square tab/option controls are form controls by design),
copy-headings (step headings name the product's own parts in Bangla; the
checker matches English nouns only), section-height (the app section is
a working multi-view form, so its height follows the visible view).
Copy-lint: **0 FAIL, 2 WARN** (em-dash budget — most are mono-label
separators and Bangla punctuation, not prose habit; numbered steps — the
FAQ and journey steps genuinely run in order). The remaining open FAILs
are mostly the skill's strict company-site rules applied to an app page
(hero visual coverage 9% vs ~25% wanted, section gaps/heights, journey
3.36 screens on a phone).

## Fonts

Fonts load from Google Fonts only (linked in every page's `<head>`:
Archivo Black, Oswald, Noto Sans Bengali), so a fresh clone reproduces
the intended design. The 10 self-hosted `.woff2` files in
`public/fonts/` exist in a local checkout but are **not on the GitHub
remote** — the push route is text-only and cannot carry binaries — and
`public/fonts.css` therefore contains no `@font-face` rules: the
previous rules pointed at files the deployed remote does not have and
produced ~5 font 404s per page load. If the `.woff2` files are ever
uploaded via the GitHub web UI, the rules may be re-added — and must be
verified against the remote, not just a local checkout.

## PWA icons

`public/manifest.json` lists the SVG icon only (`icon.svg`, `lang`
`"en"` to match the English default). PNG icons (`icon-192.png`,
`icon-512.png`) still need to be uploaded via the GitHub web UI — the
same text-only push constraint applies — before the PWA is fully
installable. Do not add PNG entries to the manifest until the files are
verified on the remote.

The hero pill is mode-aware: "Sandbox — demo" in sandbox mode, "Live"
only in live mode with credentials configured — it never claims a
simulated call was live.

Screenshots from the QA passes are kept locally in
`.taste-skill/shots/` (gitignored, not committed to the repo).
