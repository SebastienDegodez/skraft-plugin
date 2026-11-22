import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, copilotHost, actsAs, answeringSession, firstOptionPerson, simulatedContext } from './simulated-host.mjs'
import {
  CHECK, LENSES, NOMINAL, PAY, SCENARIOS, REFUSED_WORKFLOWS, SECURITY_AGENT, SLUG, acceptanceWith, componentSkillsBriefed, designateWorkflow, WRONG_PAY, blocked, briefOf, commit, deliverWith, fillOutputs, batchesSorted, lensDispatches, lensLabels, pipelineRepository, reviewsOf,
  issueProgressKept, scriptedLlm, visualsKept, writeResult, writesOnly,
} from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'
import { traceDelivery } from '../support/delivery-trace.mjs'
import { ISSUE, NO_PULL_REQUEST, issueFile, issueForge } from '../support/issue-forge.mjs'

/**
 * Runs the workflow for a new slug on the repository, the scripted LLM answering every agent
 * call, the person answering each question Copilot puts to them with its first option (STOP to a
 * blocked step), unless another person answers. asked: the key of each question the run asked.
 * @param {string} cwd
 * @param {{ acts?: object, reviews?: object, args?: object, person?: object }} [options]
 */
const runOn = async (cwd, { acts, reviews, args = {}, person = firstOptionPerson() } = {}) => {
  const llm = scriptedLlm({ cwd, acts, reviews })
  const { ctx, calls, logs, phases } = simulatedContext({ args: { slug: SLUG, ...args }, otherwise: actsAs(llm) })
  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd, PLUGIN_ROOT, person))
  const events = journal(cwd, SLUG)
  return { outcome, calls, logs, phases, asked: events.filter((event) => event.type === 'question.asked').map(({ key }) => key), events }
}

const recorded = (events, step) => events.filter((event) => event.type === 'step.recorded' && event.step === step)

