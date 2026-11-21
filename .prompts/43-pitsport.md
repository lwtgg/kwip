# Task 43: test PitSport as a third source, then wire it if it holds up

Task 42 settled the host list except one live lead: `pitsport.st`. Its `/api/v1/home` returns
`programId` + `slug` for live and upcoming events, and the slugs are team-shaped
(`napoli-vs-torino`, `portland-trail-blazers-at-new-york-knicks`) against our own events. Its player
route sent no framing headers. That is the only remaining host that needs no key and no new account, and
the only one that could give a third CDN behind the picker.

Answer the two questions that decide it, in this order, and stop early if either fails.

Read `docs/sourcing-research.md` (the 2026-11-21 host checks), `scripts/publish-supplements.mjs`,
`scripts/collect-publish-feed.mjs`, `app/utils/supplementMatch.ts` and `scripts/probe-source-health.mjs`.
Read `webapp-testing`, `verification-before-completion`, `workers-best-practices`.

## Gate 1 — does it actually frame?

Load a real `/programs/<id>/play` page in a browser from this machine, not curl alone. Report the
response headers, whether the frame renders a player or a blocked body, and whether playback starts.
Verify two live programs. Full Chromium played Napoli vs Torino (`103176`) and Real Madrid vs Celta
Vigo (`103172`) cross-origin under the default, `origin`, and `no-referrer` policies with the sandbox
attribute absent. Both play pages returned HTTP 200 without `X-Frame-Options` or
`Content-Security-Policy` headers. PitSport's public catalogues exposed no 24/7 program, so 24/7
playback remains unverified and is outside this gate.
Stop if the live programs fail to frame and play or require a referrer from the embedding page.

## Gate 2 — does it match enough to matter?

Pull `/api/v1/home` and score its live and upcoming slugs against the current snapshot's events using the
same team/window rules the supplement matcher already uses. Report matched events out of total, per
competition, and the false-positive rate on a sample you check by hand.

**Task 43 coverage waiver.** The one-third live coverage threshold is waived for PitSport. It matched
2 of 21 live and 5 of 89 upcoming events. All seven matches agreed with the teams and kickoff times
on manual review, for 0 of 7 false positives. The volume is low and the publisher appends only
matched sources while preserving the existing source list for every event.

If both gates pass, wire it:

1. **Match, don't guess ids.** Resolve by slug against the catalogue we already fetch, using the existing
   rules and window. Never construct a `programId`.
2. **Publisher side only.** Merge into the detail payloads the way supplements already are, with
   `origin: 'pitsport'`, a quality band from their label, and their own name as the label; collapse their
   `-hd-spanish` variant programs into one event's sources rather than four separate events. Never reorder
   or drop an existing source, and no duplicate `sourceKey`.
3. **Failures stay inert.** One catalogue GET per run, bounded, no retry loop, skip on error; the payload
   is unchanged when the provider is down.
4. **Probe them.** Add `pitsport.st` and its declared embed origin (`embdlol.st`) to the registry as
   verified rows only if the markers are real, and let the existing caps cover them.
5. **Browser unchanged.** No new client fetch path: these arrive through the generation like supplements.

## Verification

The gate evidence quoted from real responses, the match table, a real preview-bucket publish quoting the
merged payload, a browser check at 390 and 1280 px that a PitSport source lists, ranks in band, selects
and plays, and the full gate (`pnpm test`, both preset builds, `wrangler deploy --dry-run`, and all five
browser suites). No dependency, no deploy, ad flag untouched.

Report the gate verdicts first, then either the integration evidence or why it stops.
