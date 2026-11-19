# Review: task 23 R2 publisher

Review the uncommitted diff against `.prompts/23-publish-snapshot.md`. Do not edit files. Verdict plus numbered defects.

Load `.agents/skills/requesting-code-review/SKILL.md` first.

The script writes to real storage, so weight correctness of the write path above style. Published for real against `kwip-feed-preview`; a forced `If-Match` returned 412 without changing `current.json`, and an identical repeat reported `unchanged` with zero payload PUTs.

## Check in this order

1. **Credential selection.** `--bucket` must pick the matching credential file. Prove a preview run cannot use the production key, and that a mismatch fails loudly rather than writing to the wrong bucket.
2. **Preconditions.** Payload `If-None-Match: *`, manifest `If-Match` against the ETag read before collection, `If-None-Match: *` only at bootstrap. A strong ETag is needed: the builder added identity encoding for compressed responses — check an `Accept-Encoding: identity` header is actually sent on the manifest read and that no path can reintroduce a weak `W/` ETag into `If-Match`.
3. **Manifest integrity.** Contiguous offsets from 0, final `offset + length === size`, one entry per stored path, stable order, no duplicate or missing path, `schema: 1`.
4. **Hashes.** Keys sorted, array order preserved, `timestamp`/`performance` excluded, details hashed in stable path order.
5. **Reconciliation.** An ambiguous payload PUT re-reads and compares length and SHA-256; an ambiguous manifest PUT compares `commitId`; a different winner stops quietly. Check the retry reuses the same `commitId`.
6. **Backoff and pause.** 429 honours `Retry-After` and never shortens an existing `retryNotBefore`; a block sets `paused` and exits non-zero; a future `retryNotBefore` exits 0 without writing.
7. **Validation.** Both lists parse and carry `success: true`, every detail path resolves, URL schemes restricted, 2 MiB per file and 40 MiB total enforced before any write.
8. **Safety.** `--dry-run` writes nothing, including to state. Exactly one JSON line on stdout, no stray logging. Runner-only: no `app/**`, `server/**`, `nuxt.config.ts` or bundle change.
9. **Exit codes.** 0 for `published`/`unchanged`/`backoff`/`conflict`, non-zero for `failed`/`paused`.

## Also

- `aws4fetch` is a new devDependency. Judge whether it is justified against rule 9 and confirm it cannot reach the Worker bundle.
- Is anything in the script capable of deleting or overwriting a prior generation?
- The script grew an undocumented `--provider-status` flag with `--retry-after`. Is that worth keeping, and is it coherent?

Reply exactly `VERDICT: pass|fail`, then numbered defects as `scripts/publish-snapshot.mjs:line — problem, and what it should do`.