test('the four phases run on a real repository: each agent commits its part, the traced gate runs hold, DELIVER closes, then PUBLISH writes the pull request', async (t) => {
  const { cwd } = pipelineRepository(t, { publish: { pullRequest: true, visuals: false, questionVersions: { pullRequest: 2, visuals: 1 } } })
  issueForge(t, cwd)

  const { outcome, calls, logs, phases, asked, events } = await runOn(cwd, { args: { issue: 42, title: 'Pay by card' } })

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.deepEqual(batchesSorted(calls.map(({ agent, label }) => `${agent} | ${label}`)), batchesSorted([
    `skraft:solution-researcher | skraft ${SLUG} · research · attempt 1`,
    `skraft:solution-architect | skraft ${SLUG} · design · attempt 1`,
    ...lensDispatches('design_review'),
    `skraft:acceptance-designer | skraft ${SLUG} · distill · attempt 1`,
    ...lensDispatches('distill_review'),
    `skraft:software-engineer | skraft ${SLUG} · deliver · attempt 1`,
    ...lensDispatches('deliver_review'),
    `skraft:pr-writer | skraft ${SLUG} · pr_writer · attempt 1`,
  ]))
  assert.deepEqual(calls.filter((call) => !call.prompt.includes('- Story: #42 — Pay by card')).map(({ agent }) => agent), ['skraft:cold-reader-lens'])
  const [started] = events
  const issue = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, ...issueFile(started.at.slice(0, 10)).split('/'))
  assert.deepEqual([started.artifacts, briefOf(calls.find(({ agent }) => agent === 'skraft:solution-researcher').prompt).inputs], [[issueFile(started.at.slice(0, 10))], [issue]])
  assert.equal(readFileSync(issue, 'utf8'), `# Issue #42: ${ISSUE.title}\n\n${ISSUE.url}\n\n${ISSUE.body}\n`)
  assert.deepEqual(reviewsOf(events), [['design_review', 1, 'approved', 'adr'], ['distill_review', 1, 'approved', 'scenario_review'], ['scenario_review', 1, 'answered', 'deliver'], ['deliver_review', 1, 'approved', 'visuals']])
  assert.deepEqual(events.filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.deepEqual(events.filter((event) => event.type === 'evidence.checked').map(({ step, runs }) => [step, runs.map(({ gate }) => gate)]), [['distill', ['test']], ['deliver', ['build', 'format', 'lint', 'test', 'architecture', 'coverage']]])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked').map(({ step, commits }) => [step, commits.map(({ subject, kind, verdict }) => [subject, kind, verdict])]), [
    ['distill', [[`test(${SLUG}): pay by card`, 'red', 'ok']]],
    ['deliver', [[`feat(${SLUG}): S1 pay by card`, 'green', 'ok']]],
  ])
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded' && event.step === 'design').map((event) => event.committed.subject), [`docs(${SLUG}): design ${SLUG}`])
  assert.equal(git(cwd, 'log', '--format=%B', '--fixed-strings', `--grep=docs(${SLUG}): design ${SLUG}`), `docs(${SLUG}): design ${SLUG}\n\nRefs: #42`)
  assert.equal(git(cwd, 'status', '--porcelain'), '')
  const finished = events.filter((event) => event.type === 'run.finished')
  assert.deepEqual(finished.map(({ status, reason }) => [status, reason]), [['completed', 'PUBLISH closed']])
  issueProgressKept(cwd, events)
  assert.deepEqual(asked, ['adr-1', 'scenario_review-1'])
  assert.deepEqual(events.filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['adr-1', 'RATIFIED', 'host-confirmed'], ['scenario_review-1', 'APPROVED', 'host-confirmed']])
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8')).publish, { pullRequest: true, visuals: false, questionVersions: { pullRequest: 2, visuals: 1 } })
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded' && event.step === 'publish').map(({ outcome: result, reason }) => [result, reason]), [['local', `pull request not opened: ${NO_PULL_REQUEST}; pull-request.md holds its description, and skraft publish opens it once that is fixed`]])
  assert.ok(readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'pull-request.md'), 'utf8').startsWith('Pay by card at checkout\n\nRefs #42\n\n## What changes\n\npay(amount) answers what was paid.\n'))
  const distillRed = events.find((event) => event.type === 'commits.checked' && event.step === 'distill').commits[0].sha
  assert.ok(readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'pull-request.md'), 'utf8').includes(`\n| \`${git(cwd, 'rev-parse', '--short=7', distillRed)}\` | test(${SLUG}): pay by card |\n`))
  assert.deepEqual(logs.filter((line) => line.startsWith('phase ')), ['phase RESEARCH', 'phase DESIGN', 'phase DISTILL', 'phase DELIVER', 'phase PUBLISH'])
  assert.deepEqual(phases, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.equal(logs.some((line) => line.startsWith('Waiting for you')), false, logs.join('\n'))
  assert.equal(git(cwd, 'log', '--format=%s', '-1', '--', 'docs/adr'), 'docs(adr): ratify ADR-001')
  assert.equal(logs.at(-1), `${SLUG}: done: PUBLISH closed`)
})

test('a front end\'s e2e run leaves its light and dark screenshots committed on the working branch, and the pull request shows them', async (t) => {
  const { cwd } = pipelineRepository(t, { frontend: true, publish: { pullRequest: false, visuals: true, questionVersions: { pullRequest: 2, visuals: 1 } } })
  issueForge(t, cwd)

  const { outcome, events, asked } = await runOn(cwd, { args: { issue: 42, title: 'Pay by card' } })

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(asked, ['adr-1', 'scenario_review-1'])
  assert.deepEqual(events.filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by])[0], ['adr-1', 'RATIFIED', 'host-confirmed'])
  visualsKept(cwd, events)
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
  assert.deepEqual([outcome.status, outcome.slug, outcome.phase, outcome.code], ['blocked', SLUG, 'RESEARCH', 'repeated-failure'])
  assert.match(outcome.reason, /^research stopped after 2 occurrences of failure signature [0-9a-f]{64}; evidence: unavailable$/)
  assert.equal(events.filter((event) => event.type === 'step.started' && event.step === 'research').length, 2)
})
test('the software engineer\'s call opens with the SKILL.md of each skill its components ask for, from .github/skills/ or the plugin, and names the one found nowhere', async (t) => {
  const skillFolder = '.github/skills/mocking-inprocess-javascript'
  const { cwd } = pipelineRepository(t, { contractTesting: true, skills: [skillFolder] })

  const { outcome, calls } = await runOn(cwd, { acts: { 'software-engineer': [blocked('stop after reading the brief')] } })

  assert.equal(outcome.reason, 'software-engineer is blocked: stop after reading the brief')
  componentSkillsBriefed(cwd, skillFolder, calls.map(({ prompt }) => prompt))
})

