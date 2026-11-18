import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

try {
  loadEnvFile()
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const base = process.env.NUXT_PUBLIC_FEED_BASE || '/fixtures'
if (!URL.canParse(base)) process.exit(0)

const feedUrl = base.replace(/\/+$/, '')
const destination = resolve('public/feed-cache')
const staging = await mkdtemp(resolve('.feed-cache-'))
const snapshot = join(staging, 'snapshot')
const previous = join(staging, 'previous')

async function fetchPayload(path) {
  const urlPath = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${feedUrl}/${urlPath}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  const raw = await response.text()
  const payload = JSON.parse(raw)
  if (payload?.success !== true) throw new Error(`${path}: ${payload?.error || 'Unsuccessful feed response'}`)

  const file = join(snapshot, `${path}.json`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, raw)
  return payload
}

function detailPath(collection, name) {
  const segments = name?.replace(/^\/+/, '').split('/')
  if (!segments?.length || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Invalid detail path in ${collection} list`)
  }
  return `${collection}/${segments.join('/')}`
}

try {
  const streams = await fetchPayload('streams')
  const vods = await fetchPayload('vods')
  const details = new Set([
    ...streams.streams.flatMap((category) => category.streams.map((item) => detailPath('streams', item.uri_name))),
    ...vods.vods.flatMap((category) => category.vods.map((item) => detailPath('vods', item.slug ?? item.uri_name))),
  ])

  const queue = details.values()
  let failed = false
  const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    try {
      for (const path of queue) {
        if (failed) break
        await fetchPayload(path)
      }
    } catch (error) {
      failed = true
      throw error
    }
  }))
  const failure = results.find((result) => result.status === 'rejected')
  if (failure) throw failure.reason

  await writeFile(join(snapshot, 'meta.json'), JSON.stringify({ fetchedAt: new Date().toISOString() }) + '\n')
  let hasPrevious = false
  try {
    await rename(destination, previous)
    hasPrevious = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    await rename(snapshot, destination)
  } catch (error) {
    if (hasPrevious) await rename(previous, destination)
    throw error
  }
  console.log(`Wrote ${details.size + 3} feed snapshot files`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
