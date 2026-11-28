import assert from 'node:assert/strict'
import { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire, registerHooks } from 'node:module'
import { Socket } from 'node:net'
import { test, type TestContext } from 'node:test'
import { pathToFileURL } from 'node:url'
import type { H3Event } from 'h3'

const nuxt = createRequire(import.meta.resolve('nuxt'))
const nitroServer = createRequire(nuxt.resolve('@nuxt/nitro-server'))
const nitro = createRequire(nitroServer.resolve('nitropack/package.json'))
const h3Url = pathToFileURL(nitro.resolve('h3')).href
const loader = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'h3') return { url: h3Url, shortCircuit: true }
    if (specifier === '#kwip-nuxt-renderer') {
      return { url: 'data:text/javascript,export default event => event.context.testRender(event)', shortCircuit: true }
    }
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier) &&
      context.parentURL?.startsWith(new URL('../server/', import.meta.url).href)) {
      return next(specifier + '.ts', context)
    }
    return next(specifier, context)
  },
})

const h3 = await import('h3')
const { getFeedGeneration } = await import('../server/utils/feed.ts')
const config = {
  feedSnapshotBinding: 'FEED_SNAPSHOTS',
  seedDetailPaths: ['vods/replay'],
  public: { canonicalHost: 'kwip.fyi', feedBase: 'https://feed.invalid', feedMirrorBase: '' },
}
Object.assign(globalThis, h3, {
  useRuntimeConfig: () => config,
  defineNitroPlugin: (plugin: unknown) => plugin,
  $fetch: () => { throw new Error('Unexpected network fetch') },
})
const { default: middleware } = await import('../server/middleware/canonical-host.ts')
const { default: renderer } = await import('../server/handlers/page-renderer.ts')
const { default: cachePlugin } = await import('../server/plugins/edge-cache.ts')
loader.deregister()

const hooks: {
  'render:before'?: (input: { event: H3Event }) => void
  beforeResponse?: (event: H3Event, response: { body: unknown }) => Promise<void>
} = {}
const hook = ((name: string, fn: (typeof hooks)[keyof typeof hooks]) => { (hooks as Record<string, unknown>)[name] = fn }) as any
cachePlugin({ hooks: { hook } } as unknown as Parameters<typeof cachePlugin>[0])

const vods = JSON.stringify({ success: true, vods: [] })
const streams = JSON.stringify({ success: true, streams: [] })
const packed = streams + vods
const commitId = '20261119T000000Z-01234567'
const stamp = '2026-11-19T00:00:00.000Z'
const manifest = {
  schema: 1, commitId, payloadId: commitId, payloadKey: 'snapshots/' + commitId + '.bin',
  publishedAt: stamp, listsVerifiedAt: stamp, detailsVerifiedAt: stamp, size: packed.length,
  endpoints: [
    { path: 'streams', offset: 0, length: streams.length },
    { path: 'vods', offset: streams.length, length: vods.length },
  ],
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

function setup(
  context: TestContext,
  { lateCache = false, pendingMatch, seed = { name: 'Bundled replay' } }: {
    lateCache?: boolean
    pendingMatch?: Promise<Response>
    seed?: object
  } = {},
) {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let now = Date.parse(stamp)
  context.mock.method(Date, 'now', () => now)
  const advance = (ms: number) => {
    now += ms
    context.mock.timers.tick(ms)
  }
  const logs = context.mock.method(console, 'log', () => {})
  context.mock.method(console, 'warn', () => {})
  const cache = new Map<string, Response>()
  const put = context.mock.fn(async (key: Request, response: Response) => { cache.set(key.url, response) })
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: {
      async match(key: Request) {
        if (pendingMatch) return pendingMatch
        if (lateCache) {
          await new Promise(resolve => setTimeout(resolve, 450))
          return new Response('late cache', { headers: { 'content-type': 'text/html' } })
        }
        return cache.get(key.url)?.clone()
      },
      put,
    } },
  })
  context.after(() => { delete (globalThis as { caches?: unknown }).caches })
  const assets = context.mock.fn(async () => Response.json({ success: true, data: seed }))
  const generation = (event: H3Event) => getFeedGeneration(event, config.feedSnapshotBinding, config.public, new URL('https://kwip.fyi' + event.path))
  async function run(path: string, render: (event: H3Event) => unknown) {
    const req = new IncomingMessage(new Socket())
    req.method = 'GET'
    req.url = path
    req.headers = { host: 'kwip.fyi', 'x-forwarded-proto': 'https', 'cf-ray': 'test' }
    const event = h3.createEvent(req, new ServerResponse(req))
    const request = new Request('https://kwip.fyi' + path, { headers: { 'cf-ray': 'test' } })
    const env = {
      ASSETS: { fetch: assets },
      FEED_SNAPSHOTS: {
        async get(key: string, options?: { range: { offset: number; length: number } }) {
          const manifestRead = key === 'current.json'
          const range = options?.range
          const text = manifestRead ? JSON.stringify(manifest) : packed.slice(range!.offset, range!.offset + range!.length)
          const response = new Response(text)
          return { size: manifestRead ? text.length : packed.length, body: response.body, etag: key, arrayBuffer: () => response.arrayBuffer() }
        },
      },
    }
    event.context.cloudflare = { request, env }
    event.context.waitUntil = event.waitUntil = () => {}
    event.context.testRender = async (renderEvent: H3Event) => {
      await hooks['render:before']!({ event: renderEvent })
      h3.setResponseHeader(renderEvent, 'content-type', 'text/html')
      return render(renderEvent)
    }
    const body = await middleware(event) ?? await renderer(event)
    await hooks.beforeResponse!(event, { body })
    return { event, body }
  }
  return { advance, moveClock: (ms: number) => { now += ms }, run, generation, logs, put, assets }
}

