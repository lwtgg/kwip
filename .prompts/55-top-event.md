# Brief — task 55, the top event plays itself muted

Rule 26 is the spec, amended by rule 27 for the banner-only card 58 shipped; read both, and read
`docs/top-event-probe.md` for the measurements. The first home slot mounts the player muted, without a click.

The measured facts you must build to: only `https://zlive.st/embed/<id>?muted=1` plays itself muted, in our shield
sandbox; taifood ignores every mute parameter and stays paused; neither provider accepts `postMessage`, so the
only mute control is the URL; zlive runs about 1.3 MB/s; the sound is opt-in on tap and zlive only. No provider
page is ever described as ours.

## Selection

`app/pages/index.vue` `heroEntry` (around line 95) currently takes the highest-viewed live event. Change only the
live branch: **highest-viewed live event whose resolved sources contain a zlive embed** (main iframe, any
substream, or any supplement source — reuse the existing source identity helpers, do not string-match ad hoc),
then highest-viewed live event, then the existing 24/7, upcoming and archive branches unchanged. It must be a
pure, unit-tested function with fixtures: zlive-bearing lower-viewer event beats a higher-viewed taifood-only one;
no zlive anywhere falls back to highest viewers; nothing live reaches the soonest kickoff.

If the chosen live event has no zlive source, the frame still mounts, paused, and **nothing else about the slot
changes** — no special copy, no different sizing, no error state.

## Layout and link split (rule 27)

A matched card is a banner plate at the top and, for the hero only, a reserved 16:9 player box under it. The two
are siblings in the card; the link wraps the plate and the `sr-only` label stays on it, so the entry point keeps
its accessible name. The player box keeps its height before the frame mounts, while it is mounted and after it
unmounts, so the plate never moves. Square corners on the player inside the card radius, full-bleed; the card
grows by the box when it is a hero and does not grow again.

## Mounting

Mount the frame when all hold: the event is live by our clock, its source is zlive, the player box intersects the
viewport, the tab is visible, and `navigator.connection.saveData` is not set. Unmount on leaving the viewport or
hiding the tab, because we cannot pause the stream. In-viewport and visibility are both required; unmount is
immediate on either false. Do not autoplay the frame for a non-live hero, but do load it paused.

Frame attributes: our existing shield sandbox and `allow="autoplay; fullscreen; picture-in-picture"`. URL is the
zlive embed with `?muted=1` appended correctly regardless of existing query. Sound control: a `min-h-11` button in
the plate's bottom row, beside the viewers, outside both link and frame, shown only for zlive; its handler remounts
the frame without `muted` inside the gesture (bump a key), and its label flips between "Sound on" and "Muted".
Never overlay the provider's controls.

Autoplay is **not** the rule-22 money click; the click-under stays the first source click on the event page. Do
not add an ad above the player; the existing `AdSlot` stays below the hero.

## Proof

Unit: selection fixtures above; URL mutation that keeps existing queries and appends `muted=1` once; saveData and
visibility logic where extractable.

Browser (add a suite, run at 320/390/1280): intercept the zlive embed and the provider feed so the fixture is
stable, then assert — muted URL in the frame `src`; frame present at load; frame gone after scrolling the hero out;
frame gone when the tab hides (`page.evaluate` visibility change or a second tab) and back when it returns; sound
button only on a zlive hero and absent for a taifood hero; after tapping it the frame remounts without `muted`;
player box height identical before mount, after mount and after unmount; the link box excludes the player and still
reaches the event page; the plate is still the whole width of the card and still passes the 58 card assertions
(banner equals card width, graphemes single, no overflow). Prove the suite can fail: mutate the `muted=1` append
away and show it red.

Gate: 189+ tests, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild,
`pnpm exec wrangler deploy --dry-run`, and all browser suites at 320/390/1024/1280 where covered, the new suite
included. `.env` must say `NUXT_PUBLIC_FEED_BASE=/api/feed`. Commit, don't deploy, don't touch `.prompts` or
`DECISIONS.md`. Write the measurements into `docs/redesign-55.md`.
