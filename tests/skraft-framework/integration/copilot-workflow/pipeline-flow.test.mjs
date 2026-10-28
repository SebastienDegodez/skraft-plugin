import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createObserve } from '../../../../plugins/skraft-framework/engine/application/pipeline/observe-usecase.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, copilotHost, actsAs, simulatedContext, decideTool } from './simulated-host.mjs'
import {
  LENSES, NOMINAL, PAY, PAY_OR_NOTHING, REFUSED_WORKFLOWS, SECURITY_AGENT, SLOW_CHECK, SLUG, acceptanceWith, componentSkillsBriefed, designateWorkflow, twoRedsThenPay, WRONG_PAY, blocked, briefOf, commit, deliverWith, killsZero, fillOutputs, batchesSorted, lensDispatches, lensLabels, pipelineRepository, reviewsOf,
  issueProgressKept, scriptedLlm, visualsKept, writeResult, writesOnly,
} from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'
import { ISSUE, NO_PULL_REQUEST, issueFile, issueForge } from '../support/issue-forge.mjs'

/**
 * Runs the workflow for a new slug on the repository, the scripted LLM answering every agent
 * call. Each time the run pauses on a question, the human answers it through the decide tool (the
 * first option by default) and resumes the run.
 * @param {string} cwd
 * @param {{ acts?: object, reviews?: object, args?: object, answer?: (question: { key: string, options: string[] }) => { answer: string, reason?: string } }} [options]
 */
const runOn = async (cwd, { acts, reviews, args = {}, answer = (question) => ({ answer: question.options[0] }) } = {}) => {
  const llm = scriptedLlm({ cwd, acts, reviews })

  const { ctx, calls, logs, phases } = simulatedContext({ args: { slug: SLUG, ...args }, otherwise: actsAs(llm) })
  const pauses = []
  for (;;) {
    try {
      const outcome = await runSkraftPipelineWorkflow(ctx, copilotHost(cwd))
      return { outcome, calls, logs, phases, pauses, events: journal(cwd, SLUG) }
    } catch (error) {
      if (error.name !== 'AbortError') throw error
      const { question } = await createObserve(createNodeAdapters(copilotHost(cwd))).view()
      pauses.push(question.key)
      await decideTool(cwd).handler({ key: question.key, ...answer(question) })
    }
  }
}

const recorded = (events, step) => events.filter((event) => event.type === 'step.recorded' && event.step === step)

/** Each checked attempt of a step with the exit code of each commit's replay, null for a commit not replayed. @param {object[]} events */
const replaysOf = (events) => events
  .filter((event) => event.type === 'commits.checked')
  .map(({ step, commits }) => [step, commits.map(({ replay }) => replay?.exitCode ?? null)])

test('the four phases run on a real repository: each agent commits its part, the gates run the tests, DELIVER closes, then PUBLISH writes the pull request', async (t) => {
  const { cwd } = pipelineRepository(t, { publish: null })
  issueForge(t, cwd)

  const { outcome, calls, logs, phases, pauses, events } = await runOn(cwd, { args: { issue: 42, title: 'Pay by card' } })

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
  assert.deepEqual(reviewsOf(events), [['design_review', 1, 'approved', 'adr'], ['distill_review', 1, 'approved', 'deliver'], ['deliver_review', 1, 'approved', 'visuals']])
  assert.deepEqual(events.filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran').map(({ component, gate, status }) => `${component}/${gate} ${status}`), ['app/test pass', 'app/mutation pass'])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked').map(({ step, commits }) => [step, commits.map(({ subject, kind, verdict, replay }) => [subject, kind, verdict, replay?.exitCode ?? null])]), [
    ['design', [[`docs(${SLUG}): record the card payment decision`, 'other', 'ok', null]]],
    ['distill', [[`test(${SLUG}): pay by card`, 'red', 'ok', 1]]],
    ['deliver', [[`test(${SLUG}): pay a card amount`, 'red', 'ok', 1], [`feat(${SLUG}): pay by card`, 'green', 'ok', null]]],
  ])
  const finished = events.filter((event) => event.type === 'run.finished')
  assert.deepEqual(finished.map(({ status, reason }) => [status, reason]), [['completed', 'PUBLISH closed']])
  issueProgressKept(cwd, events)
  assert.deepEqual(pauses, ['publish_consent-1', 'adr-1'])
  assert.deepEqual(events.filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by]), [['publish_consent-1', 'ACCEPTED', 'host-confirmed'], ['adr-1', 'RATIFIED', 'host-confirmed']])
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8')).publish, { pullRequest: true, questionVersions: { pullRequest: 2 } })
  assert.deepEqual(events.filter((event) => event.type === 'step.recorded' && event.step === 'publish').map(({ outcome: result, reason }) => [result, reason]), [['local', `pull request not opened: ${NO_PULL_REQUEST}; pull-request.md holds its description, and skraft publish opens it once that is fixed`]])
  assert.ok(readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'pull-request.md'), 'utf8').startsWith('Pay by card at checkout\n\nRefs #42\n\n## What changes\n\npay(amount) answers what was paid.\n'))
  const distillRed = events.find((event) => event.type === 'commits.checked' && event.step === 'distill').commits[0].sha
  assert.ok(readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'pull-request.md'), 'utf8').includes(`\n| \`${git(cwd, 'rev-parse', '--short=7', distillRed)}\` | test(${SLUG}): pay by card | 1 |\n`))
  assert.deepEqual(logs.filter((line) => line.startsWith('phase ')), ['phase RESEARCH', 'phase RESEARCH', 'phase DESIGN', 'phase DESIGN', 'phase DISTILL', 'phase DELIVER', 'phase PUBLISH'])
  assert.deepEqual(phases, ['RESEARCH', 'RESEARCH', 'DESIGN', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.ok(logs.includes('Answer adr-1 with RATIFIED or REJECTED (a reason with REJECTED): Copilot asks you to confirm it, or type skraft decide in a terminal; then resume this run.'), logs.join('\n'))
  assert.equal(git(cwd, 'log', '--format=%s', '-1', '--', 'docs/adr'), 'docs(adr): ratify ADR-001')
  assert.equal(logs.at(-1), `${SLUG}: done: PUBLISH closed`)
})

