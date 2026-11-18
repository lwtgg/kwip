# kwip agent notes

A live sports event directory on Cloudflare Workers. We host no media: every player is a third-party embed we frame, every event is a link to one. Canonical host `kwip.fyi`, mirror `kwip.lol`, v1 ad-free and anonymous.

Read `CONTRACT.md` (who may edit what), `DECISIONS.md` (binding rules), and `DESIGN.md` (the work order) before touching code. Only the orchestrator edits `DECISIONS.md`.

## Skills

`.agents/skills/` holds third-party and project skills; `.opencode/skill/` symlinks to the same folders. Load the ones that match the task:

- writing-plans, requesting-code-review, verification-before-completion — brief, review and completion discipline
- webapp-testing — Playwright/browser verification
- frontend-design, frontend-design-review, web-design-guidelines — visual and accessibility review
- tailwind-best-practices — token use and class hygiene
- nuxt-seo — canonical, robots, structured data
- workers-best-practices, web-perf — the deploy target and its budgets
- kwip-conventions, kwip-budgets — this project's own rules. Load both for any UI or deploy task.

## Non-negotiables

- Framing is "live event directory, we host nothing" — never describe it as piracy tooling.
- Tokens live in `app/assets/css/theme.css`; no magic colours, radii or spacing values in components.
- Every page keeps a canonical link and an absolute `og:url` on the canonical host; mirrors are never linked internally.
- `pnpm build`, `pnpm test` and `wrangler deploy --dry-run` must pass before a task is called done, and the reply must say what was actually checked.
- Never run `wrangler dev` while a build is writing `.output/`.
