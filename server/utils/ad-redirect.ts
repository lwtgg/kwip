import { bannerPlacements, getAdDestination, getBannerCreative, type BannerCreatives } from '../../shared/utils/banner.ts'

export function adRedirect(
  placement: string | undefined,
  enabled: boolean,
  destination: string,
  bannerCreatives: BannerCreatives = {},
  creativeKey?: unknown,
  assetOrigin = '',
): Response {
  const banner = bannerPlacements.find(candidate => candidate === placement)
  const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
  let location = 'https://kwip.fyi/'
  if (enabled && banner) {
    const creative = getBannerCreative(enabled, bannerCreatives, banner, assetOrigin)
    if (!creative?.key || creative.key !== creativeKey) {
      return new Response('This advertisement is no longer available.', { status: 410, headers })
    }
    location = creative.destination
  } else if (enabled && (placement === 'source' || placement === 'play')) {
    location = getAdDestination(destination) ?? location
  }
  return new Response(null, {
    status: 302,
    headers: { ...headers, location },
  })
}
