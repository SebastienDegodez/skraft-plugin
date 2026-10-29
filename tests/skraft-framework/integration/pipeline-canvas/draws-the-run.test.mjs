import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { createInit } from '../../../../plugins/skraft-framework/engine/application/pipeline/init-usecase.mjs'
import { openJournal } from '../../../../plugins/skraft-framework/engine/application/journal/run-journal.mjs'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { actsAs, copilotHost, simulatedContext, workingCopy } from '../copilot-workflow/simulated-host.mjs'
import { NOMINAL, SLUG, blocked, commit, fillOutputs, finding, pipelineRepository, says, scriptedLlm, writeResult } from '../support/pipeline-repository.mjs'
import { BOUNDED, contentStream, pipelineCanvas, tokenOf } from './canvas-host.mjs'

const RATIFY = 'Ratify the Proposed ADRs docs/adr/adr-001-card-payment.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.'
const NO_ACTIVE_PIPELINE = 'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'

/** The architect's second pass, after the review sent DESIGN back. */
const revises = (brief, { slug, cwd }) => {
  fillOutputs(brief, 'The provider is Acme Pay.\n')
  commit(cwd, `docs(${slug}): name the payment provider`, { 'docs/adr/adr-001-card-payment.md': '# ADR-001 Card payment\n\n**Status:** Proposed\n\nAccepted: Acme Pay.\n' })
  writeResult(brief, { status: 'done', summary: 'provider named' })
}

/** (text, state) of each phase, then of each step. @param {any} content */
const outline = (content) => content.phases.map(({ text, state, steps }) => [text, state, steps.map((step) => [step.text, step.state])])

test('the canvas draws the workflow as the run goes: a review in progress, then each phase with its steps, passes and outcomes (a consent the configuration answered said so), the reviews, the labelled edges taken and the question it waits on; with the workflow unreadable, the steps the journal names', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  const { open, shown } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [NOMINAL['solution-architect'], revises] }, reviews: { consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'The ADR names no payment provider')])] } })
  const duringRefutation = []
  const acts = actsAs(llm)
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: async (call) => {
    if (call.label.includes(' · refute ')) duringRefutation.push(await shown())
    return acts(call)
  } })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { message: 'paused at adr-1' })

  const chosen = (agent, step, assigned) => ({ key: `agent-${step}-${agent}`, text: `${agent} (${step}): ${assigned} · model chosen by the host`, state: 'done' })
  assert.deepEqual(duringRefutation.map((content) => [content.status, content.details]), [['running', [
    { key: 'review-design_review', text: 'review design_review: in progress — consistency fail (1), architecture-compliance pass, fitness pass', state: 'open' },
    chosen('solution-researcher', 'research', 'researcher · standard'),
    chosen('solution-architect', 'design', 'planner · frontier'),
    ...['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'].map((lens) => chosen(lens, 'design_review', 'reviewer · economy')),
  ]]])
  const opened = await open()
  assert.match(opened.url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{48}$/)
  assert.deepEqual({ ...opened, url: null }, { url: null, title: `skraft ${SLUG}`, status: 'waiting' })
  const content = await shown()
  assert.deepEqual([content.title, content.status, content.reason], [`skraft ${SLUG}`, 'waiting', RATIFY])
  assert.deepEqual(outline(content).slice(0, 3), [
    ['✓ RESEARCH', 'closed', [['✓ publish_consent — publish-consent: answered by the configuration', 'done'], ['✓ visuals_consent — reporting-consent: answered by the configuration', 'done'], ['✓ research — solution-researcher: done', 'done']]],
    ['▶ DESIGN', 'open', [['✓ design — solution-architect: done, pass 2', 'done'], ['✓ design_review — consistency, architecture-compliance, fitness: approved, pass 2', 'done'], ['▶ adr — adr-ratification', 'open']]],
    ['· DISTILL', 'pending', [['· distill — acceptance-designer', 'pending'], ['· distill_review — coverage, business-alignment, testability, boundary-enforcement', 'pending']]],
  ])
  assert.deepEqual(content.phases.map(({ key }) => key), ['phase-RESEARCH', 'phase-DESIGN', 'phase-DISTILL', 'phase-DELIVER', 'phase-PUBLISH'])
  assert.deepEqual(content.phases[1].steps.map(({ key }) => key), ['step-design', 'step-design_review', 'step-adr'])
  assert.deepEqual(content.details, [
    { key: 'review-design_review', text: 'review design_review: approved, pass 2 — consistency pass, architecture-compliance pass, fitness pass', state: 'done' },
    { key: 'edge-design_review-design', text: 'design_review → design (NEEDS_REWORK) ×1', state: 'done' },
    { key: 'edge-design_review-adr', text: 'design_review → adr (APPROVED) ×1', state: 'done' },
    chosen('solution-researcher', 'research', 'researcher · standard'),
    chosen('solution-architect', 'design', 'planner · frontier'),
    ...['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'].map((lens) => chosen(lens, 'design_review', 'reviewer · economy')),
    chosen('finding-refuter', 'design_review', 'standard'),
  ])
  assert.deepEqual(content.question, {
    key: 'adr-1', header: 'ADR', text: RATIFY,
    how: 'Answer it in the Copilot chat, where Copilot puts it to you; or type skraft decide adr-1 RATIFIED|REJECTED in a terminal.',
  })
  const stream = contentStream(t, opened.url, await tokenOf(opened.url))
  const { configuration, workflows, ...run } = await stream.next()
  assert.deepEqual(run, content)
  assert.deepEqual([configuration.status, workflows.find(({ name }) => name === 'pipeline').steps.find(({ id }) => id === 'adr').state], ['ok', 'open'])

  writeFileSync(join(cwd, 'skraft-config.json'), 'not json')
  assert.deepEqual(outline(await shown()), [
    ['✓ RESEARCH', 'closed', [['✓ publish_consent: skipped', 'done'], ['✓ visuals_consent: skipped', 'done'], ['✓ research: done', 'done']]],
    ['▶ DESIGN', 'open', [['✓ design: done, pass 2', 'done'], ['✓ design_review: approved, pass 2', 'done'], ['▶ adr', 'open']]],
  ])
})

