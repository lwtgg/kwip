# Task 36: a genuinely missing event is a 404 again

`/live/nba/2026-11-20/nope`, `/live/nope` and `/vods/nope` all return 200 on production. On `main` before task 34 they returned 404. The event pages use the error's `snapshotUnavailable` flag as permission to keep 200 so an unreadable generation does not look like a missing event — but the composable sets `snapshotUnavailable` for every endpoint it cannot resolve, including one that a *readable* snapshot deliberately omitted, where the omission is authoritative under rule 20.

So: a readable snapshot that omits the event must 404. Only a generation that could not be read may keep 200.

Read `app/composables/useFeed.ts` (the `snapshotUnavailable` / `snapshotOmitted` pair), `app/pages/live/[...uri].vue:562` and `app/pages/vods/[slug].vue:230` first.

## Requirements

1. Narrow the escape hatch on both pages so it holds only when the snapshot was genuinely unavailable, not when it answered and omitted the entry. Express it once in the composable rather than duplicating the boolean logic in two pages.
2. Keep everything task 34 earned: an unreadable generation (stalled R2, every hop failing) still renders 200 with the fallback or seed rather than 404.
3. Keep the hydration guard that avoids a pointless client refresh for an omitted entry unchanged.

## Tests

- Unit: a readable generation that omits the event produces the 404 decision; an unreadable one does not.
- Browser, in the existing harness style: `/live/<missing>`, `/vods/<missing>` return 404 locally, and the stalled-R2 cases still return 200.

## Gates

`pnpm test`, `pnpm build`, `wrangler deploy --dry-run`, all three Playwright suites. Do not deploy; ads stay off.
