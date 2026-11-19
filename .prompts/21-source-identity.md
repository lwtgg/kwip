# Task 21 — source identity

Every source in the feed is named `External Player Frame`. Open the player picker with two sources and you see the same words twice. The useful identity is the host plus path; quality and broadcaster live on the substream. Make the label say something true, and keep the URL as the identity so a second host does not collapse the list.

Read `.agents/skills/kwip-conventions/SKILL.md` first.

## Behaviour

- One new util `app/utils/sourceIdentity.ts`:
  - `sourceKey(url: string): string` — host plus pathname, lowercased, no scheme, no trailing slash. Unparseable URL returns the raw string.
  - `sourceLabel(source, index): string` — human label: the substream-derived name when the provider gave one, otherwise the host's registrable name. Never the literal `External Player Frame`. Always suffixed with position when the label would otherwise repeat, e.g. `Prime Video · HD · 2`.
  - `sourceHost(url: string): string` — bare host, for a small muted host line.
- `usePlayerSources` emits `label`, `url`, `kind`, plus `host` and `key`.
- The picker chip keeps its current accessible name, now the real label, and gains a screen-reader-only host so two sources from one host are still distinguishable by ear.
- Deduplicate by `sourceKey` after normalising, keeping the first occurrence in chain order. A duplicate must not consume a tab stop.
- No change to chain order, failover, the shield, or `PlayerFrame`.

## Rules

- No dependency. Client-safe only: these run in the browser and at build.
- Do not touch `server/**`, `nuxt.config.ts`, `public/feed-cache/**`, or `useFeedFreshness.ts`.
- `public/fixtures/**` may change where a fixture needs a second host to exercise the behaviour; say which file and why in the reply.
- `useFeed.ts`: the only permitted edit is inside the substream flattening, so the substream name+tag survives as separate fields rather than pre-joined with ` · `. Keep the existing combined form working for anything already reading it.
- Tokens only, no literals for colour or spacing. Chips stay 44 px at `sm` and below.

Stop condition: `pnpm build`, `pnpm test`, `wrangler deploy --dry-run` pass; with a fixture containing two sources on the same host plus one on another, labels are unique and readable, the host line shows, duplicate URLs collapse to one chip, arrow-key roving still keeps focus on the chip across a remount, and 390 px has no overflow. Reply with files, outcomes and what you checked.
