# Task 41: publish supplement sources, don't fetch them per visitor

`strmfree.pk` already raises the source count, but only in the browser: `loadSupplementSources` fetches the
provider after the page renders, matches by team and timestamp, and merges. Consequences: every visitor
hits the provider, the sources are invisible to SSR, and the health probe never sees them — so a supplement
can be listed, unprobed, in the same band as a probed primary.

Move the supplement merge to the publisher. The generation should already carry those sources, ranked in
their quality band, with the probe's verdict and the provider's liveness. The browser keeps its fetch only
where the generation cannot help.

Nothing here hosts media. The provider call is a plain GET from the same runner that already publishes.

Read `scripts/collect-publish-feed.mjs`, `scripts/probe-source-health.mjs`, `app/utils/strmfree.ts`,
`app/utils/sourceIdentity.ts`, `app/composables/usePlayerSources.ts`,
`app/pages/live/[...uri].vue`, `server/utils/feed.ts` and `server/utils/snapshot.ts`.
Read `writing-plans`, `workers-best-practices`, `verification-before-completion`.

## Scope

1. **Shared matching.** Pull the team/timestamp/category matching out of `app/utils/strmfree.ts` into a
   module both the app and the publisher import, without a new dependency and without changing the rules
   (3 h window, sorted team tokens, category only as a tiebreak, exactly one candidate). The app keeps the
   same exports. The host allowlist stays as it is.
2. **Fetch once, bounded.** The publisher makes one `/api/v1/streams` GET per run, under the existing
   publication deadline, with a short per-hop budget and no retry loop. A provider failure, timeout or
   unparsable body skips the merge and must not fail the snapshot.
3. **Merge at publish.** Matched sources are appended to the detail payload with `origin: 'supplement'`,
   the provider `quality` mapped to our band, `live` from a status call where one succeeds and `undefined`
   otherwise, and a readable name. Never drop or reorder an existing source. No duplicate `sourceKey` in a
   detail. The payload path and shape are otherwise unchanged.
4. **Probe them.** Supplement sources on registered hosts join `candidates()` under the same window and
   24/7 rules as primaries, so their health is published like anyone else's. Status calls are bounded: at
   most the same 40-source probe cap, and no status call for an event outside the window.
5. **Browser fallback only.** When the detail came from a generation whose source list already contains a
   supplement for that event, skip the client provider fetch and provider status call. When it does not —
   older generation, provider down at publish time, fixture base — keep today's behaviour exactly,
   including the session cache. Dedupe by `sourceKey` if both paths produce a URL.
6. **Do not regress.** No new dependency, no proxy, no `<video>`, no cache-key or TTL change, no ad change.
   The publisher stays runnable locally against the fixture base.

## Verification

- A real publish from this machine to the preview bucket, quoting the payload: which events gained
  supplement sources, their quality bands and `live` values, and the probe records they produced.
- Diff a published payload against the same payload from a run where the provider is stubbed to 503: the
  differences must be supplement entries only, nothing else moved.
- Browser proof at 390 and 1280 px that a generation-supplied supplement is listed, ranked in its band,
  selectable and probed, that a not-live one is chipped, and that with no supplement in the generation the
  old client fetch still runs.
- `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, `wrangler deploy --dry-run`, plus the
  banner, click-under, source-health, not-live and density suites.

Report the payload quotes, the stub diff, screenshot paths and the verification output. Do not deploy the
Worker and do not touch the ad flag.
