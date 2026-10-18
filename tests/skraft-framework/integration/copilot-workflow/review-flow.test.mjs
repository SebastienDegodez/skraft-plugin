import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSkraftPipelineWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-pipeline-workflow.mjs'
import { PLUGIN_ROOT, actsAs, simulatedContext, trackingDir } from './simulated-host.mjs'
import {
  LENSES, NOMINAL, SECURITY_LENS, SLUG, checksOf, refutes, batchesSorted, commit, fillOutputs, finding, lensLabels, pipelineRepository, reviewBriefOf, reviewsOf, says,
  scriptedLlm, writeResult,
} from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'

/** The review node a label belongs to, null for a phase agent's. @param {string} label */
const reviewNodeOf = (label) => / · (\w+_review) · /.exec(label)?.[1] ?? null

/** Waits until `done()` holds, at most `ms`; a host that runs lenses one by one only makes it slow. */
const waitFor = async (done, ms = 1000) => {
  const deadline = Date.now() + ms
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
}

/**
 * The scripted LLM, a lens answering only once every lens of its review node was called, so a
 * host that waits for one lens before calling the next shows in the timeline.
 * @param {ReturnType<typeof scriptedLlm>} llm @param {() => Array<{ label: string }>} calls @param {Record<string, number>} sizes
 */
const answersTogether = (llm, calls, sizes) => async (call) => {
  const text = await actsAs(llm)(call)
  const node = reviewNodeOf(call.label)
  if (node !== null && reviewBriefOf(call.prompt)?.name !== 'refuter') {
    await waitFor(() => calls().filter((other) => reviewNodeOf(other.label) === node).length >= sizes[node])
  }
  return text
}

/** Runs the workflow for a new slug on the repository, the scripted LLM answering every agent call. */
const runOn = async (cwd, { acts, reviews, sizes = { design_review: 3, distill_review: 4, deliver_review: 3 } } = {}) => {
  const llm = scriptedLlm({ cwd, acts, reviews })
  const host = simulatedContext({ args: { slug: SLUG }, otherwise: answersTogether(llm, () => host.calls, sizes) })
  const outcome = await runSkraftPipelineWorkflow(host.ctx, { cwd, pluginRoot: PLUGIN_ROOT })
  return { outcome, llm, calls: host.calls, timeline: host.timeline, events: journal(cwd, SLUG) }
}

/** Each review node's calls all came before the first of their answers. @param {string[]} timeline */
const startedTogether = (timeline) => {
  const nodes = [...new Set(timeline.map(reviewNodeOf).filter((node) => node !== null))]
  return Object.fromEntries(nodes.map((node) => {
    const own = timeline.filter((line) => reviewNodeOf(line) === node && !line.includes(' · refute '))
    return [node, own.findIndex((line) => line.startsWith('answer ')) === own.filter((line) => line.startsWith('call ')).length]
  }))
}

/** How the review hands a confirmed finding to the phase agent. */
const FINDING_LINE = 'consistency F1 G1 blocker at docs/adr/adr-001-card-payment.md:3: The ADR names no payment provider (suggestion: name the provider)'

const lensEvents = (events, step) => events.filter((event) => event.type === 'review.lens' && event.step === step)

