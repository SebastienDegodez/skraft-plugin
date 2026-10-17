import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, actsAs, simulatedContext } from './simulated-host.mjs'
import {
  LENSES, NOMINAL, SECURITY_AGENT, SLUG, WRONG_PAY, blocked, commit, deliverWith, fillOutputs, batchesSorted, lensDispatches, lensLabels, pipelineRepository, reviewsOf,
  scriptedLlm, writeResult, writesOnly,
} from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'

/** Runs the workflow for a new slug on the repository, the scripted LLM answering every agent call. */
const runOn = async (cwd, { acts, reviews, args = {} } = {}) => {
  const llm = scriptedLlm({ cwd, acts, reviews })
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG, ...args }, otherwise: actsAs(llm) })
  const outcome = await runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot: PLUGIN_ROOT })
  return { outcome, calls, logs, events: journal(cwd, SLUG) }
}

const recorded = (events, step) => events.filter((event) => event.type === 'step.recorded' && event.step === step)

test('the four phases run on a real repository: each agent commits its part, the gates run the tests, DELIVER closes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, logs, events } = await runOn(cwd, { args: { issue: 42, title: 'Pay by card' } })

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  assert.deepEqual(batchesSorted(calls.map(({ agent, label }) => `${agent} | ${label}`)), batchesSorted([
    `skraft:solution-researcher | skraft ${SLUG} · research · attempt 1`,
    `skraft:solution-architect | skraft ${SLUG} · design · attempt 1`,
    ...lensDispatches('design_review'),
    `skraft:acceptance-designer | skraft ${SLUG} · distill · attempt 1`,
    ...lensDispatches('distill_review'),
    `skraft:software-engineer | skraft ${SLUG} · deliver · attempt 1`,
    ...lensDispatches('deliver_review'),
  ]))
  assert.deepEqual(calls.filter((call) => !call.prompt.includes('- Story: #42 — Pay by card')).map(({ agent }) => agent), ['skraft:cold-reader-lens'])
  assert.deepEqual(reviewsOf(events), [['design_review', 1, 'approved', 'distill'], ['distill_review', 1, 'approved', 'deliver'], ['deliver_review', 1, 'approved', 'exit']])
  assert.deepEqual(events.filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran').map(({ component, gate, status }) => `${component}/${gate} ${status}`), ['app/test pass'])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked').map(({ step, commits }) => [step, commits.map(({ subject, kind, verdict, replay }) => [subject, kind, verdict, replay?.exitCode ?? null])]), [
    ['design', [[`docs(${SLUG}): record the card payment decision`, 'other', 'ok', null]]],
    ['distill', [[`test(${SLUG}): pay by card`, 'red', 'ok', 1]]],
    ['deliver', [[`test(${SLUG}): pay a card amount`, 'red', 'ok', 1], [`feat(${SLUG}): pay by card`, 'green', 'ok', null]]],
  ])
  assert.deepEqual(events.at(-1).type, 'run.finished')
  assert.deepEqual([events.at(-1).status, events.at(-1).reason], ['completed', 'DELIVER closed'])
  assert.deepEqual(logs.filter((line) => line.startsWith('phase ')), ['phase RESEARCH', 'phase DESIGN', 'phase DISTILL', 'phase DELIVER'])
  assert.equal(logs.at(-1), `${SLUG}: done: DELIVER closed`)
})

