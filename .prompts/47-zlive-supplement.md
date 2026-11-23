# Task 47: carry zlive.st as a 24/7 supplement provider

`zlive.st` (listed under the live-sports section of fmhy) publishes an open, CORS-enabled channel
manifest and framable embeds. Our thinnest shelf is 24/7. Take their channels as **supplements only**:
never a default, never a primary, never a replacement for our own primaries.

Read `DECISIONS.md` rules 20 and 22, `scripts/publish-supplements.mjs`, `app/utils/supplementMatch.ts`
and the existing supplement provider before starting. The zlive merge must behave exactly like the
others: a supplemental bid joined at publish time, deduped, inert on provider failure.

## Manifest

`https://zlive.st/embed/manifest.json` — `200`, `application/json`, `access-control-allow-origin: *`,
about 67 KB, `cache-control: no-cache`, `generatedAt` present. Body: `{ count, baseUrl, channels: [{ id,
name, region, flag, quality, sport, live, url }] }`. Embeds are `https://zlive.st/embed/<id>`, `200`, no
`X-Frame-Options` and no `frame-ancestors`.

## Rules

1. One bounded GET per publish inside the existing supplement step: explicit timeout, size cap, at most
   one retry, and any failure leaves the generation exactly as it would be without zlive. Never let it
   block or fail a publish.
2. Match by channel name against our 24/7 channel names, normalised the way the existing matcher
   normalises (case, punctuation, country and quality suffixes such as `FHD`, `HD`, `UK`, `USA`,
   `Backup`, `Backup 2`). Slug match is a fallback only.
3. `live: false` channels are skipped. Band derived from `quality` (`FHD` > `HD` > unlabelled), tiebreak
   only inside a quality+locale band, same as health.
4. A channel whose name marks it a backup (`Backup`, `Backup 2`, `Backup 3`, `if X lags`) is admitted as an
   **extra source**, not as a competing bid. Label it from their `tagline` where it exists.
5. Dedupe by `sourceKey`, `origin: 'zlive'`, provider order after PitSport. Host hint `zlive.st`.
   Bounded total: a channel adds at most one primary bid plus its labelled backups.
6. Emit the embed URL as the source `uri`. Our player frames it; no proxy, no playlist parsing.
7. Chips must read `4th` alongside `2nd`/`3rd` if a fourth provider is possible on one event; check the
   chip label logic in `app/components/SourceSelect.vue` and extend the ordinal mapping rather than
   special-casing.
8. Admit only sports-relevant `sport` values (`Sports`, `F1`, plus the team-sport names we already carry)
   and skip `Kids`, `Entertainment`, `News` and `Movies`. If a perfect 24/7 channel name match is skipped
   only because of its genre, say so in a code comment instead of quietly widening the filter.
9. Their embed pulls their whole SPA (about 1.18 MB), a tracking script and Google Fonts, and their
   branding sits in the player chrome. That is acceptable for a supplement; it must not become the
   default pick on a channel that already has one of ours.

## Probe

`scripts/probe-source-health.mjs`: register `zlive.st` in the host registry with a conservative cap, and
probe `/embed/<id>` for a `200` whose body contains the player root, so a dead embed is not counted live.
Three-state semantics unchanged.

## Constraints

No dependency, no proxy, no `<video>` change, tokens only, tests for the matcher (suffix stripping, backup
detection, quality banding, dedupe, provider failure, `live:false` skip), inertness proven by a publish
with the manifest stubbed to a network error. `/tmp` fixtures only.

## Verification

Unit tests, `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, `wrangler deploy --dry-run`,
all five browser suites at both widths. One real publish into the preview bucket showing matched and
unmatched counts, and a screenshot of a matched event with a zlive chip selected, both themes. Do not
deploy, do not touch the ad flag.
