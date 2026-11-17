import domains from '../../../public/domains.json'

// Rule 11: our own /api/* is uncached.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return domains
})
