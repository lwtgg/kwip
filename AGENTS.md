# kwip agent notes

A live sports event directory on Cloudflare Workers. We host no media: every player is a third-party embed we frame, every event is a link to one. Canonical host `kwip.fyi`, mirror `kwip.lol`. The ads are ours and few, and v1 needs no account.

Read `CONTRACT.md` (who may edit what), `DECISIONS.md` (binding rules), and `DESIGN.md` (the work order) before touching code. Only the orchestrator edits `DECISIONS.md`.

## Skills

`.agents/skills/` holds third-party and project skills; `.opencode/skill/` symlinks to the same folders. Codex does not discover them on its own. **Before starting, open the `SKILL.md` files your task matches — this is mandatory, not optional.**

| If your task is | Read first |
|---|---|
| any UI, markup, CSS or component work | `kwip-conventions`, `tailwind-best-practices` |
| reviewing UI, design or accessibility | `web-design-guidelines`, `frontend-design-review`, `kwip-conventions` |
| a brief, spec or plan | `writing-plans` |
| reviewing a diff | `requesting-code-review`, `verification-before-completion` |
| about to claim something is done or shipped | `verification-before-completion` |
| adding a dependency, route, image or version bump | `kwip-budgets`, `workers-best-practices` |
| user-facing copy, meta, canonical, robots, sitemap | `nuxt-seo`, `kwip-conventions` |
| verifying in a browser | `webapp-testing` |
| performance, CWV or bundle work | `web-perf`, `kwip-budgets` |
| new or changed UI direction | `frontend-design`, `impeccable` |
| de-vibecoding a screen, or a screen reads AI-made | `unslop`, `taste-skill`, `unslop-ui` |
| copy and decorative chrome on a finished screen | `unslop-ui` |
| Linear-precision reference, token audits | `unslop-engine` |

`impeccable` owns direction, critique and polish; `taste-skill` carries its own browser gate and is the
heaviest — use one of them per task, not both at once. `unslop-engine` mandates its own palette and
radius, so treat it as a reference under our tokens rather than an override. Each of these ships a
house style; the brief and `DECISIONS.md` still win.

Two or more rows apply: read all of them. Say which you read at the top of your reply.

## Non-negotiables

- Framing is "live event directory, we host nothing" — never describe it as piracy tooling.
- Tokens live in `app/assets/css/theme.css`; no magic colours, radii or spacing values in components.
- Every page keeps a canonical link and an absolute `og:url` on the canonical host; mirrors are never linked internally.
- `pnpm build`, `pnpm test` and `wrangler deploy --dry-run` must pass before a task is called done, and the reply must say what was actually checked.
- Never run `wrangler dev` while a build is writing `.output/`.
