# Revise the freshness design

Reviewer verdict on `docs/freshness-design.md`: **fail**, 13 defects. Revise the document in place. Still design only, no application code.

Take the reviewer's cut list — a v1 on a free tier does not need the public `/api/feed-snapshot` and health endpoints, the embedded predecessor manifest, a separate cleanup credential, the two-observation empty-feed protocol, or the hourly detail audit as a default.

## Fix these

1. **The repo has no remote.** Name who creates it, whether it is public or private, whether `main` becomes the protected default branch, and which plan and runner type. With a private repo and 2,000 included minutes, five-minute polling costs $39.84–$91.68/month in overage at standard Linux rates — state that, and give the 10- and 15-minute costs too. Environment secrets and branch restriction depend on the plan.
2. **Provider approval is gate one.** `API.md` says poll `/streams` no more than every 60 seconds and states no aggregate detail limit. A full poll is ~212 calls and the job timeout is four minutes, so collection needs >53 calls/minute. Before building anything: one low-volume probe from the proposed runner to confirm the IP is not blocked, then an approved sustained and burst budget, then pacing to stay inside it. Make this a numbered gate with a stop condition.
3. **R2 has no owner.** `INFRA.md` lists it under "Not yet" and `CONTRACT.md` assigns that file to nobody. Name who authorizes billing and provisions the buckets, and say the `INFRA.md` change is part of the task.
4. **Do not overstate the cadence.** Actions delays and drops runs. Call it best-effort and require separate measured listing and detail freshness before rollout.
5. **Conditional PUT can commit on timeout.** Specify preconditions per write, a unique commit ID, and read-back to reconcile an ambiguous outcome.
6. **10 ms Free CPU.** Range reads cut I/O, but parsing and host substitution still run on the same budget. Wire the sitemap to the adapter and benchmark the largest listing, detail and sitemap response before rollout.
7. **Generation mixing.** A valid manifest that omits an endpoint is authoritative; serve each response from one eligible generation or show it unavailable. Never fall back per-endpoint to the bundled seed.
8. **The unavailable state cannot mount.** The mount refetch skips missing snapshots and the detail page throws a fatal 404 before mounting. Specify a mountable unavailable state that the direct browser refetch can recover.
9. **Keep the shipped stale bar.** 20 minutes on the origin timestamp, and acknowledgment only after an uncached success while the bar is visible — for every required payload. Drop the 75-minute detail clock or fold it in without changing those semantics.
10. **Say the quiet path still writes.** One manifest PUT per poll, and hashing viewer counts can push ordinary traffic into the changed column. KV arithmetic is right, but Free stops at four complete publications per day and this needs saying.
11. **Model storage in billing units** with daily peaks, production plus preview, and cleanup lag. The one-minute example is 9.85 GiB ≈ 10.57 decimal GB, which cannot prove headroom against a 10 GB-month allowance.
12. **Token blast radius.** The job gets zero deploy and DNS credentials, but a compromised runner can replace the whole feed and falsify health timestamps. Say what the reader validates and that the in-bucket health check is availability only.
13. **Finish the rollback.** Who disables the workflow, cancels queued runs, revokes the credential, deletes the secrets, retires monitoring, restores the known-good version, verifies the bundled seed, and when the buckets get archived or deleted.

## Also

- The design must stay under 400 lines. If it grows, cut prose, not facts.
- `docs/sourcing-research.md` now exists. Read §0 and §5: the whole feed is 471 iframes on one host that was down for a whole session, and `sources[]` carries only `name`/`default`/`type`/`data`. Note in the design whether the freshness work is still the right first move under that, and if the probe machinery from sourcing §4 belongs here or after.
- End with a short "decisions the owner must make" list: repo visibility and plan, R2 billing, provider contact.

Reply with the sections you changed and the new line count.
