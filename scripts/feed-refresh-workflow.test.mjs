import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const dependencies = process.env.KWIP_WORKFLOW_TEST_DIR
assert.ok(dependencies, 'Set KWIP_WORKFLOW_TEST_DIR as shown in the README')
const { parse, stringify } = createRequire(join(dependencies, 'package.json'))('yaml')

function runWorkflow(t, event, payload, { failConfigure = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'kwip-refresh-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const workflows = join(directory, '.github/workflows')
  mkdirSync(workflows, { recursive: true })
  mkdirSync(join(directory, 'scripts'))
  for (const file of ['feed-refresh.yml', 'feed-refresh-issue.yml']) {
    const source = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8')
    const workflow = parse(source)
    if (file === 'feed-refresh.yml' && failConfigure) {
      workflow.jobs.configure.steps.find((step) => step.id === 'inputs').run = 'exit 97'
    }
    // The Actions runner executes the real jobs and shell steps. External setup
    // actions are stubbed because this fixture already provides the tools.
    for (const job of Object.values(workflow.jobs)) {
      // act's schema predates queue: max. The fixture runs one event at a time.
      if (job.concurrency) delete job.concurrency.queue
      if (!job.steps) continue
      job.steps = job.steps.map((step) => {
        if (!step.uses) return step
        const { uses, with: _inputs, ...rest } = step
        return { ...rest, run: `echo 'Stubbed ${uses}'` }
      })
    }
    writeFileSync(join(workflows, file), stringify(workflow))
  }

  writeFileSync(join(directory, 'scripts/collect-publish-feed.mjs'), `
    if (process.argv.slice(2).join(' ') !== '--bucket kwip-feed-prod --check-freshness') process.exit(90)
    console.log(JSON.stringify({ outcome: 'fresh' }))
  `)
  const traces = join(directory, 'trace')
  writeFileSync(traces, '')
  const stubs = join(directory, 'stubs.bash')
  writeFileSync(stubs, `
    node() {
      [[ "$1" == scripts/collect-publish-feed.mjs ]] || return 89
      shift
      command node "$KWIP_TEST_FIXTURE/scripts/collect-publish-feed.mjs" "$@"
    }
    pnpm() {
      case "$*" in
        '--dir scripts --ignore-workspace install --frozen-lockfile') return 0 ;;
        'publish:feed --bucket kwip-feed-prod')
          echo 'published by stub' >> "$KWIP_TEST_TRACE"
          echo '{"outcome":"unchanged","commitId":"fixture-recovery"}' ;;
        *) return 91 ;;
      esac
    }
    gh() {
      case "$1 $2" in
        'api --paginate')
          if [[ "$KWIP_TEST_FAIL_CONFIGURE" == true ]]; then
            echo '[[{"number":91,"body":"**Simulated incident**"}]]'
          else
            echo '[[{"number":91,"body":"**Simulated incident**"},{"number":42,"body":"Incident: failed"}]]'
          fi ;;
        'api --method')
          [[ "$3" == PATCH && "$4" == */issues/91 ]] || return 92
          printf '%s\\n' "$*" >> "$KWIP_TEST_TRACE" ;;
        'issue comment')
          [[ "$3" == 91 && "$4" == --body-file ]] || return 93
          cat "$5" >> "$KWIP_TEST_TRACE" ;;
        'issue close')
          printf '%s\\n' "$*" >> "$KWIP_TEST_TRACE" ;;
        'label list') echo 'feed-refresh' ;;
        'issue create')
          [[ "$3" == --title && "$5" == --label && "$6" == feed-refresh && "$7" == --body-file ]] || return 95
          printf '%s\\n' "$4" >> "$KWIP_TEST_TRACE"
          cat "$8" >> "$KWIP_TEST_TRACE" ;;
        *) return 94 ;;
      esac
    }
  `)
  const eventFile = join(directory, 'event.json')
  writeFileSync(eventFile, JSON.stringify(payload))
  for (const args of [
    ['init', '-q', '-b', 'schedule-fixture'],
    ['remote', 'add', 'origin', 'https://github.com/example/kwip.git'],
    ['add', '.'],
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Create workflow fixture'],
  ]) {
    const git = spawnSync('git', args, { cwd: directory, encoding: 'utf8' })
    assert.equal(git.status, 0, git.stderr)
  }

  const run = spawnSync(process.env.KWIP_ACT || 'act', [
    event, '-W', '.github/workflows/feed-refresh.yml', '-e', eventFile,
    '-P', 'ubuntu-latest=-self-hosted', '--secret', 'GITHUB_TOKEN=fixture-token',
    '--env', `BASH_ENV=${stubs}`, '--env', `KWIP_TEST_TRACE=${traces}`, '--env', `KWIP_TEST_FIXTURE=${directory}`,
    '--env', `KWIP_TEST_FAIL_CONFIGURE=${failConfigure}`,
  ], { cwd: directory, encoding: 'utf8', timeout: 60_000 })
  if (run.error) throw run.error
  return { status: run.status, log: run.stdout + run.stderr, trace: readFileSync(traces, 'utf8') }
}

function assertLiveRun(run) {
  assert.equal(run.status, 0, run.log)
  assert.match(run.log, /Run Main Publish feed/)
  assert.match(run.trace, /^published by stub$/m)
  assert.match(run.trace, /^issue close 42 --comment Feed refresh recovered at commit `fixture-recovery`\./m)
  assert.doesNotMatch(run.trace, /issue close 91|Simulated recovery/)
}

test('the no-input schedule runs the publisher and closes the live incident', (t) => {
  assertLiveRun(runWorkflow(t, 'schedule', { schedule: '*/15 * * * *' }))
})

for (const [event, payload] of [
  ['schedule', { schedule: '*/15 * * * *' }],
  ['workflow_dispatch', {}],
]) {
  test(`a no-input ${event} raises a live incident when configuration fails`, (t) => {
    const run = runWorkflow(t, event, payload, { failConfigure: true })
    assert.equal(run.status, 1, run.log)
    assert.match(run.log, /Failure - Main Resolve refresh inputs/)
    assert.doesNotMatch(run.log, /Run Main Publish feed|Run Main Simulate a refresh result/)
    assert.match(run.trace, /^Feed refresh is failing$/m, run.log)
    assert.match(run.trace, /^Incident: failed$/m)
    assert.match(run.trace, /^Publisher outcome: not reported$/m)
    assert.match(run.trace, /^Refresh input configuration failed\./m)
    assert.doesNotMatch(run.trace, /Simulated incident|published by stub|issue close/)
  })
}

test('a configuration failure during a rehearsal leaves live issues untouched', (t) => {
  const run = runWorkflow(t, 'workflow_dispatch', { inputs: { simulate: 'failed' } }, { failConfigure: true })
  assert.equal(run.status, 1, run.log)
  assert.match(run.log, /Failure - Main Resolve refresh inputs/)
  assert.equal(run.trace, '')
})

test('a bare dispatch takes the same live path', (t) => {
  assertLiveRun(runWorkflow(t, 'workflow_dispatch', {}))
})

for (const [mode, recovery, status, evidence] of [
  ['failed', false, 1, /Provider status: 503/],
  ['paused', false, 1, /The provider blocked the runner/],
  ['stale', false, 0, /listsVerifiedAt was 3600 seconds old/],
  ['none', true, 0, /issue close 91 --comment Simulated recovery/],
]) {
  test(`dispatch retains the ${recovery ? 'recovery' : mode} simulation shape`, (t) => {
    const run = runWorkflow(t, 'workflow_dispatch', { inputs: { simulate: mode, simulate_recovery: String(recovery) } })
    assert.equal(run.status, status, run.log)
    assert.doesNotMatch(run.log, /Run Main Publish feed/)
    assert.doesNotMatch(run.trace, /published by stub|issue close 42/)
    assert.match(run.trace, evidence, run.log)
  })
}