test('a second feat commit in the delivery is refused: the story takes one, whatever its subject names', async (t) => {
  const { cwd } = pipelineRepository(t)
  const greenFirst = (brief) => {
    fillOutputs(brief, 'Paid by card.\n')
    commit(cwd, `feat(${SLUG}): S1 pay by card`, { 'src/pay.mjs': PAY }, brief)
    commit(cwd, `feat(${SLUG}): pay by card again`, { 'src/again.mjs': PAY }, brief)
    traceDelivery(cwd, SLUG)
    writeResult(brief, { status: 'done', summary: 'delivered' })
  }

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'software-engineer': [greenFirst, blocked('cannot rewrite the history')] } })

  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const refusal = `commit ${sha} "feat(${SLUG}): pay by card again" is a second feat or fix commit: the story takes one, with the code, the unit tests and the fixes of every group; squash it into the first`
  assert.deepEqual(recorded(events, 'deliver').map(({ outcome: result, code, failures }) => [result, code, failures]), [['failed', 'tdd', [refusal]], ['failed', 'agent-blocked', ['cannot rewrite the history']]])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'deliver').map(({ commits }) => commits.map(({ kind, verdict }) => [kind, verdict])), [[['green', 'ok'], ['green', 'green-split']], [['green', 'ok'], ['green', 'green-split']]])
  const retried = calls.find((call) => call.label === `skraft ${SLUG} · deliver · attempt 2`)
  assert.ok(retried.prompt.includes(`Refused in attempt 1 of 3:\n- ${refusal}`), retried.prompt)
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran'), [])
  assert.deepEqual([outcome.status, outcome.phase, outcome.code, outcome.reason], ['blocked', 'DELIVER', 'agent-blocked', 'software-engineer is blocked: cannot rewrite the history'])
})

test('a repository workflow dispatches its own agent between the architect and the acceptance designer, under its bare id', async (t) => {
  const { cwd } = pipelineRepository(t, { security: true })

  const { outcome, calls, events } = await runOn(cwd)

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  const agents = calls.filter(({ agent }) => !agent.endsWith('-lens') && !agent.endsWith('finding-refuter'))
  assert.deepEqual(agents.map(({ agent }) => agent), [
    'skraft:solution-researcher', 'skraft:solution-architect', SECURITY_AGENT, 'skraft:acceptance-designer', 'skraft:software-engineer',
  ])
  assert.equal(agents[2].label, `skraft ${SLUG} · security · attempt 1`)
  assert.match(agents[2].prompt, new RegExp(`^## Skraft dispatch: ${SECURITY_AGENT} \\(DESIGN\\)\\n`))
  assert.equal(events[0].workflow, '.skraft/pipeline.skraft.dot')
})

test('a repository workflow that drops a locked gate without unlock, loops without max_visits, holds a node the start cannot reach or names an agent nobody provides is refused before any dispatch, with its reason', async (t) => {
  const { cwd } = pipelineRepository(t, { security: true })

  const refusals = []
  for (const { workflow } of REFUSED_WORKFLOWS) {
    designateWorkflow(cwd, workflow)
    const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
    const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))
    refusals.push([outcome.status, outcome.code, outcome.reason, calls.length, logs.at(-1)])
  }

  assert.deepEqual(refusals, REFUSED_WORKFLOWS.map(({ reason }) => ['refused', 'workflow-invalid', reason, 0, `skraft: refused (workflow-invalid): ${reason}`]))
  assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'events.jsonl')), false)
})

test('fromArtifacts reaches Init: a slug with no DISCUSS stories is refused before any agent starts', async (t) => {
  const { cwd } = pipelineRepository(t)
  const { ctx, calls, logs } = simulatedContext({ args: { slug: SLUG, fromArtifacts: true } })

  const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))

  assert.deepEqual([outcome.status, outcome.code], ['refused', 'no-artifacts'])
  assert.deepEqual(calls, [])
  assert.equal(logs.at(-1), `skraft: refused (no-artifacts): ${SLUG} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`)
})
