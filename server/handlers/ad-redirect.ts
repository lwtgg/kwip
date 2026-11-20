import { adRedirect } from '../utils/ad-redirect'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  return adRedirect(
    getRouterParam(event, 'placement'),
    config.public.ads === true,
    config.adDestination,
    config.public.bannerCreatives,
    getQuery(event).creative,
  )
})
