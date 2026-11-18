# Ownership

Two agents work in parallel in separate worktrees. Stay inside your glob.

## Agent A (design + player)

```
app/components/**
app/layouts/**
app/pages/index.vue
app/pages/live/**
app/pages/c/**
app/pages/vods/**
app/assets/css/**
app/composables/useTheme.ts
```

Task 06 landed the VOD routes under Agent A.

## Agent B (data, pages, SEO)

```
app/composables/useFeed.ts
app/composables/usePlayerSources.ts
app/pages/mirrors.vue
app/pages/about.vue
app/utils/**
server/**
server/utils/**
nuxt.config.ts
public/**
```

## Shared, change only by agreement

`app/app.vue`, `app/pages/../` cross-links, `package.json`, `DECISIONS.md`, `API.md`, `SPEC.md`.

## Rules

- One task per worktree, one branch, serial merges in the order given.
- Import from a teammate's glob, never edit it.
- Pages access the feed through `useFeed.ts`. It shares feed fetching with the sitemap through `server/utils/feed.ts`. Components take props.
- Reply with the list of files you changed and anything you added to `package.json`.