test('lenses that all pass approve each review, started together, and the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, timeline, events } = await runOn(cwd)

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  assert.deepEqual(reviewsOf(events), [['design_review', 1, 'approved', 'distill'], ['distill_review', 1, 'approved', 'deliver'], ['deliver_review', 1, 'approved', 'exit']])
  assert.deepEqual(startedTogether(timeline), { design_review: true, distill_review: true, deliver_review: true })
  assert.deepEqual(batchesSorted(calls.filter((call) => reviewNodeOf(call.label) !== null).map((call) => call.label)), batchesSorted([
    ...lensLabels('design_review'), ...lensLabels('distill_review'), ...lensLabels('deliver_review'),
  ]))
  assert.deepEqual([...new Set(calls.map((call) => `${reviewNodeOf(call.label) === null ? 'phase agent' : 'lens'} ${call.model}`))].sort(), ['lens claude-haiku-5.5', 'phase agent claude-opus-5.5', 'phase agent claude-sonnet-5.5'])
  assert.deepEqual([...new Set(events.filter((event) => event.type === 'review.lens' || (event.type === 'step.recorded' && 'model' in event)).map(({ model }) => model))].sort(), ['claude-haiku-5.5', 'claude-opus-5.5', 'claude-sonnet-5.5'])
  assert.deepEqual(lensEvents(events, 'design_review').map(({ lens, agent, verdict, findings }) => [lens, agent, verdict, findings]).sort(), [
    ['architecture-compliance', 'architecture-compliance-lens', 'pass', []], ['consistency', 'consistency-lens', 'pass', []], ['fitness', 'fitness-lens', 'pass', []],
  ])
  const review = join(trackingDir(cwd, SLUG), 'reviews', 'design_review-1')
  assert.match(readFileSync(join(review, 'changes.patch'), 'utf8'), /^diff --git a\/docs\/adr\/adr-001-card-payment\.md b\/docs\/adr\/adr-001-card-payment\.md\n/)
  assert.equal(readFileSync(join(review, 'changed-files.txt'), 'utf8').split('\n').filter((line) => !line.startsWith('.copilot-tracking/')).join('\n'), 'docs/adr/adr-001-card-payment.md\n')
  assert.match(readFileSync(join(review, 'verdict.yaml'), 'utf8'), /^status: "APPROVED"\ncode: null\nsummary: "APPROVED: every lens passed"\nfindings: \[\]\n/)
})

test('a blocker the refuter confirms sends DESIGN back as pass 2 with the finding in its brief, then the review approves it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const blocker = finding('F1', 'blocker', 'The ADR names no payment provider')
  const revises = (brief, { slug }) => {
    fillOutputs(brief, 'The provider is Acme Pay.\n')
    commit(cwd, `docs(${slug}): name the payment provider`, { 'docs/adr/adr-001-card-payment.md': '# ADR-001 Card payment\n\n**Status:** Proposed\n\nAccepted: Acme Pay.\n' })
    writeResult(brief, { status: 'done', summary: 'provider named' })
  }

  const { outcome, calls, events } = await runOn(cwd, {
    acts: { 'solution-architect': [NOMINAL['solution-architect'], revises] },
    reviews: { consistency: [says('consistency', 'fail', [blocker])] },
  })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(reviewsOf(events).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'distill']])
  const refute = calls.filter((call) => call.label.includes(' · refute '))
  assert.deepEqual(refute.map(({ agent, label }) => `${agent} | ${label}`), [`skraft:finding-refuter | skraft ${SLUG} · design_review · refute consistency F1 · attempt 1`])
  assert.match(refute[0].prompt, /^## Skraft finding check: consistency F1\n- Finding: G1 blocker at docs\/adr\/adr-001-card-payment\.md:3: The ADR names no payment provider\n/)
  assert.deepEqual(events.filter((event) => event.type === 'review.refuted').map(({ step, visit, lens, finding: id, verdict }) => [step, visit, lens, id, verdict]), [['design_review', 1, 'consistency', 'F1', 'confirmed']])
  const second = calls.find((call) => call.label === `skraft ${SLUG} · design · pass 2 · attempt 1`)
  assert.ok(second.prompt.includes('- Pass: 2, after the review sent the work back'), second.prompt)
  assert.ok(second.prompt.includes('The review sent the work back on pass 1, with these findings:\n- '), second.prompt)
  assert.ok(second.prompt.includes('The ADR names no payment provider'), second.prompt)
  assert.deepEqual(events.filter((event) => event.type === 'step.started' && event.step === 'design').map(({ visit, feedback, sentBy }) => [visit, feedback, sentBy ?? null]), [
    [1, [], null],
    [2, [FINDING_LINE], 'review'],
  ])
  assert.deepEqual(events.find((event) => event.type === 'step.recorded' && event.step === 'design_review').failures, [FINDING_LINE])
  assert.ok(second.prompt.includes(`with these findings:\n- ${FINDING_LINE}`), second.prompt)
  // The architect changed the ADR and its document, so every lens reads pass 2 afresh.
  assert.deepEqual(batchesSorted(calls.filter((call) => / · design_review · .* · pass 2 · /.test(call.label)).map((call) => call.label)), batchesSorted(lensLabels('design_review', { visit: 2 })))
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'design').map(({ visit, commits }) => [visit, commits.map(({ subject }) => subject)]), [
    [1, [`docs(${SLUG}): record the card payment decision`]],
    [2, [`docs(${SLUG}): name the payment provider`]],
  ])
  assert.equal(git(cwd, 'show', 'HEAD:docs/adr/adr-001-card-payment.md'), '# ADR-001 Card payment\n\n**Status:** Proposed\n\nAccepted: Acme Pay.')
})

