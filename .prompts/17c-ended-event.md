# Task 17c — say when an event has ended, and point at the replay

A page for an event that finished an hour ago still looks exactly like a live page: the frame sits there showing the provider's poster or a black box, the status pill says "Ended", and nothing tells the visitor the obvious next step.

## Behaviour

- On `app/pages/live/[...uri].vue`, when `detail` is ended (`always_live === 0`, `ends_at > 0`, and the ticking `nowSeconds >= ends_at`), render a compact notice strip directly above the player frame, below the source chips row.
- Copy: "This event has ended." plus either a link "Watch the replay" to `/vods/${uri_name}` while the archive lists it, or the sentence "Replays usually appear shortly after the final whistle." while it does not.
- The strip looks like the existing shield explanation line: `text-xs text-muted`, on a hairline top border, full width. The replay link is `text-fg underline hover:text-accent` with a 44 px tap height at `sm` and below.
- Only the `useVods()` result is consulted, and only while ended: instantiate it lazily or gate the render so a live page does not fetch the archive. The replay link appears as soon as the archive answers; the "usually appear" sentence is what renders until then and when there is no match.
- The frame stays mounted below the strip and keeps its current detection behaviour: ended pages do not unload the player.
- Server-rendered: the ended sentence is in the SSR HTML, never a client-only flash.

## Rules

- No new dependency, no new route, no new component file, no other copy.
- Do not touch `PlayerFrame.vue`, the shield, the source chips, `app/composables/useFeed.ts` (beyond reading `useVods`), `server/**`, or the logo.
- A 24/7 channel (`always_live === 1`) never shows the strip.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, and on a deliberately ended fixture event the strip renders in the SSR HTML with the fallback sentence, the replay link appears when the VOD list contains the slug, a live event and a 24/7 channel show no strip, and 390 px has no overflow. Reply with files, outcomes, and what you checked.
