# Task 52 — team, logo and score enrichment

The owner is replacing the provider thumbnail with our own artwork: a two-team gradient, both team logos and
the live score. This task is the data half. Nothing renders yet; the UI tasks (53, 54) consume what lands
here. Read `DECISIONS.md` 24 and 25 first, and `docs/redesign-52.md` for the mockup spec.

Branch `task/52-scores` off `main`.

## Source

ESPN's public scoreboard JSON, no key:

`https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard`

It carries, per event: both competitors with `homeAway`, `team.displayName`, `team.abbreviation`,
`team.color` (hex without `#`), `team.logo`, their `score`, and `status.type.state` (`pre`/`in`/`post`) plus
`status.type.description` and `status.displayClock`. Team orders in our feed are not reliable (soccer is
home-first, basketball away-first), so **the side comes from `homeAway` and nothing else**.

League map from our feed's `tag`, only the tags we actually carry:

| tag | path |
|---|---|
| NFL | football/nfl |
| College Football | football/college-football |
| NBA | basketball/nba |
| College Basketball | basketball/mens-college-basketball |
| Champions League | soccer/uefa.champions |
| Europa League | soccer/uefa.europa |
| Conference League | soccer/uefa.europa.conf |
| Premier League | soccer/eng.1 |
| LaLiga | soccer/esp.1 |
| Serie A | soccer/ita.1 |
| Bundesliga | soccer/ger.1 |
| Ligue 1 | soccer/fra.1 |
| Eredivisie | soccer/ned.1 |
| MLS | soccer/usa.1 |
| Allsvenskan | soccer/swe.1 |
| NHL | hockey/nhl |

Verify each path returns 200 with events (or a legitimate empty list) before wiring it; correct any that 404.
24/7 channels, cricket, tennis and wrestling have no scoreboard and must stay untouched.

## Feed contract

Add one optional field to a stream item:

```json
"match": {
  "state": "in",                       // "pre" | "in" | "post"
  "detail": "Q3 7:42",                 // ≤ 24 chars: clock, "Halftime", "Final", ""
  "away": { "name": "Colorado State Rams", "abbreviation": "CSU", "color": "#024b23", "logo": "https://a.espncdn.com/…png", "score": 50 },
  "home": { "name": "Arizona Wildcats", "abbreviation": "ARIZ", "color": "#ca0032", "logo": "https://a.espncdn.com/…png", "score": 97 }
}
```

`color` is normalised to `#rrggbb`; `score` is an integer or `null` (`null` in `pre`); `logo` is `null` if the
provider gives nothing; `name` falls back to our own fixture name's side when the provider has none.

- Add `match` to `streamFields` in `server/utils/snapshot.ts` so it survives compaction, and validate it in
  `validateDisplayFields`: state in the set, `detail` string ≤ 24, each side an object with a `name` string
  ≤ 60, `abbreviation` ≤ 5, `color` matching `/^#[0-9a-f]{6}$/i` or `null`, `logo` an https URL or `null`,
  `score` an integer 0–999 or `null`. Anything else rejects the generation as it does today.
- Add `match` and a `MatchSide` type to `FeedStreamItem` in `app/composables/useFeed.ts`. Do not change any
  existing field's type; `poster` and `blurhash` stay in the contract for the UI task to stop reading.
- The fixture feed (`public/fixtures`) must keep working untouched.

## Matching

New `scripts/scoreboard.mjs`, imported by `scripts/collect-publish-feed.mjs` and unit-tested on its own.

- One request per league per run, not per event. Cap at 3 in flight, and give the whole step a deadline
  slice inside the existing run budget; a league that misses the slice is simply absent.
- Match an event only when both normalised team names match a single competition in that league, and the
  competition's date is within 36 h of the event's `starts_at` (or of the event's own date when
  `starts_at` is 0). Both sides must match; a one-sided match is dropped rather than trusted.
- Normalise for matching (lowercase, strip diacritics and punctuation, collapse spaces, drop a leading
  "fc"/"afc"/"cf " and a trailing "fc" for soccer) but publish the provider's `displayName` verbatim.
- One competition may match only one event; on ambiguity take the closest date and leave the other event
  unmatched.
- Enrich only `always_live === 0` events whose name contains " vs. ", " vs " or " at ".
- A league request failing, returning non-200 or unparseable JSON leaves every event in that league without
  `match`; it must never fail the run.
- Count the requests in `providerRequests` and log a `scores` summary beside the existing `zlive` one
  (`{ leagues, requests, matched, unmatched }`), so a dead source is visible without another run.

## Tests

`tests/scoreboard.test.ts` under the existing `pnpm test`:

- normalisation and the leading/trailing club-affix stripping;
- side order proven from `homeAway` when our name order is reversed, and from the provider when ours is
  home-first;
- a one-sided team match yields no `match`; two competitions in one league disambiguate by date;
- an event 3 days out stays unmatched;
- an invalid colour, a non-https logo and a non-integer score each drop just that field, not the item;
- a 404 league or malformed JSON leaves the item untouched and the run continues;
- the request count equals the number of distinct leagues present, once each.

## Gate

`pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, `wrangler deploy --dry-run`.
Report the scoreboard paths you verified, the request count your run would add, and any league you had to
correct. Commit when green. Do not deploy, do not touch `.prompts`, `DECISIONS.md` or any component.
