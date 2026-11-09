import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADR_PATH, CHECK, SCENARIOS, SKELETON, acceptanceWith, fillOutputs, pipelineRepository, writeResult } from '../support/pipeline-repository.mjs'
import { git } from '../support/workspace.mjs'
import {
  NOMINAL_AGENTS, agentsOf, checkWith, elapsedMs, environmentText, eventsOf, inWorkingCopy, journalText, lastOf, recorded, refusingHook, retry, runFile, runOn,
} from './support/injected-run.mjs'

/** What a Testcontainers test writes in its JUnit report when neither Docker nor Podman answers. */
const NO_RUNTIME_REPORT = '<testsuite name="check" tests="1" errors="1"><testcase classname="check" name="pay answers the amount paid"><error message="Could not find a valid Docker environment. Please see logs and check configuration" type="java.lang.IllegalStateException"/></testcase></testsuite>\n'
const NO_RUNTIME_LOG = 'ERROR org.testcontainers.dockerclient.DockerClientProviderStrategy - Could not find a valid Docker environment. Please check configuration.'

/**
 * The acceptance designer committing CHECK red with its skeleton, and nothing else: the change the
 * developer made to skraft-config.json stays out of its commit.
 * @type {import('../support/pipeline-repository.mjs').Act}
 */
const commitsItsTestAlone = (brief, { cwd, slug }) => {
  fillOutputs(brief, `pay(10) answers paid 10.\n${SCENARIOS}`)
  mkdirSync(join(cwd, 'tests', 'unit'), { recursive: true })
  mkdirSync(join(cwd, 'src'), { recursive: true })
  writeFileSync(join(cwd, 'tests', 'unit', 'check.mjs'), CHECK)
  writeFileSync(join(cwd, 'src', 'pay.mjs'), SKELETON)
  git(cwd, 'add', '--', 'tests/unit/check.mjs', 'src/pay.mjs')
  git(cwd, 'commit', '-q', '-m', `test(${slug}): pay by card`)
  writeResult(brief, { status: 'done', summary: 'acceptance test committed red' })
}

test('a pre-commit hook that refuses the ratification commit asks a human to fix the machine, with Git\'s output in logs/commit-adr.log and never in the journal; once the hook is gone, RETRY commits the ratification and the run completes with no agent dispatched again', async (t) => {
  const { cwd } = pipelineRepository(t)
  const message = 'pre-commit: commits are frozen until release 4.2 ships'
  let hook = null
  const ratifies = () => {
    hook ??= refusingHook(cwd, message)
    return 'RATIFIED'
  }

  const { mod, dialogs, outcome } = await runOn(cwd, { answers: { ADR: ratifies } })

  const events = eventsOf(cwd)
  const log = runFile(cwd, 'logs/commit-adr.log')
  const asked = lastOf(events, 'question.asked', 'environment')
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DESIGN', 'environment'])
  assert.deepEqual([asked.step, asked.options, asked.incident], ['adr', ['RETRY', 'ABORT'], { owner: 'environment', log }])
  assert.equal(asked.text, environmentText(cwd, 'adr', { reason: 'git commit failed: exit 1', owner: 'environment', log }))
  assert.ok(readFileSync(log, 'utf8').includes(message), readFileSync(log, 'utf8'))
  assert.equal(journalText(cwd).includes(message), false)
  assert.equal(git(cwd, 'log', '--format=%s', '--', ADR_PATH).includes('docs(adr): ratify ADR-001'), false)
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect'])
  assert.deepEqual(dialogs.map(({ header }) => header), ['ADR', 'Environment'])
  assert.equal(dialogs[1].spawns, dialogs[0].spawns)
  const refused = events.find((event) => event.type === 'question.answered' && event.answer === 'RATIFIED')
  t.diagnostic(`cost: 0 agent dispatches; ${elapsedMs(refused, asked)} ms from the refused ratification commit to the environment question`)

  rmSync(hook)
  const retried = await retry(mod)

  assert.equal(retried.outcome.status, 'done', retried.outcome.reason)
  assert.equal(git(cwd, 'log', '-1', '--format=%s', '--', ADR_PATH), 'docs(adr): ratify ADR-001')
  assert.deepEqual(agentsOf(mod.spawns), NOMINAL_AGENTS)
  assert.deepEqual(dialogs.map(({ header }) => header), ['ADR', 'Environment', 'Scenarios'])
})