test('a lens that answers twice without a readable verdict stops the run as lens-unreadable, naming its agent; the resumed run calls only that lens again', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, events } = await runOn(cwd, { reviews: { fitness: ['The design fits.', 'It fits, really.'] } })

  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'DESIGN', 'lens-unreadable'])
  assert.equal(outcome.reason, 'fitness-lens answered 2 times without a readable verdict: the answer is not the YAML document the brief shows (line 1: is not a `key: value` line)')
  const fitness = calls.filter((call) => call.label.includes(' · fitness · '))
  assert.deepEqual(fitness.map((call) => call.label), [`skraft ${SLUG} · design_review · fitness · attempt 1`, `skraft ${SLUG} · design_review · fitness · attempt 2`])
  assert.ok(fitness[1].prompt.endsWith('Your previous answer was refused: the answer is not the YAML document the brief shows (line 1: is not a `key: value` line). Answer again with the YAML document only.'), fitness[1].prompt)
  assert.deepEqual(recordedReview(events), [])
  assert.deepEqual([events.at(-1).type, events.at(-1).code], ['run.stopped', 'lens-unreadable'])
  assert.equal(calls.some((call) => call.label.includes(' · distill ')), false)

  const resumed = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })
  const done = await runSkraftPipelineWorkflow(resumed.ctx, { cwd, pluginRoot: PLUGIN_ROOT })

  assert.equal(done.status, 'done')
  assert.deepEqual(resumed.calls.filter((call) => reviewNodeOf(call.label) === 'design_review').map((call) => call.label), [`skraft ${SLUG} · design_review · fitness · attempt 1`])
  assert.deepEqual(recordedReview(journal(cwd, SLUG))[0], ['design_review', 'approved', null])
})

test('a lens that answers inconclusive blocks the review as lens-inconclusive, naming it, and DESIGN is not sent back', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, events } = await runOn(cwd, { reviews: { fitness: [says('fitness', 'inconclusive', [finding('F1', 'low', 'the research document is empty')])] } })

  const reason = 'fitness: inconclusive: the research document is empty'
  assert.deepEqual([outcome.status, outcome.phase, outcome.code, outcome.reason], ['blocked', 'DESIGN', 'lens-inconclusive', reason])
  assert.deepEqual(recordedReview(events), [['design_review', 'blocked', 'lens-inconclusive']])
  assert.deepEqual(calls.slice(2).map((call) => call.label).sort(), [...lensLabels('design_review')].sort())
})

const recordedReview = (events) => events.filter((event) => event.type === 'step.recorded' && event.step.endsWith('_review')).map(({ step, outcome, code }) => [step, outcome, code])