test('a front end\'s e2e run leaves its light and dark screenshots committed on the working branch, and the pull request shows them', async (t) => {
  const { cwd } = pipelineRepository(t, { frontend: true, publish: { pullRequest: false } })
  issueForge(t, cwd)

  const { outcome, events, pauses } = await runOn(cwd, { args: { issue: 42, title: 'Pay by card' } })

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(pauses, ['visuals_consent-1', 'adr-1'])
  assert.deepEqual(events.filter((event) => event.type === 'question.answered').map(({ key, answer, by }) => [key, answer, by])[0], ['visuals_consent-1', 'ACCEPTED', 'host-confirmed'])
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
  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'invalid-result',
    reason: `solution-researcher failed the same way on attempts 1 and 2: result status must be "done" or "blocked"`,
  })
  assert.equal(events.filter((event) => event.type === 'step.started' && event.step === 'research').length, 2)
})

test('gates that fail send DELIVER back as pass 2 with the failing gate in its brief, then the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'software-engineer': [deliverWith(WRONG_PAY)] } })

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  const delivering = calls.slice(3 + LENSES.design_review.length + LENSES.distill_review.length)
  assert.deepEqual(batchesSorted(delivering.map((call) => call.label)), batchesSorted([`skraft ${SLUG} · deliver · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · attempt 1`, ...lensLabels('deliver_review'), `skraft ${SLUG} · pr_writer · attempt 1`]))
  assert.ok(delivering[1].prompt.includes('- Pass: 2, after the gates sent the work back'), delivering[1].prompt)
  assert.match(delivering[1].prompt, /\nThe gates failed on pass 1:\n- app\/test: exited 1 \(evidence: .+test-1\.log\)/)
  assert.deepEqual(recorded(events, 'gates').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'fail', 'deliver'], [2, 'pass', 'mutation']])
  assert.deepEqual(recorded(events, 'mutation').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'pass', 'deliver_review']])
  assert.deepEqual(recorded(events, 'deliver_review').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'approved', 'visuals']])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'deliver').map(({ visit, commits }) => [visit, commits.map(({ kind, verdict }) => `${kind} ${verdict}`)]), [
    [1, ['red ok', 'green ok']],
    [2, ['red ok', 'green ok']],
  ])
  assert.equal(git(cwd, 'show', 'HEAD:src/pay.mjs'), 'export const pay = (amount) => `paid ${amount}`')
})

test('mutants that survive send the run to one dispatch per file, test-integrity on its tests, then the gates again until mutation passes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'software-engineer': [deliverWith(PAY_OR_NOTHING), killsZero] } })

  const kills = calls.filter(({ label }) => label.includes(' · kill_mutants · '))
  assert.ok(calls.some(({ agent, label }) => agent === 'skraft:test-integrity-lens' && label === `skraft ${SLUG} · mutation_review · test-integrity · attempt 1`))
  assert.equal(kills[0].agent, 'skraft:software-engineer')
  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.deepEqual(kills.map(({ label }) => label), [`skraft ${SLUG} · kill_mutants · group 1 of 1 · attempt 1`])
  assert.ok(kills[0].prompt.includes('Kill the surviving mutants of src/pay.mjs (group 1 of 1):\n- src/pay.mjs:1 EqualityOperator (>=) survived'), kills[0].prompt)
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran').map(({ gate, status, survivors }) => `${gate} ${status}${survivors ? ` ${survivors}` : ''}`), ['test pass', 'mutation fail 1', 'test pass', 'mutation pass'])
  assert.deepEqual(recorded(events, 'mutation').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'fail', 'kill_mutants'], [2, 'pass', 'deliver_review']])
  assert.deepEqual(reviewsOf(events).filter(([step]) => step === 'mutation_review'), [['mutation_review', 1, 'approved', 'gates']])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'kill_mutants').flatMap(({ commits }) => commits.map(({ subject, kind, verdict, replay }) => [subject, kind, verdict, replay])), [
    [`test(${SLUG}): pay nothing for zero`, 'red', 'ok', null],
  ])
})

