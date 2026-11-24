# 50a card system verification

Branch: `task/50a-cards`; baseline `067b91e1edc65138144abcea1a693c251b0e37f8`.
Final verification ran on 23 November 2026 after the resumed review fixes.
No deployment, dependency or `package.json` change.

## Implementation and audit

Read AGENTS, CONTRACT, DECISIONS, DESIGN, the 50a prompt, the complete 49a/49b redesign brief and
all five supplied screenshots in `/tmp/kwip49-refs/`. Applied conventions, Tailwind, frontend
design/review, Web Interface Guidelines, Impeccable, SEO, browser testing, budget, Workers,
code review and verification skills. Fresh guidelines retrieval succeeded. The approved brief
controls the visual direction.

Changed application files:

- `app/assets/css/theme.css`: semantic card/detail name and time tokens, art ratio, per-surface
  tint strengths/bounds and responsive geometry. Existing palette, radii and density spacing tokens
  retained. State height and schedule-progress space stay reserved across transitions.
- `app/components/StreamCard.vue`: one link, intact identity, two-line visual name clamp, retained
  poster/fallback, timing, subordinate viewers and Watch cue. Natural accessible names include the
  full event name, timing, availability and action.
- `app/components/CardTiming.vue`: known UTC kickoff and date, shared status/progress, 24/7, Ended,
  Replay, normal-sized Time unavailable and stale Unconfirmed. Invalid ends cannot produce
  contradictory schedule status: a known kickoff stays visible, with availability unconfirmed and
  no progress. Stale cards retain the listed kickoff and suppress urgency and moving progress.
- `app/composables/cardTint.ts`: strict independent first-two-seed validation, shorthand expansion,
  hue-preserving HSL bounds, sRGB compositing and whole-field rejection to neutral surface.
  Convex luminance bounds include the field interior and foreground crossings; both inks must pass.
- `app/composables/useCardTint.ts`: reads centralized tokens and computes both theme fields for SSR
  and switching without browser sampling, extraction, extra requests or dependencies.
- `app/pages/index.vue`: feature and next-up share the card at hero scale. Selection, ordering,
  rails, date behavior and ad placement remain unchanged for 50b.
- `app/components/Rail.vue`: heading wraps, fixing View all overflow at 320 px with text alone at 200%.

Added verification files: `tests/cardTint.test.ts`, `tests/cards_browser.py`, `tests/cards_contrast.ts`.
The five existing browser suites are unchanged. Player, source controls, ad flag/slot, noscript,
video, feed, SEO configuration and decisions were not edited.

Review led to fixes for malformed-window status, focus ring placement, text-only heading overflow
and kickoff layout shift. The resumed review found that a stale card could infer a new status from
the current clock, the featured card had lost its panel radius, and the exact viewer count used
a generic span. The card now retains the listed kickoff with `Unconfirmed`, uses the panel
radius on the featured card and exposes the exact viewer count through a named element.

## Full gate

All checks passed on the final application source:

| Check | Result | Log under `/tmp/` |
|---|---|---|
| `pnpm test` | 148 passed, 0 failed | `50a-verified-test.log` |
| `pnpm build` | Passed, Worker preset | `50a-verified-build.log` |
| `NITRO_PRESET=node-server pnpm build` | Passed | `50a-verified-node-build.log` |
| Node smoke: `/`, `/c/basketball`, `/vods` | HTTP 200 each | `50a-verified-node-smoke.log` |
| `pnpm exec wrangler deploy --dry-run --outdir /tmp/kwip50a-verified-dry` | Passed; dry-run only | `50a-verified-dry.log` |
| Impeccable `detect --json --changed` | `[]`, supplemented by image inspection | `50a-verified-detect.json` |
| `git diff --check` | Passed | Command output |

The Node smoke ran first. The Worker build then replaced `.output` before the Wrangler dev
browser checks began.

All five unchanged Playwright suites passed at **390 and 1280 px** against that Worker:

```sh
python tests/density_browser.py .output
python tests/click_under_browser.py /tmp/kwip50a-resume-baseline/.output .output
python tests/banner_browser.py .output
python tests/notLive_browser.py .output
python tests/sourceHealth_browser.py .output
```

Python: `/tmp/kwip50a-venv/bin/python`. Logs:
`/tmp/50a-verified-{density,click-under,banner,notLive,sourceHealth}.log`.
Baseline is a build of the recorded head before the card changes, archived separately at `/tmp/kwip50a-resume-baseline`.
Click-under covers ads off/on, blocked redirects/popups and source changes. Banner includes
JavaScript disabled and failed creatives. Source health includes supplement expiry and viewport-gated
embeds. Expected fixture 404 messages do not represent failed checks.