test('an architect that writes outside its write scope is refused, and its next brief names the file', async (t) => {
  const { cwd } = pipelineRepository(t)
  const hacks = (brief, repository) => {
    NOMINAL['solution-architect'](brief, repository)
    mkdirSync(join(cwd, 'src'))
    writeFileSync(join(cwd, 'src', 'hack.mjs'), 'export const hack = true\n')
  }
  const cleans = (brief) => {
    rmSync(join(cwd, 'src', 'hack.mjs'))
    writeResult(brief, { status: 'done', summary: 'hack removed' })
  }

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'solution-architect': [hacks, cleans], 'acceptance-designer': [blocked('stop after the design')] } })

  assert.deepEqual(batchesSorted(calls.map((call) => call.label)), batchesSorted([
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · attempt 2`, ...lensLabels('design_review'),
    `skraft ${SLUG} · distill · attempt 1`,
  ]))
  assert.deepEqual(recorded(events, 'design').map(({ attempt, outcome: result, code, failures }) => [attempt, result, code, failures]), [
    [1, 'failed', 'write-scope', ['out of write scope: src/hack.mjs']],
    [2, 'done', null, []],
  ])
  assert.ok(calls[2].prompt.includes('Refused in attempt 1 of 3:\n- out of write scope: src/hack.mjs'), calls[2].prompt)
  assert.deepEqual([outcome.status, outcome.phase, outcome.code, outcome.reason], ['blocked', 'DISTILL', 'agent-blocked', 'acceptance-designer is blocked: stop after the design'])
})

test('a researcher that writes the same invalid result twice is blocked without a third dispatch', async (t) => {
  const { cwd } = pipelineRepository(t)
  const invalid = writesOnly('{"status": "finished", "summary": "all good"}')

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'solution-researcher': [invalid, invalid, NOMINAL['solution-researcher']] } })

  assert.equal(calls.length, 2)
  assert.ok(calls[1].prompt.includes(`Refused in attempt 1 of 3:\n- result status must be "done" or "blocked"`), calls[1].prompt)
  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'invalid-result',
    reason: `solution-researcher failed the same way on attempts 1 and 2: result status must be "done" or "blocked"`,
  })
  assert.equal(events.filter((event) => event.type === 'step.started').length, 2)
})

test('gates that fail send DELIVER back as pass 2 with the failing gate in its brief, then the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'software-engineer': [deliverWith(WRONG_PAY)] } })

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  const delivering = calls.slice(3 + LENSES.design_review.length + LENSES.distill_review.length)
  assert.deepEqual(batchesSorted(delivering.map((call) => call.label)), batchesSorted([`skraft ${SLUG} · deliver · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · attempt 1`, ...lensLabels('deliver_review')]))
  assert.ok(delivering[1].prompt.includes('- Pass: 2, after the gates sent the work back'), delivering[1].prompt)
  assert.match(delivering[1].prompt, /\nThe gates failed on pass 1:\n- app\/test: exited 1 \(evidence: .+test-1\.log\)/)
  assert.deepEqual(recorded(events, 'gates').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'fail', 'deliver'], [2, 'pass', 'deliver_review']])
  assert.deepEqual(recorded(events, 'deliver_review').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'approved', 'exit']])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'deliver').map(({ visit, commits }) => [visit, commits.map(({ kind, verdict }) => `${kind} ${verdict}`)]), [
    [1, ['red ok', 'green ok']],
    [2, ['red ok', 'green ok']],
  ])
  assert.equal(git(cwd, 'show', 'HEAD:src/pay.mjs'), 'export const pay = (amount) => `paid ${amount}`')
})

test('a test commit whose tests pass is refused as not red', async (t) => {
  const { cwd } = pipelineRepository(t)
  const green = (brief) => {
    fillOutputs(brief)
    commit(cwd, `test(${SLUG}): pay by card`, { 'tests/check.mjs': "console.log('nothing checked')\n" })
    writeResult(brief, { status: 'done', summary: 'acceptance test committed' })
  }

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'acceptance-designer': [green, blocked('cannot make it fail')] } })

  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const refusal = `commit ${sha} "test(${SLUG}): pay by card" is not red: the tests of app pass at it; a test commit must fail before the code that makes it pass`
  assert.deepEqual(recorded(events, 'distill')[0].failures, [refusal])
  assert.equal(recorded(events, 'distill')[0].code, 'tdd')
  assert.deepEqual(events.find((event) => event.type === 'commits.checked' && event.step === 'distill').commits.map(({ verdict, replay }) => [verdict, replay.component, replay.exitCode]), [['not-red', 'app', 0]])
  const retried = calls.find((call) => call.label === `skraft ${SLUG} · distill · attempt 2`)
  assert.ok(retried.prompt.includes(`Refused in attempt 1 of 3:\n- ${refusal}`), retried.prompt)
  assert.deepEqual([outcome.code, outcome.reason], ['agent-blocked', 'acceptance-designer is blocked: cannot make it fail'])
})

test('a repository workflow dispatches its own agent between the architect and the acceptance designer, under its bare id', async (t) => {
  const { cwd } = pipelineRepository(t, { security: true })

  const { outcome, calls, events } = await runOn(cwd)

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  assert.deepEqual(calls.map(({ agent }) => agent), [
    'skraft:solution-researcher', 'skraft:solution-architect', SECURITY_AGENT, 'skraft:acceptance-designer', 'skraft:software-engineer',
  ])
  assert.equal(calls[2].label, `skraft ${SLUG} · security · attempt 1`)
  assert.match(calls[2].prompt, new RegExp(`^## Skraft dispatch: ${SECURITY_AGENT} \\(DESIGN\\)\\n`))
  assert.equal(events[0].workflow, 'skraft-workflow.dot')
})

test('fromArtifacts reaches Init: a slug with no DISCUSS stories is refused before any agent starts', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG, fromArtifacts: true } })

  const outcome = await runSkraftPipelineWorkflow(ctx, { cwd, pluginRoot: PLUGIN_ROOT })

  assert.deepEqual([outcome.status, outcome.code], ['refused', 'no-artifacts'])
  assert.deepEqual(calls, [])
  assert.equal(logs.at(-1), `skraft: refused (no-artifacts): ${SLUG} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`)
})
