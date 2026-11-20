import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const dependencies = process.env.KWIP_WORKFLOW_TEST_DIR
assert.ok(dependencies, 'Set KWIP_WORKFLOW_TEST_DIR as shown in the README')
const require = createRequire(join(dependencies, 'package.json'))
const expressions = pathToFileURL(join(dependencies, 'node_modules/@actions/expressions/dist/index.js'))
const { data, Evaluator, Lexer, Parser } = await import(expressions)
const { parse } = require('yaml')
const workflow = (file) => parse(readFileSync(new URL(`../.github/workflows/${file}.yml`, import.meta.url), 'utf8'))
const refresh = workflow('feed-refresh')
const issue = workflow('feed-refresh-issue')
const cancelled = { name: 'cancelled', minArgs: 0, maxArgs: 0, call: () => new data.BooleanData(false) }

function evaluate(expression, context) {
  if (typeof expression !== 'string') return expression
  const source = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim()
  const tree = new Parser(new Lexer(source).lex().tokens, ['github', 'inputs', 'needs', 'steps'], [cancelled]).parse()
  const values = JSON.parse(JSON.stringify(context), data.reviver)
  const result = new Evaluator(tree, values, new Map([['cancelled', cancelled]])).evaluate()
  return JSON.parse(JSON.stringify(result, data.replacer))
}

function alertInputs(job, source, result, outputs) {
  const needs = { [source]: { result, outputs } }
  assert.equal(job.needs, source)
  assert.equal(evaluate(job.if, { needs }), true)
  return {
    ...Object.fromEntries(Object.entries(issue.on.workflow_call.inputs)
      .filter(([, input]) => 'default' in input).map(([key, input]) => [key, input.default])),
    ...Object.fromEntries(Object.entries(job.with).map(([key, expression]) => [key, evaluate(expression, { needs })])),
  }
}

const schedule = {
  github: { event_name: 'schedule', event: { schedule: '*/15 * * * *' }, ref: 'refs/heads/main' },
}
const bareDispatch = { github: { event_name: 'workflow_dispatch', event: {} }, inputs: {} }

function checkLiveRouting(context) {
  assert.equal(evaluate(refresh['run-name'], context), 'Feed refresh (live)')
  assert.equal(evaluate(refresh.concurrency.group, context), 'feed-refresh')
  assert.equal(evaluate(refresh.jobs.refresh.if, context), true)
  const publish = refresh.jobs.refresh.steps.find((step) => step.id === 'publish')
  assert.equal(evaluate(publish.if, { ...context, steps: { install: { outcome: 'success' } } }), true)
  assert.equal(evaluate(refresh.jobs.simulation.if, context), false)
  assert.equal(evaluate(refresh.jobs.alert_simulation.if, { needs: { simulation: { result: 'skipped' } } }), false)
}

test('a cron event without inputs follows the same live route as a bare dispatch', () => {
  checkLiveRouting(schedule)
  checkLiveRouting(bareDispatch)
  checkLiveRouting({ ...bareDispatch, inputs: { simulate: 'none', simulate_recovery: false } })
  checkLiveRouting({ ...schedule, inputs: null })
})

test('a healthy no-input cron run closes the live incident and leaves the rehearsal issue open', () => {
  checkLiveRouting(schedule)
  const inputs = alertInputs(refresh.jobs.alert, 'refresh', 'success', {
    freshness: '{"outcome":"fresh"}',
    publication: '{"outcome":"unchanged","commitId":"20261119T120000Z-12345678"}',
    stages: '{"publish":"success"}',
  })
  assert.equal(inputs.simulated, false)
  assert.equal(inputs.simulation_recovery, false)
  const env = Object.fromEntries(Object.entries(issue.jobs.issue.env)
    .filter(([, value]) => value.includes('inputs.'))
    .map(([key, value]) => [key, String(evaluate(value, { ...schedule, inputs }))]))
  const update = issue.jobs.issue.steps.find((step) => step.name === 'Update feed refresh issue')
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', `
    gh() {
      case "$1 $2" in
        'api --paginate')
          echo '[[{"number":91,"body":"**Simulated incident**"},{"number":42,"body":"Incident: failed"}]]' ;;
        'issue close')
          printf '%s\\n' "$@" ;;
        *) return 99 ;;
      esac
    }
    ${update.run}
  `], { encoding: 'utf8', env: {
    ...process.env, ...env, GH_REPO: 'example/kwip', RUN_URL: 'https://example.test/runs/1',
  } })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'issue', 'close', '42', '--comment',
    'Feed refresh recovered at commit `20261119T120000Z-12345678`. https://example.test/runs/1',
  ])
})

for (const [simulate, recovery, status, freshness, publication] of [
  ['failed', false, 1, {}, { outcome: 'failed', providerStatus: 503 }],
  ['paused', false, 1, {}, { outcome: 'paused', providerStatus: 403 }],
  ['stale', false, 0, { outcome: 'stale', listsVerifiedAtAgeMs: 3600000 }, {}],
  ['none', true, 0, { outcome: 'fresh' }, { outcome: 'unchanged', commitId: 'simulated-recovery' }],
]) {
  test(`dispatch retains the ${recovery ? 'recovery' : simulate} simulation shape`, (t) => {
    const context = { ...bareDispatch, inputs: { simulate, simulate_recovery: recovery } }
    assert.equal(evaluate(refresh['run-name'], context), 'Feed refresh (simulation)')
    assert.equal(evaluate(refresh.concurrency.group, context), 'feed-refresh-simulation')
    assert.equal(evaluate(refresh.jobs.refresh.if, context), false)
    assert.equal(evaluate(refresh.jobs.simulation.if, context), true)
    assert.equal(evaluate(refresh.jobs.alert.if, { needs: { refresh: { result: 'skipped' } } }), false)

    const temp = mkdtempSync(join(tmpdir(), 'kwip-refresh-test-'))
    t.after(() => rmSync(temp, { recursive: true, force: true }))
    const file = join(temp, 'output')
    const job = refresh.jobs.simulation
    const env = Object.fromEntries(Object.entries(job.env)
      .map(([key, expression]) => [key, String(evaluate(expression, context))]))
    const run = spawnSync('bash', ['-e', '-c', job.steps[0].run], {
      encoding: 'utf8', env: { ...process.env, ...env, GITHUB_OUTPUT: file },
    })
    assert.equal(run.status, status, run.stderr)
    const outputs = Object.fromEntries(readFileSync(file, 'utf8').trim().split('\n').map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }))
    const inputs = alertInputs(refresh.jobs.alert_simulation, 'simulation', status ? 'failure' : 'success', outputs)
    assert.equal(inputs.simulated, true)
    assert.equal(inputs.simulation_recovery, recovery)
    assert.deepEqual(JSON.parse(inputs.freshness), freshness)
    assert.deepEqual(JSON.parse(inputs.publication), publication)
  })
}