test('a review resumed after the workflow died calls again only the lens that had not answered, under the same label', async (t) => {
  const { cwd } = pipelineRepository(t)
  const hung = `skraft ${SLUG} · design_review · architecture-compliance · attempt 1`
  const llm = scriptedLlm({ cwd })
  // The workflow process dies while architecture-compliance runs: its ctx.agent never settles.
  const first = simulatedContext({ args: { slug: SLUG }, otherwise: async (call) => (call.label === hung ? new Promise(() => {}) : actsAs(llm)(call)) })
  const dead = runSkraftPipelineWorkflow(first.ctx, { cwd, pluginRoot: PLUGIN_ROOT })
  await waitFor(() => first.timeline.filter((line) => line.startsWith('answer ') && reviewNodeOf(line) === 'design_review').length === 2, 10_000)
  assert.equal(await Promise.race([dead.then(() => 'settled'), new Promise((resolve) => setTimeout(resolve, 50, 'hung'))]), 'hung')
  assert.deepEqual(lensEvents(journal(cwd, SLUG), 'design_review'), [])

  const resumed = simulatedContext({ args: { slug: SLUG }, journal: first.journal, otherwise: actsAs(scriptedLlm({ cwd })) })
  const outcome = await runSkraftPipelineWorkflow(resumed.ctx, { cwd, pluginRoot: PLUGIN_ROOT })

  assert.equal(outcome.status, 'done')
  assert.ok(first.calls.some((call) => call.label === hung))
  assert.deepEqual(resumed.calls.filter((call) => reviewNodeOf(call.label) === 'design_review').map((call) => call.label), [hung])
  assert.equal(resumed.calls[0].label, hung)
  assert.deepEqual(lensEvents(journal(cwd, SLUG), 'design_review').map(({ lens, visit, verdict }) => [lens, visit, verdict]).sort(), [
    ['architecture-compliance', 1, 'pass'], ['consistency', 1, 'pass'], ['fitness', 1, 'pass'],
  ])
})

test('a repository lens added to design_review is called with the others, under its own id', async (t) => {
  const { cwd } = pipelineRepository(t, { lens: true })

  const { outcome, calls, timeline, events } = await runOn(cwd, { sizes: { design_review: 4, distill_review: 4, deliver_review: 3 } })

  assert.equal(outcome.status, 'done')
  assert.equal(events[0].workflow, 'skraft-workflow.dot')
  const design = calls.filter((call) => reviewNodeOf(call.label) === 'design_review')
  assert.deepEqual(design.map(({ agent, label }) => `${agent} | ${label}`).sort(), [
    ...LENSES.design_review.map((lens) => `skraft:${lens}-lens`), `${SECURITY_LENS}-lens`,
  ].map((agent, index) => `${agent} | ${lensLabels('design_review', { lenses: [...LENSES.design_review, SECURITY_LENS] })[index]}`).sort())
  assert.match(design.find((call) => call.agent === `${SECURITY_LENS}-lens`).prompt, new RegExp(`^## Skraft review lens: ${SECURITY_LENS} \\(DESIGN\\)\\n`))
  assert.equal(startedTogether(timeline).design_review, true)
  assert.deepEqual(lensEvents(events, 'design_review').map(({ lens }) => lens).sort(), ['acme-security', 'architecture-compliance', 'consistency', 'fitness'])
})

test('a repository lens listing a skill nobody provides is refused before anything starts, naming the node, the lens and the skill', async (t) => {
  const { cwd } = pipelineRepository(t, { lens: true, lensSkills: ['acme-threat-model'] })
  const host = simulatedContext({ args: { slug: SLUG }, otherwise: actsAs(scriptedLlm({ cwd })) })

  const outcome = await runSkraftPipelineWorkflow(host.ctx, { cwd, pluginRoot: PLUGIN_ROOT })

  assert.deepEqual([outcome.status, outcome.code, outcome.reason], [
    'refused', 'workflow-invalid',
    `skraft-workflow.dot is invalid: node design_review: skill acme-threat-model of lens ${SECURITY_LENS} (agent ${SECURITY_LENS}-lens) not found in the plugin's skills/, .claude/skills/ or .github/skills/`,
  ])
  assert.deepEqual(host.calls, [])
})

