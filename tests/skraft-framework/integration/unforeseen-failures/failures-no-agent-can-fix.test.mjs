import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADR_PATH, CHECK, NOMINAL, SCENARIOS, SKELETON, acceptanceWith, fillOutputs, judgeVerdict, pipelineRepository, writeResult } from '../support/pipeline-repository.mjs'
import { git } from '../support/workspace.mjs'
import {
  NOMINAL_AGENTS, agentsOf, checkWith, elapsedMs, environmentText, eventsOf, findsNothingToChange, inWorkingCopy, journalText, lastOf, recorded, refusingHook, retry, runFile, runOn,
} from './support/injected-run.mjs'

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
  assert.deepEqual([asked.step, asked.options, asked.incident.owner, asked.incident.log], ['adr', ['RETRY', 'ABORT'], 'environment', log])
  assert.deepEqual([asked.incidents[0].category, asked.incidents[0].attempts, asked.incidents[0].argv], ['environment', 1, ['git', 'commit']])
  assert.ok(asked.text.startsWith(environmentText(cwd, 'adr', { reason: 'git commit failed: exit 1', owner: 'environment', log }).split('\nThe run so far')[0]))
  assert.match(asked.text, /Incidents: adr signature .*1 occurrences; log .*commit-adr\.log\./)
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

test('tests that find no container runtime when the acceptance red is replayed go to the replay judge, which asks a human to start Docker or Podman, its answer as output; the acceptance designer is not dispatched again, and RETRY once a runtime answers replays and judges the red again, and the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)
  const runtime = join(cwd, '..', 'container-runtime-up')
  const containerTests = checkWith([
    `if (!fs.existsSync(${JSON.stringify(runtime)})) {`,
    `  console.error(${JSON.stringify(NO_RUNTIME_LOG)})`,
    '  process.exit(1)',
    '}',
  ].join('\n'))

  const { mod, llm, dialogs, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [acceptanceWith(containerTests)] }, judges: [judgeVerdict('ask-human', 'no container runtime answers: start Docker or Podman, then retry')] })

  const events = eventsOf(cwd)
  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const log = runFile(cwd, `logs/replay-${sha}-app-test.log`)
  const answer = runFile(cwd, `logs/judge-${sha}-red.md`)
  const asked = lastOf(events, 'question.asked', 'environment')
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DISTILL', 'environment'])
  assert.deepEqual([asked.step, asked.incident], ['distill', { owner: 'judge', log: answer }])
  assert.ok(asked.text.startsWith(environmentText(cwd, 'distill', { reason: `the replay judge asks a human about the red commit ${sha}: read ${answer}`, owner: 'judge', log: answer }).split('\nThe run so far')[0]))
  assert.match(asked.text, /Commits: .*Step verdicts:.*Incidents: none\./s)
  assert.ok(readFileSync(log, 'utf8').includes('Could not find a valid Docker environment'), readFileSync(log, 'utf8'))
  assert.ok(readFileSync(answer, 'utf8').includes('start Docker or Podman'), readFileSync(answer, 'utf8'))
  assert.ok(llm.judged[0].includes(`printed to ${log}\n`), llm.judged[0])
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer'])
  assert.deepEqual(recorded(events, 'distill'), [])
  assert.equal(dialogs.at(-1).spawns, mod.spawns.length)
  const replayed = lastOf(events, 'commits.checked')
  t.diagnostic(`cost: 0 agent dispatches, 1 judge, no attempt recorded; ${elapsedMs(replayed, asked)} ms from the replay to the environment question, ${elapsedMs(lastOf(events, 'step.started'), asked)} ms since distill started`)

  writeFileSync(runtime, 'up\n')
  const retried = await retry(mod)

  assert.equal(retried.outcome.status, 'done', retried.outcome.reason)
  assert.deepEqual(agentsOf(mod.spawns), NOMINAL_AGENTS)
  assert.deepEqual(recorded(eventsOf(cwd), 'distill').map(({ attempt, outcome: result }) => [attempt, result]), [[1, 'done']])
})

