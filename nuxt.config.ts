import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { feedDetailPath, type FeedCollection } from './server/utils/feed-path'

import tailwindcss from '@tailwindcss/vite'

const seedDetailPaths = (['streams', 'vods'] as const).flatMap((collection: FeedCollection) => {
  const directory = new URL(`./public/feed-cache/${collection}/`, import.meta.url)
  try {
    return readdirSync(directory, { recursive: true, withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith('.json')) return []
      const parent = entry.parentPath.slice(decodeURIComponent(directory.pathname).length)
      const path = feedDetailPath(collection, [parent, entry.name.slice(0, -5)].filter(Boolean).join('/'))
      return path ? [path] : []
    }).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return []
  }
})

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // app/ srcDir, root server/ dir
  future: { compatibilityVersion: 4 },
  ssr: true,
  devtools: { enabled: false },
  css: ['~/assets/css/theme.css'],
  vite: { plugins: [tailwindcss()] },
  nitro: {
    // Rule 7: node-server stays usable via NITRO_PRESET=node-server
    preset: process.env.NITRO_PRESET || 'cloudflare_module',
    handlers: [{
      route: '/go/:placement',
      method: 'get',
      handler: fileURLToPath(new URL('./server/handlers/ad-redirect.ts', import.meta.url)),
    }, {
      route: '/banners/:file',
      method: 'get',
      handler: fileURLToPath(new URL('./server/handlers/banner-image.ts', import.meta.url)),
    }],
    // Rule 11: HTML 30s + SWR, hashed assets immutable, own /api/* uncached
    routeRules: {
      '/**': { headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=300' } },
      '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      '/api/**': { headers: { 'cache-control': 'no-store' } },
      '/go/**': { headers: { 'cache-control': 'no-store' } },
    },
  },
  runtimeConfig: {
    feedSnapshotBinding: 'FEED_SNAPSHOTS',
    seedDetailPaths,
    adDestination: '',
    public: {
      ads: false,
      bannerCreatives: {
        'home-banner': { image: '', alt: '', destination: '' },
        'event-banner': { image: '', alt: '', destination: '' },
        'vods-banner': { image: '', alt: '', destination: '' },
      },
      siteName: process.env.NUXT_PUBLIC_SITE_NAME || 'kwip',
      canonicalHost: process.env.NUXT_PUBLIC_CANONICAL_HOST || 'kwip.fyi',
      feedBase: process.env.NUXT_PUBLIC_FEED_BASE || '/fixtures',
      feedMirrorBase: process.env.NUXT_PUBLIC_FEED_MIRROR_BASE || '',
    },
  },
})
