// Temporary diagnostic: which relay works from Worker egress?
const TARGET = 'https://api.ppv.st/api/streams'

const RELAYS = [
  ['corsproxy.io', `https://corsproxy.io/?url=${encodeURIComponent(TARGET)}`],
  ['codetabs', `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(TARGET)}`],
  ['isomorphic', `https://cors.isomorphic-git.org/${TARGET}`],
  ['thingproxy', `https://thingproxy.freeboard.io/fetch/${TARGET}`],
  ['allorigins-get', `https://api.allorigins.win/get?url=${encodeURIComponent(TARGET)}`],
]

export default defineEventHandler(async () => {
  const results = []
  for (const [label, url] of RELAYS) {
    const started = Date.now()
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/131.0.0.0' } })
      const text = (await res.text()).slice(0, 100)
      results.push({ label, status: res.status, ms: Date.now() - started, body: text })
    } catch (err) {
      results.push({ label, status: 0, ms: Date.now() - started, body: String(err) })
    }
  }
  return { results }
})
