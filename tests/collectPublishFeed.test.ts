import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/feed-endpoint-collision.json', import.meta.url), 'utf8'))
const publisher = fileURLToPath(new URL('../scripts/collect-publish-feed.mjs', import.meta.url))

const mock = `
  import assert from 'node:assert/strict'
  import { registerHooks } from 'node:module'
  const signer = 'data:text/javascript,export class AwsClient { sign(url, options) { return new Request(url, options) } }'
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'aws4fetch') return { url: signer, shortCircuit: true }
      return nextResolve(specifier, context)
    },
  })
  const fixture = ${JSON.stringify(fixture)}
  const current = JSON.parse(process.env.PUBLISH_TEST_CURRENT)
  let packed
  globalThis.fetch = async (request) => {
    if (typeof request === 'string') {
      const endpoint = decodeURIComponent(new URL(request).pathname.slice(1))
      assert.ok(Object.hasOwn(fixture, endpoint))
      return Response.json(fixture[endpoint])
    }
    const path = new URL(request.url).pathname
    assert.ok(path.startsWith('/kwip-feed-preview/'))
    if (request.method === 'GET') {
      if (current && path.endsWith('/current.json')) {
        return Response.json(current, { headers: { etag: '"original"' } })
      }
      return new Response('<Code>NoSuchKey</Code>', { status: 404 })
    }
    assert.equal(request.method, 'PUT')
    if (path.includes('/snapshots/')) {
      assert.equal(request.headers.get('if-none-match'), '*')
      packed = Buffer.from(await request.arrayBuffer())
    } else if (path.endsWith('/current.json')) {
      assert.equal(request.headers.get('if-match'), '"original"')
      const manifest = await request.json()
      assert.equal(manifest.payloadKey, 'snapshots/' + manifest.payloadId + '.bin')
      assert.notEqual(manifest.commitId, current.commitId)
      if (packed) assert.equal(manifest.payloadId, manifest.commitId)
      else assert.equal(manifest.payloadId, current.payloadKey.slice(10, -4))
      assert.deepEqual(manifest.endpoints.map(({ path }) => path), Object.keys(fixture))
      if (packed) {
        let end = 0
        for (const { path, offset, length } of manifest.endpoints) {
          assert.equal(offset, end)
          end += length
          assert.deepEqual(JSON.parse(packed.subarray(offset, end)), fixture[path])
        }
        assert.equal(end, manifest.size)
        assert.equal(end, packed.length)
      }
    } else {
      assert.ok(path.endsWith('/collector-state.json'))
    }
    return new Response()
  }
`

async function publish(args: string[], current: object | null = null) {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--import', 'data:text/javascript,' + encodeURIComponent(mock), publisher, ...args,
  ], {
    timeout: 10_000,
    env: {
      ...process.env,
      NUXT_PUBLIC_FEED_BASE: 'https://provider.example',
      R2_BUCKET: 'kwip-feed-preview',
      R2_ACCOUNT_ID: '00000000000000000000000000000000',
      R2_ACCESS_KEY_ID: 'local',
      R2_SECRET_ACCESS_KEY: 'local',
      R2_ENDPOINT: 'https://00000000000000000000000000000000.r2.cloudflarestorage.com',
      PUBLISH_TEST_CURRENT: JSON.stringify(current),
      ...(args.includes('--dry-run') ? { TMPDIR: publisher, TEMP: publisher } : {}),
    },
  })
  return JSON.parse(stdout)
}

test('republishes matching list hashes with incomplete or incorrect endpoint coverage', async () => {
  const dryRun = await publish(['--dry-run'])
  assert.equal(dryRun.requests, 2)
  assert.equal(dryRun.providerRequests, 5)
  assert.deepEqual(dryRun.manifest.endpoints.map(({ path }: { path: string }) => path), Object.keys(fixture))

  const endpoints = dryRun.manifest.endpoints
  const missing = { ...dryRun.manifest, endpoints: endpoints.slice(0, -1), size: endpoints.at(-1).offset }
  const wrong = {
    ...dryRun.manifest,
    endpoints: [...endpoints.slice(0, -1), { ...endpoints.at(-1), path: 'vods/unlisted' }],
  }

  const [missingResult, wrongResult, completeResult] = await Promise.all([
    publish([], missing),
    publish([], wrong),
    publish([], { ...dryRun.manifest, payloadId: undefined }),
  ])
  for (const result of [missingResult, wrongResult]) {
    assert.equal(result.outcome, 'published')
    assert.equal(result.providerRequests, 5)
    assert.equal(result.requests, 5)
    assert.deepEqual(result.bytes, { ...dryRun.bytes, payloadPut: dryRun.bytes.snapshot })
  }
  assert.equal(completeResult.outcome, 'unchanged')
  assert.equal(completeResult.providerRequests, 2)
  assert.equal(completeResult.requests, 4)
  assert.equal(completeResult.bytes.payloadPut, 0)
})
