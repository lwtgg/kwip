export function adRedirect(placement: string | undefined, enabled: boolean, destination: string): Response {
  let location = 'https://kwip.fyi/'
  if (enabled && (placement === 'source' || placement === 'play')) {
    try {
      const url = new URL(destination)
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
        location = url.href
      }
    } catch {
      // Missing or invalid destination uses the canonical homepage.
    }
  }
  return new Response(null, {
    status: 302,
    headers: { 'cache-control': 'no-store', location, 'referrer-policy': 'no-referrer' },
  })
}
