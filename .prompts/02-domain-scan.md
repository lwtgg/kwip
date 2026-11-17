# Task 02 — naming sweep

You are naming a sports directory site and finding what it can launch on. **Budget is the top constraint — the cheapest viable set wins.** Report only; buy nothing.

Use the Orca browser CLI. One tab for the whole run.

```
orca tab create --url "https://rdap.org/domain/example.com" --json
```

Keep `result.browserPageId`. Call it `PAGE` below and pass it to every command.

## Step 1 — invent the names

Write **25 base names** (no TLD) before touching the browser. Rules:

- 6–12 characters, 2–3 syllables, no hyphen, no digits, pronounceable in one go
- Read as sport without naming a sport, a league, or a broadcaster
- Draw from stadium and pitch vocabulary: terrace, touchline, byline, post, dugout, turnstile, second half, extra time, whistle, and structures around them
- Compounded two-word forms are fine and rank higher than single words (single words are almost always gone)
- Ban these stems — overused in this niche: `stream`, `surge`, `sport`, `east`, `meth`, `buff`, `crack`, `vip`, `box`
- No trademarked club or league terms

Number them. This list is yours — don't borrow from a list you were handed.

## Step 2 — availability (fast, authoritative, no JS)

For each candidate:

```
orca goto --page PAGE --url "https://rdap.org/domain/<name>" --json
orca exec --page PAGE --command "read" --json
```

- Empty result or `errorCode`/404 text → **available**
- Body containing `"ldhName"` → **taken**
- Network error, CAPTCHA, anything else → `unknown`

Test `.com` plus the cheap TLDs below for every name. Drop a name the moment its `.com` and all cheap TLDs are dead.

## Step 3 — price (only for available ones)

Porkbun's search needs the form, not the query string:

```
orca goto --page PAGE --url "https://porkbun.com/products/domains" --json
orca snapshot --page PAGE --interactive
orca fill --page PAGE --element @<search box ref> --value "<name>.<tld>"
orca click --page PAGE --element @<submit ref> --json
orca exec --page PAGE --command "read" --json
```

Dismiss the cookie banner first if it appears. Prices read `1st Year Sale! At Cost $X $Y / year` / `renews at $Z`, or a single `At Cost $X / year`. Record **first year** and **renewal** separately.

A cheap TLD found on RDAP must be confirmed in the Porkbun result before you report it. "Taken", "Aftermarket", "Marketplace", "Auction" or `+ transfer fee` means it's out.

## TLDs, cheapest first

```
.fyi  .lol  .blog  .pro  .info  .cloud  .us.com  .tech  .dev  .net  .com
```

Reject anything over **$10 first year**. Flag renewals over $25 rather than rejecting them. `.com` is a nice-to-have, not a launch requirement.

## Output

One table, ascending by first-year price:

```
| # | base name | domain | status | 1st year | renewal |
```

Then:

1. **Recommended set** — one base name with a primary plus two mirrors on three different TLDs, total first year **under $20**. Say why the name fits.
2. **Runner-up set** — same shape, why it's second.
3. **Three best names whose only cheap option was `.com`**, if any.
4. **Avoid** — the best names killed by unavailability, and any name worth having but over $25 renewal.

Finish with counts checked and every `unknown`. Leave tabs open.
