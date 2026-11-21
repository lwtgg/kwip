# Task 35: the compact-layout button does something, and looks like itself

A user reports the top-right button "does nothing". It is not broken: it flips `data-density`, sets the cookie, persists across reload and changes the tokens. But on the page type people actually use it moves the document by 14 px out of 1 470 (measured at 1280 on `/live/247-willow`), and on a short category page by 0. On the homepage it drops 1 045 px of a 15 083 px document and on `/vods` 113 px, so it is only felt where there is a grid.

Two things are wrong. The oblique part is that compact has nothing to compress on an event page. The other part is that the glyph is three stacked lines, which every user reads as a menu — and there is no menu, because the category bar is already inline at every width.

Read `app/layouts/default.vue`, `app/composables/useDensity.ts`, `app/assets/css/theme.css` and `app/pages/live/[...uri].vue` before starting. Tokens only; no new dependency.

## Requirements

1. **Compact must be felt on the event page.** Its vertical rhythm runs on literals (`space-y-8` on the page container, section and hero padding). Move that rhythm onto a token pair, comfortable by default and tighter under `[data-density='compact']`, and consume it on the event page, the VOD page and the category pages. Target a shift of roughly a tenth of the document on a populated event page, not 1 %.

2. **Do not shrink targets.** The 44 px minimum tap height, the player box and the banner slots keep their size; density moves whitespace, not controls or media.

3. **Make the glyph read as density.** It must stop looking like a menu: two rows at different spacing, or a rectangle with tighter lines, and the label changes with state ("Compact layout" / "Comfortable layout"), `aria-pressed` kept, `title` kept. The `title` stays the *action*, the label the state.

4. **Say why in the code.** One comment on the token pair naming it as density, not spacing.

5. **Persist and survive.** Compact must still hold across a reload and across a navigation, and must never flash the other mode during hydration.

## Tests

- Browser (`tests/density_browser.py`, mirroring `tests/banner_browser.py`'s harness, or extend `tests/sourceHealth_browser.py` if it already spins a Worker): at 390 and 1280 on one event page, one VOD page and the homepage, measure document height in both states and assert compact is measurably shorter than the stated floor; assert the button's `aria-pressed` and label per state, that the cookie is set, and that a reload keeps it.
- Assert tap height stays ≥ 44 px at 390 and the player box and any banner box are the same size in both modes.

## Gates

`pnpm test`, `pnpm build`, `wrangler deploy --dry-run`, and all three existing Playwright suites. Report the measured heights per page and width. Do not deploy; leave the ads flag off.
