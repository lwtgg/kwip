# Brief — task 55, the top event plays itself muted

Rule 26 is the spec; read it in `DECISIONS.md` and read `docs/top-event-probe.md` for the measurements. It is the
first home slot and it mounts the player muted, without a click, when it can.

The measured facts you must build to: only `https://zlive.st/embed/<id>?muted=1` plays itself muted, in our shield
sandbox; taifood ignores every mute parameter and stays paused; neither provider accepts `postMessage`, so the
only mute control is the URL; zlive runs about 1.3 MB/s; the sound is opt-in on tap and zlive only. No provider
page should ever be described as ours.

## Selection

`app/pages/index.vue` `heroEntry` (around line 95) currently takes the highest-viewed live event. Change only the
live branch: **highest-viewed live event whose resolved sources contain a zlive embed** (main iframe, any
substream, or any supplement source — reuse the existing source identity helpers, do not string-match ad hoc),
then highest-viewed live event, then the existing 24/7, upcoming and archive branches unchanged. It must be a
pure, unit-tested function with fixtures: zlive-bearing lower-viewer event beats a higher-viewed taifood-only one;
no zlive anywhere falls back to highest viewers; nothing live reaches the soonest kickoff.

If the chosen live event has no zlive source, the frame still mounts, paused, and **nothing else about the slot
changes** — no special copy, no different sizing, no error state.

## Layout and link split

The card is currently one `<NuxtLink>` and the art box holds `MatchBanner`. Split it for the hero: the link covers
the identity column only (`card-info` → event page) and the player is a sibling in the art box, never inside the
link. Heading and the `sr-only` match label stay on the link so the accessible name of the entry point is intact.

The art box must not change size when the frame mounts. Below `64rem` it is already 16:9. At `≥64rem` the hero art
is `aspect-ratio:auto; min-height: var(--spacing-feature-art)` and a 16:9 player needs 404.3 px where the box is
320 — give the art a reserved 16:9 box at that width and let the card grow the 84.3 px (the banner state gets the
same box). Square corners on the art inside the card radius, per the owner's mockup; the title stays underlined;
abbreviations on both banner sides. Everything through `theme.css` tokens.

## Mounting

Mount the frame when all hold: the event is live by our clock, its source is zlive, the art box intersects the
viewport, the tab is visible, and `navigator.connection.saveData` is not set. Unmount on leaving the viewport or
hiding the tab, because we cannot pause the stream. In-viewport and visibility are both required; unmount is
immediate on either false. Do not autoplay the frame for a non-live hero, but do load it paused.

Frame attributes: our existing shield sandbox and `allow="autoplay; fullscreen; picture-in-picture"`. URL is the
zlive embed with `?muted=1` appended correctly regardless of existing query. Add the sound control: a
`min-h-11` button in the info column beside "Watch", outside both link and frame, shown only for zlive; its
handler remounts the frame without `muted` inside the gesture (bump a key), and its label flips to "Sound on" /
"Muted". Never overlay the provider's controls.

Autoplay is **not** the rule-22 money click; the click-under stays the first source click on the event page. Do
not add an ad above the player; the existing `AdSlot` stays below the hero.

## Proof

Unit: selection fixtures above; URL mutation that keeps existing queries and appends `muted=1` once; saveData and
visibility logic where extractable.

Browser (add a suite, run at 320/390/1280): intercept the zlive embed and the provider feed so the fixture is
stable, then assert — muted URL in the frame `src`; frame present at load; frame gone after scrolling the hero out;
frame gone when the tab hides (`page.evaluate` visibility change or a second tab) and back when it returns; sound
button only on a zlive hero and absent for a taifood hero; after tapping it the frame remounts without `muted`;
art box height identical before mount, after mount and after unmount; the link box excludes the player and still
reaches the event page. Prove the suite can fail: mutate the `muted=1` append away and show it red.

Gate: 181+ tests, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild,
`pnpm exec wrangler deploy --dry-run`, and all browser suites at both widths, the new suite included. `.env` must
say `NUXT_PUBLIC_FEED_BASE=/api/feed`. Commit, don't deploy, don't touch `.prompts` or `DECISIONS.md`. Write the
measurements into `docs/redesign-55.md`.
