import { bannerPlacements, getAdDestination, type BannerPlacement } from '../../shared/utils/banner.ts'

export function adRedirect(
  placement: string | undefined,
  enabled: boolean,
  destination: string,
  bannerCreatives: Partial<Record<BannerPlacement, { destination: string }>> = {},
): Response {
  const banner = bannerPlacements.find(candidate => candidate === placement)
  const target = banner ? bannerCreatives[banner]?.destination : destination
  const location = enabled && (banner || placement === 'source' || placement === 'play')
    ? getAdDestination(target) ?? 'https://kwip.fyi/'
    : 'https://kwip.fyi/'
  return new Response(null, {
    status: 302,
    headers: { 'cache-control': 'no-store', location, 'referrer-policy': 'no-referrer' },
  })
}
