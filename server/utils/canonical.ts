import type { H3Event } from 'h3'

export function canonicalOrigin(event: H3Event): string {
  const host = (useRuntimeConfig(event).public.canonicalHost || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  return `https://${host}`
}
