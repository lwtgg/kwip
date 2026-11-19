# Task 23 — publish a snapshot to R2

The Worker cannot reach the provider, so it serves a snapshot from the last deploy. Build the publisher half of [the freshness design](../docs/freshness-design.md): pack a validated snapshot into one immutable object plus a small manifest, and commit it to R2 under a precondition. The reader is the next task; this one must produce data the reader can consume.

Read `docs/freshness-design.md` sections "Collection and atomic publication" and "Failure states" before starting, plus `.agents/skills/workers-best-practices/SKILL.md`.

## Storage shape

Bucket `kwip-feed-preview` by default, `kwip-feed-prod` with `--bucket kwip-feed-prod`.

- `snapshots/<commitId>.bin` — the packed payload. Immutable, never overwritten.
- `current.json` — the manifest. Committed last, and only by a manifest write.
- `collector-state.json` — writer bookkeeping: last commit, hashes, `retryNotBefore`, any pause.

`commitId` is `<ISO basic UTC>-<8 hex>`, sortable, and must survive a retry unchanged.

## Manifest

```json
{"schema":1,"commitId":"...","payloadKey":"snapshots/....bin","size":123456,
 "hashes":{"streams":"<sha256>","vods":"<sha256>","details":"<sha256>"},
 "publishedAt":"...","listsVerifiedAt":"...","detailsVerifiedAt":"...",
 "endpoints":[{"path":"streams","offset":0,"length":9999}, ...]}
```

`endpoints` is one entry per stored payload path, in a stable order, offsets contiguous from zero, and the last `offset + length` equals `size`. Paths are exactly the `feed-cache` relative paths, extensionless (`streams`, `vods`, `streams/<uri>`, `vods/<slug>`), so the reader can map them straight onto the existing endpoint dispatcher.

## Script

New `scripts/collect-publish-feed.mjs`, invoked as `node scripts/collect-publish-feed.mjs [--bucket X] [--dry-run]`, which collects and publishes in one process so the manifest ETag can be captured before collection. `pnpm snapshot` and `pnpm deploy` keep their current behaviour; add `pnpm publish:feed` as the wrapper.

Collection happens in-process, into a run-specific temporary directory, never into the shared `public/feed-cache`. Pacing: at least 250 ms between provider requests and a hard cap of 400 requests per run; if the cap is hit, the run fails rather than publishing a partial snapshot. Reserve the last 20 seconds of the job deadline for the state write and its retries, and give up cleanly with `failed` rather than dying mid-write.

1. Read `.r2-credentials.json` for the account ID, access key pair and endpoint, or the same values from env (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`). Pick the credential set matching `--bucket`, so preview can never be written with the production key.
2. Read `collector-state.json`. If its `retryNotBefore` is in the future, exit 0 with a quiet "backoff" line.
3. Validate `public/feed-cache`: both lists parse, `success === true`, every detail path resolves to a file, every source URL is `http`/`https`, no file over 2 MiB, total under 40 MiB.
4. Hash `streams.json` and `vods.json` with keys sorted and array order preserved, excluding root `timestamp` and `performance`. Hash the detail set in stable path order.
5. If both list hashes equal the state's, skip the payload PUT and the details hash change, and do the manifest-only path: same payload key, new `commitId`, new `listsVerifiedAt`, unchanged `publishedAt`.
6. Otherwise pack the payload, PUT it with `If-None-Match: *`, then PUT the manifest with `If-Match` against the ETag read in step 2, or `If-None-Match: *` at bootstrap.
7. Reconcile ambiguity per the design: an ambiguous payload PUT reads the key back and compares length and SHA-256 before continuing; an ambiguous manifest PUT reads `current.json` and compares `commitId`. A different winning `commitId` means another writer won, so stop quietly.
8. On 429 write `retryNotBefore` from `Retry-After`, else `now + 30 min`. On an explicit provider block write `paused: true` and exit non-zero.
9. `--dry-run` prints the manifest and byte counts and writes nothing, including no temporary directory: hold the collected payload in memory.

Use `aws4fetch` as a devDependency (tiny, MIT, runner-only, never in the Worker bundle) — there is no `aws` CLI on this machine. Confirm it supports `If-Match` / `If-None-Match` pass-through and state so in your reply.

## Output

One structured JSON line to stdout: `commitId`, outcome (`published`, `unchanged`, `backoff`, `conflict`, `paused`, `failed`), request count, bytes, and durations. Exit 0 for `published`/`unchanged`/`backoff`/`conflict`, non-zero for `failed`/`paused`.

## Rules

- Runner-only code. No change to `app/**`, `server/**`, `nuxt.config.ts`, or the Worker bundle.
- No `console.log` noise beyond the single result line.
- Fixtures are not involved; the script works on whatever `public/feed-cache` holds.

Stop condition: `pnpm build`, `pnpm test`, `wrangler deploy --dry-run` pass. Prove against the **preview** bucket: a dry run matches the real manifest shape, a real publish succeeds, `current.json` reads back with contiguous offsets summing to `size`, a second identical run reports `unchanged` and applies no payload PUT, and a forced `If-Match` mismatch reports `conflict` and leaves `current.json` alone. Print the byte counts and both outcomes. Say what the total snapshot size means against the 40 MiB guard and the 10 GB free allowance.
