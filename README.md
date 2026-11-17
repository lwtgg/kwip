# MatchDeck

A directory for live sports events. Video is a third-party iframe embed; this repo hosts no media.

Stack: Nuxt 3 (SSR on), Tailwind v4, deployed to Cloudflare Workers.

Read `SPEC.md`, `DECISIONS.md` and `API.md` before changing anything. Facts about the outside world live in `API.md` — take them as given and don't re-derive them.

- `SPEC.md` — what exists, page by page
- `DECISIONS.md` — settled choices, numbered, do not relitigate
- `API.md` — the external JSON feed we consume
- `CONTRACT.md` — which files each agent owns
- `INFRA.md` — hosting, domains, deploy
- `.prompts/` — the brief for the current task