test('a test command whose program does not exist escalates to config with its replay log and no judge; RETRY after fixing skraft-config.json completes without a new attempt', async (t) => {
  const { cwd } = pipelineRepository(t)
  const configPath = join(cwd, 'skraft-config.json')
  const config = readFileSync(configPath, 'utf8')
  const parsed = JSON.parse(config)
  writeFileSync(configPath, JSON.stringify({ ...parsed, components: [{ ...parsed.components[0], commands: { ...parsed.components[0].commands, test: 'skraft-no-such-runner tests/unit/check.mjs' } }] }, null, 2))

  const { mod, llm, dialogs, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [commitsItsTestAlone] } })

  const events = eventsOf(cwd)
  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const log = runFile(cwd, `logs/replay-${sha}-app-test.log`)
  const asked = lastOf(events, 'question.asked', 'environment')
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DISTILL', 'environment'])
  assert.deepEqual([asked.step, asked.incident], ['distill', { owner: 'config', log }])
  assert.ok(asked.text.startsWith(environmentText(cwd, 'distill', {
    reason: 'skraft-no-such-runner tests/unit/check.mjs could not start; change it in skraft-config.json',
    owner: 'config', log,
  }).split('\nThe run so far')[0]))
  assert.deepEqual(llm.judged, [])
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer'])
  assert.deepEqual(recorded(events, 'distill'), [])
  assert.equal(dialogs.at(-1).spawns, mod.spawns.length)
  const replayed = lastOf(events, 'commits.checked')
  t.diagnostic(`cost: 0 agent dispatches, no judge, no attempt recorded; ${elapsedMs(replayed, asked)} ms from the replay to the environment question, ${elapsedMs(lastOf(events, 'step.started'), asked)} ms since distill started`)

  writeFileSync(configPath, config)
  const retried = await retry(mod)

  assert.equal(retried.outcome.status, 'done', retried.outcome.reason)
  assert.deepEqual(agentsOf(mod.spawns), NOMINAL_AGENTS)
})

test('a test command that crashes in the gates (exit 139) requests a host judgment, never a human dialog or an engineer retry', async (t) => {
  const { cwd } = pipelineRepository(t)
  const fixed = join(cwd, '..', 'crash-fixed')
  const crashing = checkWith([
    `if (${inWorkingCopy(cwd)} && !fs.existsSync(${JSON.stringify(fixed)})) {`,
    "  console.error('Segmentation fault (core dumped)')",
    '  process.exit(139)',
    '}',
  ].join('\n'))
  const fixesTheCrash = (brief, context) => {
    writeFileSync(fixed, 'fixed\n')
    findsNothingToChange(brief, context)
  }

  const { mod, dialogs, outcome } = await runOn(cwd, { acts: { 'acceptance-designer': [acceptanceWith(crashing)], 'software-engineer': [NOMINAL['software-engineer'], fixesTheCrash] } })

  const events = eventsOf(cwd)
  const log = runFile(cwd, 'gates/app/test-1.log')
  const asked = lastOf(events, 'question.asked', 'unforeseen')
  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['waiting', 'DELIVER', 'unforeseen'])
  assert.deepEqual([asked.step, asked.options, asked.incident.owner, asked.incident.log], ['gates', ['RETRY', 'RETRY_WITH_NOTE', 'SEND_TO:deliver', 'STOP'], 'unknown', log])
  assert.match(asked.text, /This is not a human question/)
  assert.equal(dialogs.some(({ header }) => header === 'Incident'), false)
  assert.deepEqual(recorded(events, 'gates'), [])
  assert.ok(readFileSync(log, 'utf8').includes('Segmentation fault'), readFileSync(log, 'utf8'))
  assert.equal(journalText(cwd).includes('Segmentation fault'), false)
  assert.deepEqual(agentsOf(mod.spawns), ['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer'])
  t.diagnostic('cost: 1 engineer dispatch; the crash is held for one host judgment, with no paid model call in this test')
})
