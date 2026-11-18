# Task 07 — Worker deploy config

Stop condition: `pnpm build` exits 0 and `pnpm deploy --dry-run` resolves the config without error. Nothing else counts as done.

`INFRA.md` is the spec. `DECISIONS.md` 7 fixes the target. Nothing here needs a feed decision.

## Do

1. `wrangler.toml`: `name = "kwip"`, `main = ".output/server/index.mjs"`, `compatibility_date`, `compatibility_flags = ["nodejs_compat"]`, assets directory `.output/public` with `not_found_handling = "none"`, `routes` for the apex and `www` of both `kwip.fyi` and `kwip.lol` with `zone_name` entries, and `observability.enabled = true`.
2. `package.json`: `deploy` (`wrangler deploy`) and `preview` (`wrangler dev .output/server/index.mjs --assets .output/public`) scripts. `wrangler` is a devDependency; name it in your reply.
3. `_headers` handling: hashed assets get `immutable`, `/*` gets the 30s + `stale-while-revalidate=300` header if the platform `_headers` file is the right vehicle — check what the Nitro cloudflare preset already emits and don't duplicate it.
4. `.gitignore`: confirm `.output`, `.nuxt`, `.env`, `.wrangler`, `node_modules` are covered; add what's missing.
5. `.env.example`: keep `/fixtures` but add the live values commented beside it.
6. `README.md`: a short Deploy section — build, `wrangler login`, `pnpm deploy`, and that the zone must be Active first.

## Don't

- No CI workflow yet, no secrets in the toml.
- No changes to `app/**` or `server/**`.

First action is a tool call. Reply with changed files, the dependency added and both command outcomes.