test('a test commit whose tests pass is refused as not red', async (t) => {
  const { cwd } = pipelineRepository(t)
  const green = (brief) => {
    fillOutputs(brief)
    commit(cwd, `test(${SLUG}): pay by card`, { 'tests/unit/check.mjs': "console.log('nothing checked')\n" })
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

test('replaying red commits for more than a fifth of a phase warns the developer of each phase it happens in, in the workflow log, with the way to replay less; with last-red only the last red commit of the story is replayed, and nothing is said', async (t) => {
  const acts = { 'acceptance-designer': [acceptanceWith(SLOW_CHECK)], 'software-engineer': [twoRedsThenPay] }
  const every = pipelineRepository(t)
  const lastRed = pipelineRepository(t, { tdd: { replay: 'last-red' } })

  const all = await runOn(every.cwd, { acts })
  const last = await runOn(lastRed.cwd, { acts })

  assert.deepEqual([all.outcome.status, last.outcome.status], ['done', 'done'], `${all.outcome.reason} / ${last.outcome.reason}`)
  assert.deepEqual(replaysOf(all.events), [['design', [null]], ['distill', [1]], ['deliver', [1, 1, null]]])
  const slow = all.events.filter((event) => event.type === 'tdd.replay-slow')
  assert.deepEqual(slow.map(({ phase }) => phase), ['DISTILL', 'DELIVER'])
  assert.ok(slow.every(({ replayMs, phaseMs }) => replayMs >= 1000 && replayMs > 0.2 * phaseMs), JSON.stringify(slow))
  const warnings = (logs) => logs.filter((line) => line.includes('replaying test commits took'))
  assert.deepEqual(warnings(all.logs).map((line) => line.replace(/took \d+%/, 'took N%')), ['DISTILL', 'DELIVER'].map((phase) => `${SLUG}: replaying test commits took N% of ${phase}; set "tdd": { "replay": "last-red" } in skraft-config.json to replay only the last test commit of each story`))
  assert.deepEqual(replaysOf(last.events), [['design', [null]], ['distill', [1]], ['deliver', [null, 1, null]]])
  assert.deepEqual(last.events.filter((event) => event.type === 'tdd.replay-slow'), [])
  assert.deepEqual(warnings(last.logs), [])
})

test('the software engineer\'s call opens with the SKILL.md of each skill its components ask for, from .github/skills/ or the plugin, and names the one found nowhere', async (t) => {
  const skillFolder = '.github/skills/mocking-inprocess-javascript'
  const { cwd } = pipelineRepository(t, { contractTesting: true, skills: [skillFolder] })

  const { outcome, calls } = await runOn(cwd, { acts: { 'software-engineer': [blocked('stop after reading the brief')] } })

  assert.equal(outcome.reason, 'software-engineer is blocked: stop after reading the brief')
  componentSkillsBriefed(cwd, skillFolder, calls.map(({ prompt }) => prompt))
})

test('a feat commit with no test commit before it in the pass is refused, the acceptance test of DISTILL notwithstanding', async (t) => {
  const { cwd } = pipelineRepository(t)
  const greenFirst = (brief) => {
    fillOutputs(brief, 'Paid by card.\n')
    commit(cwd, `feat(${SLUG}): pay by card`, { 'src/pay.mjs': PAY }, brief)
    writeResult(brief, { status: 'done', summary: 'delivered' })
  }

  const { outcome, calls, events } = await runOn(cwd, { acts: { 'software-engineer': [greenFirst, blocked('cannot rewrite the history')] } })

  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const refusal = `commit ${sha} "feat(${SLUG}): pay by card" makes code pass with no test commit since the last feat or fix; rewrite it after a failing test commit`
  assert.deepEqual(recorded(events, 'deliver').map(({ outcome: result, code, failures }) => [result, code, failures]), [['failed', 'tdd', [refusal]], ['failed', 'agent-blocked', ['cannot rewrite the history']]])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'deliver').map(({ commits }) => commits.map(({ kind, verdict, replay }) => [kind, verdict, replay])), [[['green', 'green-without-red', null]]])
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
