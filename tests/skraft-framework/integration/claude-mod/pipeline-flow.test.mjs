import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { actsAs, scriptedModHost } from './support/scripted-mod-host.mjs'
import {
  LENSES, NOMINAL, SECURITY_AGENT, SLUG, WRONG_PAY, blocked, briefOf, commit, deliverWith, fillOutputs, lensDispatches, lensLabels, pipelineRepository, reviewsOf,
  scriptedLlm, writeResult, writesOnly,
} from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'

/** `/skraft <args>` on the repository, the scripted LLM answering every spawn, until the run stops. */
const runOn = async (cwd, { acts, reviews, args = SLUG } = {}) => {
  const llm = scriptedLlm({ cwd, acts, reviews })
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(llm) })
  const text = await mod.command(args)
  const outcome = await mod.settled()
  return { text, outcome, mod, spawns: mod.spawns, events: journal(cwd, SLUG) }
}

const recorded = (events, step) => events.filter((event) => event.type === 'step.recorded' && event.step === step)

test('/skraft runs the four phases on a real repository: each subagent commits its part, the gates run the tests, DELIVER closes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { text, outcome, mod, spawns, events } = await runOn(cwd, { args: `${SLUG} #42 Pay by card` })

  assert.equal(text, `skraft ${SLUG} started — progress in the Skraft pane.`)
  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  assert.deepEqual(spawns.map(({ subagentType, description }) => `${subagentType} | ${description}`), [
    `skraft:solution-researcher | skraft ${SLUG} · research · attempt 1`,
    `skraft:solution-architect | skraft ${SLUG} · design · attempt 1`,
    ...lensDispatches('design_review'),
    `skraft:acceptance-designer | skraft ${SLUG} · distill · attempt 1`,
    ...lensDispatches('distill_review'),
    `skraft:software-engineer | skraft ${SLUG} · deliver · attempt 1`,
    ...lensDispatches('deliver_review'),
  ])
  assert.deepEqual(spawns.filter((spawn) => !spawn.prompt.includes('- Story: #42 — Pay by card')).map(({ subagentType }) => subagentType), ['skraft:cold-reader-lens'])
  assert.deepEqual(reviewsOf(events), [['design_review', 1, 'approved', 'distill'], ['distill_review', 1, 'approved', 'deliver'], ['deliver_review', 1, 'approved', 'exit']])
  assert.deepEqual(events.filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER'])
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran').map(({ component, gate, status }) => `${component}/${gate} ${status}`), ['app/test pass'])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked').map(({ step, commits }) => [step, commits.map(({ kind, verdict, replay }) => `${kind} ${verdict} ${replay?.exitCode ?? '-'}`)]), [
    ['design', ['other ok -']],
    ['distill', ['red ok 1']],
    ['deliver', ['red ok 1', 'green ok -']],
  ])
  assert.deepEqual([events.at(-1).type, events.at(-1).status], ['run.finished', 'completed'])
  assert.deepEqual(mod.statuses, [`skraft ${SLUG} · RESEARCH`, `skraft ${SLUG} · DESIGN`, `skraft ${SLUG} · DISTILL`, `skraft ${SLUG} · DELIVER`, undefined])
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: gates (build, format, lint, test, architecture, coverage, mutation)`), mod.published.at(-1).log.join('\n'))
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: design_review (consistency, architecture-compliance, fitness)`), mod.published.at(-1).log.join('\n'))
  assert.equal(mod.notes.at(-1), `skraft ${SLUG}: done — DELIVER closed`)
  assert.equal(await mod.command(''), `skraft ${SLUG} — done\n✓ RESEARCH\n✓ DESIGN\n✓ DISTILL\n✓ DELIVER\nDELIVER closed`)
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

  const { outcome, spawns, events } = await runOn(cwd, { acts: { 'solution-architect': [hacks, cleans], 'acceptance-designer': [blocked('stop after the design')] } })

  assert.deepEqual(spawns.map((spawn) => spawn.description), [
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · attempt 2`, ...lensLabels('design_review'),
    `skraft ${SLUG} · distill · attempt 1`,
  ])
  assert.deepEqual(recorded(events, 'design').map(({ attempt, outcome: result, code, failures }) => [attempt, result, code, failures]), [
    [1, 'failed', 'write-scope', ['out of write scope: src/hack.mjs']],
    [2, 'done', null, []],
  ])
  assert.ok(spawns[2].prompt.includes('Refused in attempt 1 of 3:\n- out of write scope: src/hack.mjs'), spawns[2].prompt)
  assert.deepEqual([outcome.phase, outcome.code, outcome.reason], ['DISTILL', 'agent-blocked', 'acceptance-designer is blocked: stop after the design'])
})

test('a researcher that writes the same invalid result twice is blocked without a third spawn', async (t) => {
  const { cwd } = pipelineRepository(t)
  const invalid = writesOnly('{"status": "finished", "summary": "all good"}')

  const { outcome, spawns, mod } = await runOn(cwd, { acts: { 'solution-researcher': [invalid, invalid, NOMINAL['solution-researcher']] } })

  const { result } = briefOf(spawns[0].prompt)
  assert.equal(spawns.length, 2)
  assert.ok(spawns[1].prompt.includes(`Refused in attempt 1 of 3:\n- result status must be "done" or "blocked"`), spawns[1].prompt)
  assert.deepEqual([result, briefOf(spawns[1].prompt).result].map((path) => path.split(/[\\/]/).at(-1)), ['research-1-1.json', 'research-1-2.json'])
  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'invalid-result',
    reason: `solution-researcher failed the same way on attempts 1 and 2: result status must be "done" or "blocked"`,
  })
  assert.equal(mod.notes.at(-1), `skraft ${SLUG}: blocked (invalid-result) — ${outcome.reason}`)
})

test('gates that fail send DELIVER back as pass 2 with the failing gate in its brief, then the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, spawns, events, mod } = await runOn(cwd, { acts: { 'software-engineer': [deliverWith(WRONG_PAY)] } })

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  const delivering = spawns.slice(3 + LENSES.design_review.length + LENSES.distill_review.length)
  assert.deepEqual(delivering.map((spawn) => spawn.description), [`skraft ${SLUG} · deliver · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · attempt 1`, ...lensLabels('deliver_review')])
  assert.ok(delivering[1].prompt.includes('- Pass: 2, after the gates sent the work back'), delivering[1].prompt)
  assert.match(delivering[1].prompt, /\nThe gates failed on pass 1:\n- app\/test: exited 1 \(evidence: .+test-1\.log\)/)
  assert.deepEqual(recorded(events, 'gates').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'fail', 'deliver'], [2, 'pass', 'deliver_review']])
  assert.deepEqual(recorded(events, 'deliver_review').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'approved', 'exit']])
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: software-engineer, pass 2, attempt 1`), mod.published.at(-1).log.join('\n'))
  assert.equal(git(cwd, 'show', 'HEAD:src/pay.mjs'), 'export const pay = (amount) => `paid ${amount}`')
})

