export const bannerPlacements = ['home-banner', 'event-banner', 'vods-banner'] as const

export type BannerPlacement = (typeof bannerPlacements)[number]
export type BannerCreatives = Partial<Record<BannerPlacement, { image?: string; alt: string; destination: string }>>

// Reserve a static-only namespace and disallow URL normalization or route syntax.
const bannerAssetPath = /^\/banners\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.(?:avif|gif|jpe?g|png|webp)$/
const unsafeUrl = /[\\\u0000-\u0020\u007f-\u009f]|%(?![\da-f]{2})/i

export function getAdDestination(destination: unknown) {
  if (typeof destination !== 'string' || unsafeUrl.test(destination)) return
  const authority = /^https?:\/\/([^/?#]+)/i.exec(destination)?.[1]
  if (!authority || authority.includes('@')) return
  try {
    const url = new URL(destination)
    if (!url.username && !url.password) return url.href
  } catch {
    // Invalid destinations are ignored.
  }
}

export function getBannerCreative(enabled: boolean, creatives: BannerCreatives, placement: BannerPlacement) {
  if (!enabled) return
  const creative = creatives?.[placement]
  const alt = typeof creative?.alt === 'string' ? creative.alt.trim() : ''
  const destination = getAdDestination(creative?.destination)
  if (!alt || !destination) return

  const image = creative?.image ?? ''
  if (image !== '' && (typeof image !== 'string' || !bannerAssetPath.test(image) || unsafeUrl.test(image))) return

  // Bind the click to the creative shown in cached HTML. This key is only
  // compared with config; request data never supplies a redirect destination.
  const key = image ? JSON.stringify([placement, image, alt, destination]) : ''
  return { image, alt, destination, key }
}
