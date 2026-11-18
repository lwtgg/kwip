import tailwindcss from '@tailwindcss/vite'

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
    // Rule 11: HTML 30s + SWR, hashed assets immutable, own /api/* uncached
    routeRules: {
      '/**': { headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=300' } },
      '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      '/api/**': { headers: { 'cache-control': 'no-store' } },
    },
  },
  runtimeConfig: {
    public: {
      siteName: process.env.NUXT_PUBLIC_SITE_NAME || 'kwip',
      canonicalHost: process.env.NUXT_PUBLIC_CANONICAL_HOST || 'kwip.fyi',
      feedBase: process.env.NUXT_PUBLIC_FEED_BASE || '/fixtures',
      feedMirrorBase: process.env.NUXT_PUBLIC_FEED_MIRROR_BASE || '',
    },
  },
})