test('a test commit whose tests pass is refused as not red', async (t) => {
  const { cwd } = pipelineRepository(t)
  const green = (brief) => {
    fillOutputs(brief)
    commit(cwd, `test(${SLUG}): pay by card`, { 'tests/check.mjs': "console.log('nothing checked')\n" })
    writeResult(brief, { status: 'done', summary: 'acceptance test committed' })
  }

  const { outcome, spawns, events } = await runOn(cwd, { acts: { 'acceptance-designer': [green, blocked('cannot make it fail')] } })

  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const refusal = `commit ${sha} "test(${SLUG}): pay by card" is not red: the tests of app pass at it; a test commit must fail before the code that makes it pass`
  assert.deepEqual(recorded(events, 'distill').map(({ code, failures }) => [code, failures]), [['tdd', [refusal]], ['agent-blocked', ['cannot make it fail']]])
  const retried = spawns.find((spawn) => spawn.description === `skraft ${SLUG} · distill · attempt 2`)
  assert.ok(retried.prompt.includes(`Refused in attempt 1 of 3:\n- ${refusal}`), retried.prompt)
  assert.deepEqual([outcome.code, outcome.reason], ['agent-blocked', 'acceptance-designer is blocked: cannot make it fail'])
})

test('a repository workflow spawns its own agent between the architect and the acceptance designer, under its bare id', async (t) => {
  const { cwd } = pipelineRepository(t, { security: true })

  const { outcome, spawns, mod } = await runOn(cwd)

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  assert.deepEqual(spawns.map(({ subagentType }) => subagentType), [
    'skraft:solution-researcher', 'skraft:solution-architect', SECURITY_AGENT, 'skraft:acceptance-designer', 'skraft:software-engineer',
  ])
  assert.equal(spawns[2].description, `skraft ${SLUG} · security · attempt 1`)
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: ${SECURITY_AGENT}, attempt 1`))
})

test('/skraft <slug> --from-artifacts starts in DESIGN from the stories the mod finds through Git, and is refused without them', async (t) => {
  const { cwd } = pipelineRepository(t)
  const refused = await scriptedModHost({ cwd })
  assert.equal(await refused.command(`${SLUG} --from-artifacts`), `skraft ${SLUG}: not started — ${SLUG} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`)
  assert.deepEqual(refused.spawns, [])

  const stories = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'plans', '2026-10-01', 'stories-v1.md')
  mkdirSync(join(stories, '..'), { recursive: true })
  writeFileSync(stories, '# Stories\n\n- Pay by card\n')
  const { outcome, spawns, events } = await runOn(cwd, { args: `${SLUG} --from-artifacts`, acts: { 'solution-architect': [blocked('stop after reading the stories')] } })

  assert.deepEqual(events.slice(0, 2).map(({ type, phase, skipped }) => [type, phase ?? null, skipped ?? null]), [['run.started', null, null], ['phase.closed', 'RESEARCH', 'from-artifacts']])
  assert.deepEqual(events[0].artifacts, ['plans/2026-10-01/stories-v1.md'])
  assert.deepEqual(spawns.map((spawn) => spawn.subagentType), ['skraft:solution-architect'])
  const scan = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'details', new Date().toISOString().slice(0, 10), 'structural-scan.json')
  assert.deepEqual(briefOf(spawns[0].prompt).inputs.map((path) => path.replace(/\\/g, '/')), [stories, scan].map((path) => path.replace(/\\/g, '/')))
  assert.equal(outcome.reason, 'solution-architect is blocked: stop after reading the stories')
})
