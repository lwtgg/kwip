# Brief — task 61: a banner for every event, not just the provider's

Owner: "a lot of them are missing the new banners. Also the long banners are missing the new design too."

Both are the same cause. `StreamCard.vue:85` renders `MatchBanner` only when the feed supplies a `match` object, and
the provider supplies one for 85 of 210 live rows. The other 125 fall back to the old poster-plus-text card, and at
1280 that is exactly the first three wide `Next up` rows — 1232 × 102 rows of poster where the design should be.

Of those 125, **106 are events whose name already carries the matchup** (`"Miami Heat vs. Philadelphia 76ers"`,
`"Boise State Broncos at Colorado State Rams"`) and **19 are channels** (`NFL Network`, `24/7 South Park`, `AEW
Wednesday Night Dynamite`). So the rule is exact and cheap: an event gets a banner with the identity its name
contains, and a channel keeps its poster.

## Identity derivation

- New pure util, `app/utils/matchIdentity.ts`, exporting `deriveMatch(stream)` returning the existing
  `FeedStreamItem['match']` shape or `undefined`.
- Split `name` on the first `/\s+(?:vs\.?|v\.?|@|at)\s+/i`. Both sides trimmed, non-empty, neither longer than 48
  characters. Keep the matched separator on the result (`vs.` stays `vs.`, `at` and `@` stay `at`/`@`) so the
  label reads the event's own words: add an optional `separator?: string` to the match type and use it in
  `matchBannerContent` with the current `' vs '` as the default.
- `always_live === 1` never derives — a channel is a channel.
- State from the window, not from the name: `now < starts_at` → `pre`, inside the window → `in`, past `ends_at` →
  `post`. Missing or nonsense window (`starts_at <= 0`, `ends_at <= starts_at`) → `pre` when the start is future,
  otherwise `in`. Not stale-dependent; stale keeps the derived state and the banner already qualifies the card.
- `detail` is `'vs'` for `pre` and `''` otherwise. Scores `null`, `abbreviation` `''` so the existing initials
  fallback fills the plate, `color` `null`, `logo` `null`.
- A provider `match` always wins; derivation only fills the gap. Do not write derived identities into the feed.

## Wiring

- `StreamCard.vue` resolves the effective match once (`stream.match ?? deriveMatch(stream)`) and uses it for the
  banner, the tint and the label. The `sr-only` label, `matchFacts` and the link name stay as they are today.
- The event page needs the same resolution for 50b's identity block: export it from a place both pages can import,
  and use the effective match there too, so a matched-by-name event page is not blank while its card has a banner.
- Check the `/vods` path as well: derived identities must render sanely there and a replay must not read as a live
  event.

## Tests

- Unit: `vs`, `vs.`, `v`, `v.`, `@`, `at`, mixed case, extra spaces, a side longer than 48 chars (no derive), no
  separator (no derive), `always_live === 1` (no derive), a name with three separators (first one wins), a provider
  `match` present (untouched).
- Unit: state derivation across the three windows and the two malformed ones.
- Browser: every card on the homepage either has `.match-banner` or is an `always_live` channel — assert the set is
  exactly the events (no poster card remains for a name with a separator), at 320 and 1280.
- Accessibility: a derived banner's link name reads the two team names, the state and the viewers, and the exact
  count is present; a channel card's name is unchanged.
- Red control: make `deriveMatch` return `undefined` and show the coverage assertion fail.
- All 58 assertions still hold with derived identities, including the grapheme and fit floors; the initials plate
  must not overflow the logo box for a long team name (`"Paris Saint-Germain"`).

## Gate

`pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run, every suite at
320/390/1024/1280. Never build while a Worker serves. Commit, do not deploy, do not touch `.prompts` or
`DECISIONS.md`. Record the coverage counts before and after in `docs/redesign-61.md`.
