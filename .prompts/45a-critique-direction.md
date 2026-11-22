# Task 45a: critique and new direction for the whole surface

The site works and the mechanics are sound. The owner's verdict on the look is "pretty bad", so this is
a **redesign, not a polish**: keep product truth, content, routes, behaviour and constraints; replace the
visual world. Read the current look as evidence and anti-reference.

That means the last pass (condensed uppercase display face, 3 px corners, everything hairline-flat) is
the incumbent and is explicitly up for replacement. It will not be split-differenced.

## Direction already pinned by the owner

- **The main font is the Apple system face.** `-apple-system`, `BlinkMacSystemFont`, `system-ui` first,
  with `"SF Pro Text"` named. Drop the Arial Narrow display stack entirely. Reference for the type and
  interaction craft being asked for: <https://github.com/bradleyhodges/SFWindows> (San Francisco and New
  York families, their optical sizes and weights, Apple's own specimen). No font files, no new
  dependency: system stack only.
- The site is an **Operate** surface by impeccable's modes: people arrive to find a live game and press
  play, usually on a phone, often in a hurry, sometimes with one bar of signal. Scanability, density and
  trustworthy affordances outrank expression. Do not design it as an agency landing page.

## Read

`AGENTS.md`, `CONTRACT.md`, `DECISIONS.md`, `DESIGN.md`, `ROADMAP.md` §5, `app/assets/css/theme.css`,
`app/pages/index.vue`, `app/pages/live/[...uri].vue`, `app/pages/vods/*`, `app/components/*`.

Then the skills, in this order: `impeccable` (its `init`, `critique` and `new-work` references and
`craft-floor`), `unslop` (audit signs and direction format), `unslop-ui` (chrome and copy signs),
`kwip-conventions`, `tailwind-best-practices`. `taste-skill` overlaps both and is landing-page-heavy:
read it for its type, spacing and equal-edges rules, but impeccable and `unslop` carry the direction.
Where a skill's house palette fights our tokens, the tokens win.

## Do

1. **Run `impeccable init`** and write `PRODUCT.md` from the real product: who is on the page, what they
   are trying to do, what "good" looks like in five seconds, what we refuse. Facts only; the framing is a
   live event directory that hosts nothing, ad-supported and few ads, no account in v1. Commit it.
2. **Audit before designing.** Build, serve, screenshot the home page, the live window, an event page,
   the player, `/vods`, a category with entries and one without, the stale/error states, at 390 and 1280,
   dark and light, with the banner present. Run the `unslop` sign list and `unslop-ui`'s chrome list over
   what you see and write one line per finding with where it lives. Then impeccable's critique rubric,
   scored, including what the incumbent does well enough to survive in another form.
3. **Two directions, not one.** For each: the five `unslop` lines (product, character, world, moments,
   signature), a paragraph on how the front page and the event page differ in it, and a token-level
   proposal — named colour ramp with values, type scale with SF weights and optical sizes, radius, rule
   and elevation system, and what carries the one bright element in an Operate surface where imagery is
   third-party posters. Say which one you recommend and why, and what each risks.
4. **Constraint check for each direction:** ad slot still reserved and below the player, density switch
   still meaningful, CLS 0, contrast AA, focus visible, 44 px targets, reduced motion, `noscript` select
   fallback, poster-less cards still work, no dependency, no proxy, no `<video>`, tokens only.
5. Commit `PRODUCT.md` and the critique as `docs/redesign-45a.md`. No component or CSS changes yet.

## Report

The audit count by category, both directions in full, your recommendation, and the three or four
decisions the owner actually has to make. Screenshots in `/tmp`, paths quoted.

Do not deploy, do not touch the ad flag, do not run `wrangler dev` while a build writes `.output/`.
