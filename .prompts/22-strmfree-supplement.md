# Task 22 — strmfree as a second source

One provider means one host and one CDN. `strmfree.pk` is a second, independent one with a public API, `access-control-allow-origin: *`, and framing on `ALLOWALL`. Add its sources to live events that also exist there, after our provider's own sources, so failover has somewhere real to go.

Read `.agents/skills/kwip-conventions/SKILL.md` first.

## What the API gives

`GET https://strmfree.pk/api/v1/streams` → `{ count, streams[] }`. Each stream: `name` ("Detroit Pistons vs New Orleans Pelicans"), `category`, `league`, `stream_key`, `match_timestamp` (unix start), `iframe` (main embed), `additional_sources[]` of `{ quality: SD|HD|FHD|4K, url, live }`, `viewers`.

It lists **live only**: entries appear shortly before a match and disappear after. No end time. A detail fetch 404s once it is over. Its docs ask to cache and not poll per page load.

## The supplement state machine — follow this exactly

Per event, per page load. A single object, not scattered flags:

- `idle` → nothing fetched yet. Only live events with `ends_at` in the future and no `?source=` pointing at a supplement start here.
- `loading` → one request in flight. A second trigger is ignored.
- `merged` → matched, sources appended. Terminal until reload.
- `none` → fetched, no match. Terminal until reload.
- `error` → fetch failed or threw. Terminal until reload.

Transitions: `idle→loading` on mount for an eligible live event. `loading→merged|none|error` on settle. Nothing else moves except the whole object resetting on the "Reload player" action in the help row, which returns it to `idle`.

Persistence: keep the last `merged` payload in `sessionStorage` under `supplement:<uriName>` with its fetch time. If it is under 10 minutes old on mount, go straight to `merged` without a request. Write only on `merged`. A stale entry is treated as absent.

## Matching

Only accept a match where all hold:

- both sides normalise to the same two team tokens, order-insensitive, after stripping punctuation, accents, "vs", "at", "v", and common club noise (`FC`, `AFC`, `CF`, `SC`)
- `match_timestamp` is within 3 hours of our `starts_at`
- the strmfree `category` maps to our category slug through a fixed table (`basketball→basketball`, `football→american-football`, `soccer→football`, `hockey→hockey`, `tennis→tennis`, `cricket→cricket`, `racing→motorsport`, `combat→boxing`), and the map is used only to break token ties, never to match a team-less event

No match on one token alone. No fuzzy scoring, no best-guess fallback.

## Sources

Whitelist hosts: only accept an `iframe` or `additional_sources[].url` whose host ends in `strmfree.st`, `streamfree.top` or `strmfree.pk`. Drop anything else.

Append after the provider's sources, order: `4K`, `FHD`, `HD`, `SD`, then by `live` desc, then original order. `quality` becomes the `sourceTag`; leave the substream name empty so the existing label falls back to the host. `default: false` always. Mark each with `origin: 'supplement'` for the picker and for the failover copy.

Dedupe runs after the append, so one URL listed by both providers collapses to one chip.

## Copy and picker

- A supplement chip carries a small `2nd` marker, `aria-label` suffix "second provider", so its origin is obvious but quiet.
- When a supplement has `live: false`, it still appears and its chip gets the muted "not live yet" treatment the picker already uses for links. It is still selectable.
- Nothing else in the picker changes.

## Rules

- Browser fetch only. No server change, no snapshot change, no dependency.
- `public/fixtures/**` may change; a fixture stream that matches the match rules is required so the merge is testable offline.
- Do not touch `useFeedFreshness.ts`, `PlayerFrame.vue`, `server/**`, `nuxt.config.ts`.
- Tokens only. The `2nd` marker must not shift chip height at `sm` and below.

Stop condition: `pnpm build`, `pnpm test`, `wrangler deploy --dry-run` pass. With the fixture: a match appends in quality order with `2nd` markers, a non-match leaves the picker unchanged, a 500 from the API is `error` and silent, a second mount inside 10 minutes does not refetch, `sessionStorage` holds one entry per event and none on `none`/`error`, the failover chain includes supplements, 390 px has no overflow, and a supplement that 404s during failover advances to the next source. Reply with files, outcomes and what you checked.

## Commit note

Record in the commit message: the second provider, that matching is strict token equality plus a start-time window, and that any supplement source is excluded from the URL until picked so existing shared links keep resolving to the provider's own order.
