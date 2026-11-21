# Task 42: settle the remaining host list, honestly

`docs/sourcing-research.md` ranks `thedaddy.li` (keyed, awaiting a reply), `embed.st` and
`cdnlivetv.tv` as untested. `embed.st` now returns NXDOMAIN at both the local resolver and Cloudflare
DoH — the `st` TLD is fine, the name has no record. The doc still tells readers to treat it as degraded
rather than dead, and the host registry doesn't exist yet for anything but the hosts we already use.

Settle each remaining host from live evidence and leave the doc and the registry truthful. No new
provider integration in this task; this decides what is worth a provider task next.

Read `docs/sourcing-research.md` (§3, "Do next"), `scripts/probe-source-health.mjs` and
`docs/freshness-design.md` for how evidence is written down.
Read `verification-before-completion`.

## Do

1. **`embed.st`.** Confirm the NXDOMAIN from a second resolver and a second network path if you have
   one. Check whether a successor name is advertised anywhere `ppv.st` links to. Verdict either dead, or
   alive with the exact working URL shape. Do not guess paths.
2. **`cdnlivetv.tv`.** Establish whether a `user`/`plan` pair is obtainable without an account, by trying
   the documented player route with a real channel name from our own feed and by looking at what public
   playlists or embeds hand out. Quote the status and body of each attempt. If a pair circulates, say
   where and whether it looks stable.
3. **`pitsport.st`.** Re-check `api/v1/programs/<id>` and one player route for status, framing headers and
   whether ids come from anything we could derive. Say whether it is a source multiplier or a link-only
   host.
4. **`thedaddy.li`.** With no key yet, confirm only what is public: that `/stream/stream-<id>.php` and its
   folder aliases respond, what their framing headers are, and whether ids appear in any unauthenticated
   surface. Note it is waiting on a key.
5. **Write it down.** Update §3's table with a verdict per host and the date, add a short "settled" line
   per dead host so nobody re-litigates it, and add rows to the probe registry only for hosts that are
   both alive and framable. Where a host needs an upstream list before it can even be addressed, mark it
   "needs an id source" rather than adding an unused row.

## Verification

Quote every status, header and body snippet you rely on. `pnpm test`, `pnpm build` and
`NITRO_PRESET=node-server pnpm build` must still pass if the registry changes; a doc-only change needs
the tests only. No dependency, no deploy, ad flag untouched.

Report a one-line verdict per host and the exact registry diff.
