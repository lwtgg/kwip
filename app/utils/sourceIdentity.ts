export const playerShieldSandbox = 'allow-scripts allow-same-origin allow-presentation'

export function parseSourceUrl(url: string): URL | null {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url)
  } catch {
    return null
  }
}

export function sourceKey(url: string): string {
  const parsed = parseSourceUrl(url)
  return parsed ? (parsed.host + parsed.pathname.replace(/\/+$/, '')).toLowerCase() : url
}

export function sourceHost(url: string): string {
  return parseSourceUrl(url)?.hostname ?? ''
}

const PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  'co.nz', 'ac.nz', 'co.za', 'com.br', 'k12.ca.us', 'ca.us', 'co.jp', 'co.in', 'com.mx',
  'com.sg', 'co.id', 'com.tr', 'com.ar', 'co.il', 'com.sa', 'com.ng', 'com.pk', 'co.ke',
])

function hostLabel(host: string): string {
  const parts = host.replace(/\.$/, '').split('.')
  if (parts.length < 2 || /^\d+(\.\d+){3}$/.test(host)) return host

  // Check the longest suffix first, then fall back to the final label.
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (PUBLIC_SUFFIXES.has(parts.slice(index).join('.'))) return parts[index - 1] ?? host
  }

  return parts.at(-2) ?? host
}

interface SourceLabelInput {
  data: string
  name?: string
  substreamName?: string
  sourceTag?: string
}

export function sourceLabel(source: SourceLabelInput, index: number): string {
  const name = (source.substreamName ?? source.name)?.trim()
  const host = sourceHost(source.data)
  const label = name && !/^external player frame$/i.test(name)
    ? name
    : hostLabel(host) || `Source ${index + 1}`
  return [label, source.sourceTag?.trim()].filter(Boolean).join(' · ')
}
