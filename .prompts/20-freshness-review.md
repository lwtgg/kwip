# Review: freshness design

Review `docs/freshness-design.md` against `.prompts/20-freshness-design.md`. Do not edit anything. You are a reviewer: verdict plus numbered defects.

Load `.agents/skills/requesting-code-review/SKILL.md` and `.agents/skills/verification-before-completion/SKILL.md` first.

## Facts you should check the design against, not take on trust

- There is **no git remote** in this repo. `git remote -v` is empty. Every Actions-based part is therefore greenfield, and the design never says so, never says whether the repo would be public (Actions minutes are free only then) or which branch the workflow would run on.
- `INFRA.md` lists **R2 under "Not yet"**. The design requires enabling it but treats that as a footnote. `INFRA.md` is not in `CONTRACT.md`'s ownership table, so it is unclear who is allowed to change it.
- The provider blocks **Cloudflare egress specifically**, with the message "IP blocked. Please stop harassing our API." Nobody has yet confirmed that a GitHub runner's IP range is acceptable. The design only says this is "reported in the brief", but the brief asserted it; it is unverified. A cheap way to settle it should be step one, not a risk paragraph.
- Rule 17 pins the design language; rules 13–16 cover feeds and mirrors. Read `DECISIONS.md`, particularly rule 3 (feed-only model) and rule 14 (fixture target).

## Verify, with sources

1. Are the platform numbers right? Workers free Cron and its subrequest limit; KV free reads/writes/day; R2 free Class A/Class B/storage/month and the overage rates quoted; Workers free 100k requests/day. Cite current docs. Flag any number the design got wrong.
2. Is an S3 conditional PUT against R2 real, including create-if-absent? The whole commit protocol rests on it.
3. Does the 212-call full poll fit the provider's rate limit and the 50-subrequest Cron limit as described?
4. Does the design's own arithmetic hold? Check the cost table against its stated assumptions, especially the "quiet feed" column and the KV column.
5. Is reading a byte range out of a packed snapshot per request sane on Workers Free CPU?
6. Is the fallback ordering right — R2, then bundled `ASSETS`, then unavailable page — and does it avoid resurrecting removed events?
7. Does the plan keep the browser direct-refetch path intact through every step?
8. Is the token scope actually narrow, and can a compromised runner still deploy or take over domains?

## Judgement

- Is this too much machinery for a v1 on a free tier? Name what could be cut without losing the target.
- Is a five-minute Actions cron honest, or is the whole schedule-based approach built on a platform that will drift? Say what the design gets wrong about its own guarantees.
- Does the stale-bar section (step 6) stay consistent with the shipped `useFeedFreshness.ts` semantics: 20 minutes from the origin timestamp, acknowledgment only on uncached success while showing?
- Rollback is described as reverting a commit. Is that sufficient given a bucket, a workflow and a token will exist by then?

Reply exactly `VERDICT: pass|fail`, then numbered defects as `docs/freshness-design.md:line — problem, and what it should say`, then a short "cut this" list.
