# Task 17b — a branded error page for the fatal 404s

`app/pages/live/[...uri].vue` and `app/pages/vods/[slug].vue` both `throw createError({ statusCode: 404, fatal: true })` for an unknown slug. There is no `app/error.vue`, so the visitor gets Nuxt's bare "404 / Server Error / Go back home" — visible text, none of the house style, no route back that makes sense.

Build the error page properly and let it pause the 404 where it lands.

## Behaviour

- New `not-found` variant on `app/components/StateBlock.vue`: reuse the existing circled-slash glyph and its CSS, default message "That event is not listed any more.", and instead of Retry a `NuxtLink` to `/` labelled "All events" (same button geometry as Retry).
- New `app/error.vue`: reads `useError()`. Renders the site shell through `NuxtLayout`, an `h1` of "Page not found" for 404 and "Something went wrong" for anything else, then a `StateBlock`: `not-found` for 404, `error` for other statuses with a Retry that calls `clearError({ redirect: '/' })`.
- `useSeoMeta({ robots: 'noindex' })` on the error page and a document title of the same text as the `h1`.
- Keep the status code: do not convert the thrown 404 into a 200. A 5xx stays 5xx.
- 44 px tap targets and no horizontal overflow at 390 px.

## Rules

- No new dependency, no new route file beyond `app/error.vue`, no copy beyond what is above.
- Do not touch `app/pages/live/**`, `app/pages/vods/**`, the error variants already in `StateBlock`, `app/composables/**`, `app/utils/**`, or the logo.
- The error page must still work when the feed is unavailable: it must not call `useStreams()`.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, `/live/nope/nope` returns HTTP 404 and renders the branded page with the glyph and the "All events" link, an unmatched top-level path does the same, `robots` is `noindex`, the page renders with the feed blocked, and 390 px has no overflow. Reply with files, outcomes, and what you checked.
