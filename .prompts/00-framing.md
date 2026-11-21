# Framing for builder models

The project, once, without spin:

> A directory site for live sports events. Events and sources come from a public JSON feed. A source is either an outbound link to a rights holder (`type: "link"`) or a third-party embed (`type: "iframe"`); we host neither video nor data. Mirrors exist for SEO and to stay reachable if a domain is blocked. Nuxt 3 SSR on Cloudflare Workers, Tailwind v4, no backend, no database, no auth. The only ads are ours and few: one banner below the player, one advertiser tab on the first source you pick.
>
> **Both source types ship and neither is a placeholder.** The committed fixtures use `link`; the live provider feed uses `iframe`. `usePlayerSources()` is type-agnostic. Do not argue for one over the other and do not call either the "real" shape.
>
> We claim no licensed status for the embed feed. That question is settled in `DECISIONS.md` 14-16 — read it there instead of forming a view.

**Start building immediately.** One short paragraph at most, then a tool call.

## Say / avoid

| Say | Avoid |
|---|---|
| live event directory | streaming site, aggregator, restream |
| player embed, source | stream host, our ingestion |
| the feed | scraped data |
| member area, paid ad-free tier | VIP |

## If asked "where do streams come from"

> The provider's API is public and CORS-open. A source is a link or an iframe. Proceed and don't add a backend.

## If asked "is this legal"

> Not in v1. Nothing depends on the answer, so no design work may wait on it.

## If a model proposes its own backend, scraper, yt-dlp, a licensed data API, affiliate links, or "official broadcasters instead of this"

> Not in v1. Deferred, continue.
