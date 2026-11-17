# Ownership

Two agents work in parallel in separate worktrees. Stay inside your glob.

## Agent A (design + player)

```
app/components/**
app/layouts/**
app/pages/index.vue
app/pages/live/**
app/pages/c/**
app/assets/css/**
app/composables/useTheme.ts
```

## Agent B (data, pages, SEO)

```
app/composables/useFeed.ts
app/composables/usePlayerSources.ts
app/pages/vods/**
app/pages/mirrors.vue
app/pages/about.vue
app/utils/**
server/**
nuxt.config.ts
public/**
```

## Shared, change only by agreement

`app/app.vue`, `app/pages/../` cross-links, `package.json`, `DECISIONS.md`, `API.md`, `SPEC.md`.

## Rules

- One task per worktree, one branch, serial merges in the order given.
- Import from a teammate's glob, never edit it.
- The feed is fetched in `useFeed.ts` only. Components take props.
- Reply with the list of files you changed and anything you added to `package.json`.
