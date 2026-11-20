import { isBannerAssetPath } from '../../shared/utils/banner'

type BannerBucket = {
  get(key: string): Promise<{ body: ReadableStream } | null>
}

const contentTypes: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export default defineEventHandler(async (event) => {
  const path = event.path
  const bucket: BannerBucket | undefined = event.context.cloudflare?.env?.BANNER_ASSETS
  const missing = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
  if (!bucket || !isBannerAssetPath(path)) return missing()

  const file = path.slice('/banners/'.length)
  const image = await bucket.get(file)
  if (!image) return missing()

  return new Response(image.body, {
    headers: {
      'content-type': contentTypes[file.slice(file.lastIndexOf('.') + 1)]!,
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  })
})