test('a blocker the refuter refutes does not count; an unverifiable high finding does, marked as not verified', async (t) => {
  const { cwd } = pipelineRepository(t)
  const revises = (brief, { slug }) => {
    fillOutputs(brief, 'Payments has one owner.\n')
    commit(cwd, `docs(${slug}): one owner for payments`, { 'docs/adr/adr-001-card-payment.md': '# ADR-001 Card payment\n\n**Status:** Proposed\n\nPayments owns refunds.\n' })
    writeResult(brief, { status: 'done', summary: 'owner named' })
  }

  const { outcome, calls, events } = await runOn(cwd, {
    acts: { 'solution-architect': [NOMINAL['solution-architect'], revises] },
    reviews: {
      consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'The ADR names no payment provider'), finding('F2', 'high', 'Two contexts own payments')])],
      refuter: [refutes('refuted', 'docs/adr/adr-001-card-payment.md:3 names Acme Pay'), refutes('unverifiable', 'the context map does not say')],
    },
  })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(calls.filter((item) => item.label.includes(' · refute ')).map((item) => item.label), [
    `skraft ${SLUG} · design_review · refute consistency F1 · attempt 1`, `skraft ${SLUG} · design_review · refute consistency F2 · attempt 1`,
  ])
  assert.deepEqual(events.filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict }) => [lens, id, verdict]), [['consistency', 'F1', 'refuted'], ['consistency', 'F2', 'unverifiable']])
  assert.deepEqual(events.find((event) => event.type === 'step.recorded' && event.step === 'design_review').failures, ['consistency F2 G1 high at docs/adr/adr-001-card-payment.md:3: Two contexts own payments (suggestion: name the provider) (not verified)'])
  assert.deepEqual(reviewsOf(events).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'distill']])
})

test('a blocker two lenses give at the same line is checked in one call, each finding on its own verdict', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, calls, events } = await runOn(cwd, {
    reviews: {
      consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'The ADR names no payment provider')])],
      'architecture-compliance': [says('architecture-compliance', 'fail', [finding('F1', 'blocker', 'The ADR leaves the provider open', { location: './docs/adr/adr-001-card-payment.md:3' })])],
      refuter: [checksOf([['consistency F1', 'refuted', 'docs/adr/adr-001-card-payment.md:3 names Acme Pay'], ['architecture-compliance F1', 'refuted', 'docs/adr/adr-001-card-payment.md:3 settles the provider']])],
    },
  })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(calls.filter((call) => call.label.includes(' · refute ')).map(({ agent, label }) => `${agent} | ${label}`), [
    `skraft:finding-refuter | skraft ${SLUG} · design_review · refute consistency F1, architecture-compliance F1 · attempt 1`,
  ])
  assert.deepEqual(events.filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict }) => [lens, id, verdict]), [['consistency', 'F1', 'refuted'], ['architecture-compliance', 'F1', 'refuted']])
  assert.deepEqual(reviewsOf(events)[0], ['design_review', 1, 'approved', 'distill'])
})

test('on pass 2 only the lenses that had findings or whose inputs changed run again; a clean one whose inputs did not move is taken over', async (t) => {
  const { cwd } = pipelineRepository(t)
  const blocker = finding('F1', 'blocker', 'The ADR names no payment provider')
  const reworks = (brief, { slug }) => {
    commit(cwd, `docs(${slug}): name the payment provider`, { 'docs/adr/adr-001-card-payment.md': '# ADR-001 Card payment\n\n**Status:** Proposed\n\nAccepted: Acme Pay.\n' })
    writeResult(brief, { status: 'done', summary: 'provider named' })
  }

  const { outcome, calls, events } = await runOn(cwd, {
    acts: { 'solution-architect': [NOMINAL['solution-architect'], reworks] },
    reviews: { consistency: [says('consistency', 'fail', [blocker])] },
  })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(calls.filter((item) => / · design_review · .* · pass 2 · /.test(item.label)).map((item) => item.label).sort(), [
    `skraft ${SLUG} · design_review · architecture-compliance · pass 2 · attempt 1`, `skraft ${SLUG} · design_review · consistency · pass 2 · attempt 1`,
  ])
  assert.deepEqual(lensEvents(events, 'design_review').filter((event) => event.visit === 2).map(({ lens, reused }) => [lens, reused ?? false]).sort(), [
    ['architecture-compliance', false], ['consistency', false], ['fitness', true],
  ])
})
