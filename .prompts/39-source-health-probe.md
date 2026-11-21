# Task 39: probe source health at snapshot time

`docs/sourcing-research.md` §4 measured what actually tells a dead embed from a live one, and ranked it
"do next" #2: a per-host registry plus one probe per source at snapshot time, so a red host is known
before the visitor picks it. Today failover has nothing to fail over to and nothing to rank on — every
source is an unlabelled equal, and only the browser's own timeout remembers a bad one, for that session.

Build that probe, carry the result with the generation, and let it order and badge the picker. Nothing
here hosts or proxies media: every check is a plain `fetch` at the host's own URLs, on the runner that
already publishes snapshots.

Read `docs/sourcing-research.md` (§2, §3, §4, "Do next"), `scripts/snapshot-feed.mjs`,
`server/utils/snapshot.ts`, `server/utils/feed.ts`, `app/utils/sourceHealth.ts`,
`app/utils/sourceIdentity.ts`, `app/composables/usePlayerSources.ts` and `app/pages/live/[...uri].vue`.
Read `writing-plans`, `workers-best-practices` and `kwip-budgets`.

## Scope

1. **Host registry, as data.** A table keyed by host: URL shape it accepts, the body markers that prove
   an embed page is real, and a per-host concurrency. Seed it with what §3 already verified — the
   taifood path, the strmfree hosts and token map, and `embed.st` marked unverified — and leave unknown
   hosts unprobed rather than guessed at. Adding a host is a row, not a branch.
2. **The probe.** In the snapshot publisher, after details are fetched: collect the distinct source URLs
   on registered hosts, restrict to events starting within −30 min…+3 h and exclude 24/7, then probe
   with a 3 s budget per hop, at most 2 in flight per host and 40 sources per run. A probe is: embed
   `GET` → 200 and markers present → parse the token map → manifest `GET` → 200 and
   `application/vnd.apple.mpegurl` → sample `EXT-X-MEDIA-SEQUENCE` twice 6 s apart. Record
   `embedOk`, `manifestOk`, `sequence` (`advancing` / `frozen` / `unknown`), `segmentMs` where measured,
   `checkedAt`, and a short error tag. One failing source never fails the snapshot.
3. **Carry it on the generation.** Publish a `health.json` endpoint in the same snapshot manifest
   (same concatenated payload, its own endpoint entry), keyed by the existing `sourceKey`, so it lives
   and dies with the generation it describes. Add a reader path for it; a missing or unparsable
   `health.json` is "unknown health", never an error, never a 404, never `snapshotUnavailable`.
4. **Use it, gently.** Health is a tiebreak *after* quality band and locale and *before* viewer count;
   an `embedOk: false` source sinks below equally ranked peers and shows a `degraded` chip, but stays
   selectable and stays linked. Absent health leaves today's order untouched. Never remove a source
   because of it, and never let health delay a page render.
5. **Do not regress.** No new dependency, no proxy, no `<video>`, no change to the feed payloads
   themselves, no probe against the Worker, and no cache-key or TTL change. The publisher stays usable
   locally with the fixture base (no probes there, since there is no host to reach).

## Verification

- Run the probe from this machine against live hosts and report the table: which sources came back
  `embedOk`, which 404'd, which manifest-froze, and what the token and manifest parsing did on a real
  page. Quote real responses, not fixtures.
- A real published snapshot (preview bucket) carries a parseable `health.json` keyed by `sourceKey`, and
  the page renders a `degraded` chip from it: screenshot it in `/tmp`, 390 px and 1280 px.
- With `health.json` removed, ordering and the picker are byte-identical to today; prove it with a diff.
- `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, `wrangler deploy --dry-run`, plus
  the click-under, source-health and density browser suites.

Report the probe table, the screenshot paths, the identity diff, and the verification output. Do not
deploy the Worker and do not touch the ad flag.
