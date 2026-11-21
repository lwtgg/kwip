import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAGE_RENDER_DEADLINE_MS, withinPageRender } from '../server/utils/page-render-deadline.ts'

test('a slow render gets only the time remaining since ingress and cannot replace its fallback', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const start = Date.now()
  context.mock.timers.tick(300)
  let resume!: (value: string) => void
  const stall = new Promise<string>(resolve => { resume = resolve })
  const prepare = context.mock.fn(async () => 'seed')
  const timeout = context.mock.fn((seed: string | undefined) => seed ?? '503')
  const response = withinPageRender(start, 550, () => stall, prepare, timeout)

  context.mock.timers.tick(7_149)
  assert.equal(prepare.mock.callCount(), 0)
  context.mock.timers.tick(1)
  assert.equal(prepare.mock.callCount(), 1)
  await Promise.resolve()
  context.mock.timers.tick(549)
  assert.equal(timeout.mock.callCount(), 0)
  context.mock.timers.tick(1)
  assert.equal(Date.now() - start, PAGE_RENDER_DEADLINE_MS)
  assert.equal(await response, 'seed')
  resume('late render')
  assert.equal(await response, 'seed')
})

test('a stalled seed read cannot extend the deadline', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const stall = () => new Promise<string>(() => {})
  const response = withinPageRender(Date.now(), 550, stall, stall, seed => seed ?? '503')
  context.mock.timers.tick(PAGE_RENDER_DEADLINE_MS)
  assert.equal(await response, '503')
})

test('a healthy render clears both timers without reading the seed', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const prepare = context.mock.fn(async () => 'seed')
  const timeout = context.mock.fn(() => '503')
  assert.equal(await withinPageRender(Date.now(), 550, () => 'page', prepare, timeout), 'page')
  context.mock.timers.tick(PAGE_RENDER_DEADLINE_MS)
  assert.equal(prepare.mock.callCount(), 0)
  assert.equal(timeout.mock.callCount(), 0)
})

test('a render rejection after the deadline cannot replace the fallback', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const now = context.mock.method(Date, 'now', () => 0)
  let reject!: (error: Error) => void
  const render = new Promise<string>((_resolve, fail) => { reject = fail })
  const response = withinPageRender(0, 550, () => render, async () => undefined, () => '503')
  now.mock.mockImplementation(() => PAGE_RENDER_DEADLINE_MS + 100)
  reject(new Error('late error'))
  assert.equal(await response, '503')
})
