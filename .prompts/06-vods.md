# Task 06 — VOD routes (Agent A)

Stop condition: `pnpm build` exits 0, `/vods` renders the fixture entry, and `/vods/hou-mia-full-replay` renders its native player. Nothing else counts as done.

`SPEC.md` is thin here, so: `/vods` is the archive index — same card and rail components as the home page, one rail per category, `useVods()`. `/vods/[slug].vue` is the detail — `useVod(slug)`, breadcrumb, title, `tag`, `event_date` and view count, then the player.

Player rules for VOD: `/vods/{slug}` returns `source: { type, data }`. When `type === "playlist"` render `<video controls playsinline>` with `data` and no iframe, so a native HLS browser plays it; alongside it show the "use Safari or an HLS-capable browser if it won't play" note. Any other `type` goes through the same iframe/outbound split as the live page. `recommended_vods` renders as a rail when non-empty.

Both routes need all four states from `SPEC.md`, `useSeoMeta`, and the `/vods` entry in the existing sitemap already resolves.

Your glob is unchanged: no `useFeed.ts`, no `server/**`, no `nuxt.config.ts`. First action is a tool call. Reply with changed files, the build exit code, and the two curls.
