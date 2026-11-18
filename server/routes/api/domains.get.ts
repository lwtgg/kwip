import domains from '../../../public/domains.json'

// Rule 11: our own /api/* is uncached.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const canonical = useRuntimeConfig(event).public.canonicalHost || domains.canonical
  return {
    canonical,
    mirrors: domains.mirrors.filter((domain) => domain !== canonical),
  }
})
