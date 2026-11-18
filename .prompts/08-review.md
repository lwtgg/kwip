# Task 08 — cold review

Read-only. Do not fix anything, do not commit. Report findings only.

The app is feature-complete on `main`. Read `SPEC.md`, `DECISIONS.md`, `CONTRACT.md`, then review `app/**`, `server/**`, `nuxt.config.ts` against them.

Look for, in this order:

1. **Rule breaks** — any violation of `DECISIONS.md` 1-16, especially a literal hostname or site name in a component, a feed fetch outside `useFeed.ts`, a component editing another's glob, missing canonical/`og:url`, an unguarded `/api` cache.
2. **Unreachable states** — a SPEC state that can't actually render: skeleton never shown, error path swallowed, stale banner wired to nothing, retry that doesn't refetch, auto-advance that stalls when the chain is a single source.
3. **Correctness against the feed shapes** in `API.md` — `always_live`, `starts_at`/`ends_at` zero values, missing `poster`, empty `data`, `substreams` ordering, `{host}` tokens.
4. **A11y and reduced motion** — focus order, iframe and select labelling, rails keyboard reachable, pulse/crossfade under `prefers-reduced-motion`.
5. **SEO** — canonical correctness on mirror hosts, one `h1` per page, description present on every route, JSON-LD shape and validity.

Output a numbered list: `file:line`, what's wrong, which SPEC/DECISIONS line it breaks, and severity (`blocker` / `should` / `nit`). No praise section, no rewrite suggestions beyond one clause. If a section is clean, say so in one line.
