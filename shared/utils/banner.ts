export const bannerPlacements = ['home-banner', 'event-banner', 'vods-banner'] as const

export type BannerPlacement = (typeof bannerPlacements)[number]

type BannerCreative = { image?: string; alt: string; destination: string }

export function getAdDestination(destination: unknown) {
  if (typeof destination !== 'string' || !destination) return
  try {
    const url = new URL(destination)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
      return url.href
    }
  } catch {
    // Invalid destinations are ignored.
  }
}

export function getBannerCreative(
  enabled: boolean,
  creatives: Partial<Record<BannerPlacement, BannerCreative>>,
  placement: BannerPlacement,
  failedImage = '',
) {
  if (!enabled) return
  const creative = creatives[placement]
  const alt = typeof creative?.alt === 'string' ? creative.alt.trim() : ''
  if (!alt || !getAdDestination(creative?.destination)) return
  const image = typeof creative?.image === 'string' ? creative.image.trim() : ''
  // Require a same-origin asset path. Backslashes and control characters can
  // change how browsers resolve an apparently relative URL.
  return {
    alt,
    image: /^\/(?!\/)[^\\\u0000-\u001f\u007f]+$/.test(image) && image !== failedImage ? image : '',
  }
}