test('tests that find no container runtime when the acceptance red is replayed ask a human to start Docker or Podman, the replay log as output; the acceptance designer is not dispatched again, and RETRY once a runtime answers replays the red and the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)
  const runtime = join(cwd, '..', 'container-runtime-up')
  const containerTests = checkWith([
    `if (!fs.existsSync(${JSON.stringify(runtime)})) {`,
    `  console.error(${JSON.stringify(NO_RUNTIME_LOG)})`,
    "  fs.mkdirSync('reports', { recursive: true })",
    `  fs.writeFileSync('reports/junit.xml', ${JSON.stringify(NO_RUNTIME_REPORT)})`,
    '  process.exit(1)',
    '}',
  ].join('\n'))

  const { mod, dialogs, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [acceptanceWith(containerTests)] } })

  const events = eventsOf(cwd)
  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const log = runFile(cwd, `logs/replay-${sha}-app-test.log`)
  const asked = lastOf(events, 'question.asked', 'environment')
  const reason = `replaying ${sha} for app: no container runtime answers (Docker or Podman), so the tests that need one could not run; start Docker or Podman, then retry`
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DISTILL', 'environment'])
  assert.deepEqual([asked.step, asked.incident], ['distill', { owner: 'environment', log }])
  assert.equal(asked.text, environmentText(cwd, 'distill', { reason, owner: 'environment', log }))
  assert.ok(readFileSync(log, 'utf8').includes('Could not find a valid Docker environment'), readFileSync(log, 'utf8'))
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer'])
  assert.deepEqual(recorded(events, 'distill'), [])
  assert.equal(dialogs.at(-1).spawns, mod.spawns.length)
  const replayed = lastOf(events, 'commits.checked')
  t.diagnostic(`cost: 0 agent dispatches, no attempt recorded; ${elapsedMs(replayed, asked)} ms from the replay to the environment question, ${elapsedMs(lastOf(events, 'step.started'), asked)} ms since distill started`)

  writeFileSync(runtime, 'up\n')
  const retried = await retry(mod)

  assert.equal(retried.outcome.status, 'done', retried.outcome.reason)
  assert.deepEqual(agentsOf(mod.spawns), NOMINAL_AGENTS)
  assert.deepEqual(recorded(eventsOf(cwd), 'distill').map(({ attempt, outcome: result }) => [attempt, result]), [[1, 'done']])
})

test('a test command whose program does not exist asks a human at the replay of the acceptance red, saying it could not start the program; no agent is dispatched again, and RETRY once skraft-config.json names a program that starts goes on to completion', async (t) => {
  const { cwd } = pipelineRepository(t)
  const configPath = join(cwd, 'skraft-config.json')
  const config = readFileSync(configPath, 'utf8')
  const parsed = JSON.parse(config)
  writeFileSync(configPath, JSON.stringify({ ...parsed, components: [{ ...parsed.components[0], commands: { ...parsed.components[0].commands, test: 'skraft-no-such-runner tests/unit/check.mjs' } }] }, null, 2))

  const { mod, dialogs, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [commitsItsTestAlone] } })

  const events = eventsOf(cwd)
  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const log = runFile(cwd, `logs/replay-${sha}-app-test.log`)
  const asked = lastOf(events, 'question.asked', 'environment')
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DISTILL', 'environment'])
  assert.deepEqual([asked.step, asked.incident], ['distill', { owner: 'environment', log }])
  assert.equal(asked.text, environmentText(cwd, 'distill', { reason: `replaying ${sha} for app: could not start skraft-no-such-runner`, owner: 'environment', log }))
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer'])
  assert.deepEqual(recorded(events, 'distill'), [])
  assert.equal(dialogs.at(-1).spawns, mod.spawns.length)
  const replayed = lastOf(events, 'commits.checked')
  t.diagnostic(`cost: 0 agent dispatches, no attempt recorded; ${elapsedMs(replayed, asked)} ms from the replay to the environment question, ${elapsedMs(lastOf(events, 'step.started'), asked)} ms since distill started`)

  writeFileSync(configPath, config)
  const retried = await retry(mod)

  assert.equal(retried.outcome.status, 'done', retried.outcome.reason)
  assert.deepEqual(agentsOf(mod.spawns), NOMINAL_AGENTS)
})

test('a test command that crashes in the gates (exit 139) stops the run on the environment question, cause unknown, the gate\'s log as output; the engineer is not dispatched again, and RETRY once it no longer crashes runs the gates again and the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)
  const fixed = join(cwd, '..', 'crash-fixed')
  const crashing = checkWith([
    `if (${inWorkingCopy(cwd)} && !fs.existsSync(${JSON.stringify(fixed)})) {`,
    "  console.error('Segmentation fault (core dumped)')",
    '  process.exit(139)',
    '}',
  ].join('\n'))

  const { mod, dialogs, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [acceptanceWith(crashing)] } })

  const events = eventsOf(cwd)
  const log = runFile(cwd, 'gates/app/test-1.log')
  const asked = lastOf(events, 'question.asked', 'environment')
  const reason = `app/test: was stopped by a signal or crashed (exit 139), not by a failing check (evidence: ${log})`
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DELIVER', 'environment'])
  assert.deepEqual([asked.step, asked.incident], ['gates', { owner: 'unknown', log }])
  assert.equal(asked.text, environmentText(cwd, 'gates', { reason, owner: 'unknown', log }))
  assert.ok(readFileSync(log, 'utf8').includes('Segmentation fault'), readFileSync(log, 'utf8'))
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer'])
  assert.deepEqual(recorded(events, 'gates'), [])
  assert.equal(dialogs.at(-1).spawns, mod.spawns.length)
  const crashed = events.find((event) => event.type === 'gate.ran' && event.status === 'fail')
  t.diagnostic(`cost: 0 agent dispatches, no gate pass recorded; ${elapsedMs(crashed, asked)} ms from the crashed gate to the environment question`)

  writeFileSync(fixed, 'fixed\n')
  const retried = await retry(mod)

  assert.equal(retried.outcome.status, 'done', retried.outcome.reason)
  assert.deepEqual(agentsOf(mod.spawns), NOMINAL_AGENTS)
  assert.deepEqual(recorded(eventsOf(cwd), 'gates').map(({ visit, outcome: result }) => [visit, result]), [[1, 'pass']])
})