## Screenshot matrix and CLS

Artifacts: `/tmp/kwip50a-verified-shots/`, **462 PNGs**, including two forced-colors captures.
Reports: `report.json`, `boundaries.json`, `hero-report.json`, `contrast.json`, `budget.json`.
Logs are under `/tmp/50a-verified-{matrix,contrast,forced-colors}.log`.

Reproduce:

```sh
/tmp/kwip50a-venv/bin/python tests/cards_browser.py .output --screenshots /tmp/kwip50a-verified-shots
node tests/cards_contrast.ts /tmp/kwip50a-verified-shots/contrast.json
```

- 320/390/1280 × dark/light × comfortable/compact: home, category, `/vods`, empty group and stale
  category; **60 page combinations**, all measured CLS **0**.
- Individual cases: two seeds, a white seed unreadable before bounding, no poster, failed art,
  long complete name, unknown time, invalid start/end, missing end, 24/7, ended, missing/bad seeds
  and scheduled live. Successful and failed artwork is deliberately delayed 350 ms.
- Home/category at true 200% text: font and line height double while viewport and geometry tokens
  remain unchanged. No page or timing overflow; timing wraps and poster stays visible.
- Known-kickoff featured hero separately captured in all **12** width/theme/density combinations,
  including 200% text; all CLS **0**. This avoids depending on malformed fixtures winning the
  existing home selection, which is outside 50a. Hero focus resolves to mint in both themes, with
  a 2 px outside offset.
- Controlled Upcoming → Live → Ended at 390/1280 in both themes: **CLS 0 at kickoff and ending**,
  asserted in both cases. Kickoff stays constant during Live; Started at, progress, Ended and
  progress removal are checked.
- Assertions cover one link/no nested control, complete accessible name with timing and Watch,
  ≥44 px height, visible art, stale qualification/no progress, unchanged interaction fields and
  outside keyboard focus. The matrix uses reduced motion. Boundary checks use normal motion.
- Forced-colors Chromium checks at 390 and 1280 px confirm readable live status, a visible
  focus outline, a named exact viewer count and removal of the decorative gradient.

Direct image inspection covered the references and rendered narrow/desktop cards, both themes and
densities, long names, archive, stale, text enlargement, ended boundary and settled mint focus.
These are Chromium checks; no physical-device or other-engine claim is made.

## Contrast

`contrast.json` records **400 extreme seed/theme/scale fields**, **16 fixture fields**, neutral
fallbacks and a SHA-256 of the token source. Both inks are computed over the entire sRGB field;
interactions retain that background. Tests introduce passing endpoints with a failing interior
and verify whole-field rejection. A separate rejection returns a neutral pair that passes.

| Theme / scale | Minimum fg | Minimum muted | Minimum focus vs field |
|---|---:|---:|---:|
| Dark listing | 10.409 | 5.780 | 7.550 |
| Dark hero | 8.813 | 4.893 | 6.392 |
| Light listing | 13.205 | 5.576 | 6.018 |
| Light hero | 12.123 | 5.119 | 5.525 |

Neutral fg/muted: dark 14.582/8.097, light 15.966/6.742. Outside mint focus also exceeds 3:1
against canvas. White is readable after bounding; malformed/missing seeds become neutral.
Today's bounded valid fields pass; rejection remains enforced and tested.

## Budget flag

| Measurement | Baseline | 50a |
|---|---:|---:|
| Dry-run upload | 988.54 KiB | 1050.65 KiB (+6.3%) |
| Upload gzip | 261.95 KiB | 276.12 KiB (+5.4%) |
| Client directory disk | 376 KiB | 384 KiB |
| Client JS gzip total | 122,303 B | 124,640 B |
| Worker directory disk including maps | 1084 KiB | 1388 KiB (+28.0%) |
| Worker executable `.mjs` bytes | 654,853 B | 716,247 B (+9.4%) |
| Worker source-map bytes | 291,740 B | 548,888 B |
| Worker index | 253 B | 253 B |

The Worker directory exceeds the 10% budget flag. Source maps account for most growth; actual
upload and executable growth remain below 10%. Largest new card chunk: 8,376 B gzip. No added
chunk exceeds 40 kB gzip; the existing framework chunk remains ~74 kB. No new raster assets,
dependencies or runtime requests. Both dry-runs emit the same 15 ignored-bare-import process-shim
warnings, with no new warning category.
