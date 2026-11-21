import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADR_PATH, NOMINAL, acceptanceWith, pipelineRepository } from '../support/pipeline-repository.mjs'
import { git } from '../support/workspace.mjs'
import {
  NOMINAL_AGENTS, agentsOf, checkWith, elapsedMs, environmentText, eventsOf, findsNothingToChange, inWorkingCopy, journalText, lastOf, recorded, refusingHook, retry, runFile, runOn,
} from './support/injected-run.mjs'

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