test('the canvas shows a blocked step\'s question and says to answer it in the chat, or with skraft decide and an instruction', BOUNDED, async (t) => {
  const { cwd } = pipelineRepository(t)
  const { shown } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })
  const llm = scriptedLlm({ cwd, acts: { 'solution-architect': [blocked('which payment provider?')] } })
  const { ctx } = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(llm) })

  await assert.rejects(runSkraftPipelineWorkflow(ctx, copilotHost(cwd)), { message: 'paused at design-1' })

  const { question } = await shown()
  assert.deepEqual({ ...question, text: question.text.replace(/; its reason is in .*?\. An/, '; its reason is in <result>. An') }, {
    key: 'design-1', header: 'Blocked',
    text: 'design is blocked: solution-architect says it cannot go on; its reason is in <result>. An instruction runs design again on a new pass with it; STOP ends the run.',
    how: 'Answer it in the Copilot chat, where Copilot puts it to you; or type skraft decide design-1 "<instruction>"|STOP in a terminal.',
  })
})

test('the gates line gives each component its last result of each gate, with the survivors of a mutation gate, and never its command nor its evidence', BOUNDED, async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  const adapters = createNodeAdapters(copilotHost(cwd))
  assert.equal((await createInit(adapters).init({ slug: 'refund' })).ok, true)
  const { journal } = /** @type {any} */ (await openJournal(adapters, 'refund'))
  const ran = (component, gate, status, survivors) => journal.append('gate.ran', { step: 'gates', visit: 1, component, gate, command: 'secret-command --token', status, durationMs: 3, evidence: `gates/${component}/${gate}-1.log`, survivors })
  await ran('api', 'test', 'fail')
  await ran('web', 'lint', 'pass')
  await ran('api', 'test', 'pass')
  await ran('api', 'mutation', 'fail', 3)
  await ran('web', 'mutation', 'pass', null)
  const { shown } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })

  assert.deepEqual((await shown()).details, [
    { key: 'gates-api', text: 'gates api: test pass, mutation fail (3 survivors)', state: 'done' },
    { key: 'gates-web', text: 'gates web: lint pass, mutation pass', state: 'done' },
  ])
})

test('with no .active-slug the canvas shows no pipeline, even when a pipeline folder is there: it never guesses a slug', BOUNDED, async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  assert.equal((await createInit(createNodeAdapters(copilotHost(cwd))).init({ slug: 'refund' })).ok, true)
  const tracking = join(cwd, '.copilot-tracking', 'skraft-plans')
  writeFileSync(join(tracking, '.active-slug'), '')
  const { open, shown } = pipelineCanvas(t, { directory: () => cwd, home: `${cwd}-home` })

  const { title, status } = await open()

  assert.deepEqual([title, status], ['skraft pipeline', 'idle'])
  const content = await shown()
  assert.deepEqual([content.title, content.status, content.reason, content.question, content.details], ['skraft pipeline', 'idle', NO_ACTIVE_PIPELINE, null, []])
  assert.deepEqual(content.phases.flatMap(({ state, steps }) => [state, ...steps.map((step) => step.state)]).filter((state) => state !== 'pending'), [])
})

test('with no working directory known, or one whose pipeline cannot be read, the canvas says so in fixed words and shows nothing else', BOUNDED, async (t) => {
  const { cwd, cleanup } = await workingCopy()
  t.after(cleanup)
  mkdirSync(join(cwd, '.copilot-tracking', 'skraft-plans', '.active-slug'), { recursive: true })
  const where = { cwd: /** @type {string | null} */ (null) }
  const { open, shown } = pipelineCanvas(t, { directory: () => where.cwd, home: `${cwd}-home` })

  assert.deepEqual(await open(), { url: (await open()).url, title: 'skraft pipeline', status: 'no-directory' })
  assert.deepEqual(await shown(), { title: 'skraft pipeline', status: 'no-directory', reason: 'The Copilot session has no working directory yet.', phases: [], details: [], question: null })

  where.cwd = cwd
  assert.deepEqual(await shown(), { title: 'skraft pipeline', status: 'unreadable', reason: 'skraft could not read the pipeline of this working copy; run skraft status in a terminal.', phases: [], details: [], question: null })
})