test('healthy render writes once on a miss and a second request serves the cache hit', async context => {
  const { run, generation, put, assets } = setup(context)
  const cold = await run('/vods', async event => {
    await generation(event)
    return 'rendered html'
  })
  assert.equal(cold.body, 'rendered html')
  assert.equal(h3.getResponseHeader(cold.event, 'x-kwip-cache'), 'miss')
  assert.equal(put.mock.callCount(), 1)
  const warm = await run('/vods', () => assert.fail('cache hit reached SSR'))
  assert.equal(warm.body.headers.get('x-kwip-cache'), 'hit')
  assert.equal(await warm.body.text(), 'rendered html')
  assert.equal(put.mock.callCount(), 1)
  assert.equal(assets.mock.callCount(), 0)
})

for (const fallback of ['cache', 'seed', '503', 'authoritative omission'] as const) {
  test(`stalled render selects ${fallback} and never writes a cache entry`, async context => {
    const { run, advance, moveClock, generation, put, assets } = setup(context, { lateCache: fallback === 'cache' })
    const path = fallback === '503' ? '/vods' : '/vods/replay'
    let resolve!: (value: string) => void
    const stalled = new Promise<string>(done => { resolve = done })
    let renderEvent: H3Event | undefined
    const pending = run(path, async event => {
      renderEvent = event
      if (fallback === '503') await generation(event)
      if (fallback === 'seed' || fallback === 'cache') {
        (event.context as any)[Symbol.for('kwip.feedGeneration')] = stalled
      }
      return stalled
    })
    await tick()
    advance(250)
    await tick()
    advance(200)
    await tick()
    assert.ok(renderEvent)
    advance(7_000)
    await tick()

    if (fallback === 'authoritative omission') {
      const resolved = await generation(renderEvent)
      assert.equal(resolved?.readable, true)
      assert.equal(resolved?.hasDetail('vods/replay'), false)
    }
    if (fallback === 'seed') {
      // Let a successful render settle at 8.1 s while the timeout callback is still queued.
      moveClock(650)
      resolve('late success')
    } else {
      advance(550)
    }
    const { body } = await pending
    assert.ok(body instanceof Response)
    assert.equal(body.headers.get('cache-control'), 'no-store')
    if (fallback === 'cache') {
      assert.equal(body.status, 200)
      assert.equal(body.headers.get('x-kwip-cache'), 'hit')
      assert.equal(await body.text(), 'late cache')
    } else if (fallback === 'seed') {
      assert.equal(body.status, 200)
      assert.match(await body.text(), /Bundled replay/)
    } else {
      assert.equal(body.status, 503)
      assert.match(await body.text(), /Please try again shortly/)
    }
    assert.equal(assets.mock.callCount(), fallback === '503' ? 0 : 1)
    assert.equal(put.mock.callCount(), 0)
    resolve('late success')
    await tick()
    if (fallback === '503') {
      // Even a late successful, cache-eligible HTML body is discarded by the cache hook.
      assert.equal((await generation(renderEvent))?.cacheIdentity, commitId)
      await hooks.beforeResponse!(renderEvent, { body: 'late success' })
    }
    assert.equal(put.mock.callCount(), 0)
  })
}

test('a seed timeout fallback takes the home-first match order', async context => {
  const { run, advance, moveClock } = setup(context, {
    seed: {
      name: 'Juventus vs. Omonia Nicosia',
      match: { away: { name: 'Omonia Nicosia' }, home: { name: 'Juventus' } },
    },
  })
  let resolveRender!: (value: string) => void
  const render = new Promise<string>(resolve => { resolveRender = resolve })
  const pending = run('/vods/replay', () => render)
  await tick()
  advance(250)
  await tick()
  advance(200)
  await tick()
  advance(7_000)
  await tick()
  moveClock(650)
  resolveRender('late success')
  const { body } = await pending
  assert.ok(body instanceof Response)
  assert.equal(body.status, 200)
  const html = await body.text()
  assert.match(html, /<title>Juventus vs\. Omonia Nicosia<\/title>/)
  assert.match(html, /<h1>Juventus vs\. Omonia Nicosia<\/h1>/)
})

test('Nuxt payload requests bypass page logging', async context => {
  const { run, logs } = setup(context)
  for (const path of ['/vods/_payload.json?_b=build', '/vods/_payload.js']) {
    const { body } = await run(path, () => 'payload')
    assert.equal(body, 'payload')
  }
  assert.equal(logs.mock.callCount(), 0)
})


test('a fresh cache hit wins after eight seconds while both timeout callbacks are pending', async context => {
  let resolveMatch!: (response: Response) => void
  const pendingMatch = new Promise<Response>(resolve => { resolveMatch = resolve })
  const { run, moveClock, logs, put } = setup(context, { pendingMatch })
  const pending = run('/vods', () => assert.fail('cache hit reached SSR'))
  await tick()
  moveClock(8_100)
  resolveMatch(new Response('fresh cached html', { headers: { 'content-type': 'text/html' } }))

  const { body } = await pending
  assert.ok(body instanceof Response)
  assert.equal(body.status, 200)
  assert.equal(body.headers.get('x-kwip-cache'), 'hit')
  assert.equal(await body.text(), 'fresh cached html')
  assert.ok(logs.mock.calls.some(({ arguments: [line] }) => {
    const log = JSON.parse(String(line))
    return log.event === 'page_render_timeout' && log.fallback === 'cache' && log.elapsedMs === 8_100
  }))
  assert.equal(put.mock.callCount(), 0)
})
