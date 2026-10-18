import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { actsAs, scriptedModHost } from './support/scripted-mod-host.mjs'
import {
  LENSES, NOMINAL, SECURITY_LENS, SLUG, refutes, commit, fillOutputs, finding, lensDispatches, lensLabels, pipelineRepository, reviewBriefOf, reviewsOf, says,
  scriptedLlm, writeResult,
} from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'

/** The review node a label belongs to, null for a phase agent's. @param {string} label */
const reviewNodeOf = (label) => / · (\w+_review) · /.exec(label)?.[1] ?? null

/** Waits until `done()` holds, at most `ms`; a host that spawns lenses one by one only makes it slow. */
const waitFor = async (done, ms = 1000) => {
  const deadline = Date.now() + ms
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
}

/**
 * The scripted LLM, a lens's turn completing only once every lens of its review node was
 * spawned, so a driver that waits for one turn before the next spawn shows in the timeline.
 * @param {ReturnType<typeof scriptedLlm>} llm @param {() => Array<{ description: string }>} spawns @param {Record<string, number>} sizes
 */
const answersTogether = (llm, spawns, sizes) => async (spawn, control) => {
  const node = reviewNodeOf(spawn.description)
  if (node === null || reviewBriefOf(spawn.prompt)?.name === 'refuter') return actsAs(llm)(spawn, control)
  const answer = /** @type {string} */ (llm.act(spawn.prompt))
  return control.answerAfter(spawn, waitFor(() => spawns().filter((other) => reviewNodeOf(other.description) === node).length >= sizes[node]), { answer })
}

const SIZES = Object.freeze({ design_review: 3, distill_review: 4, deliver_review: 3 })

/** `/skraft <slug>` on the repository, the scripted LLM answering every spawn, until the run stops. */
const runOn = async (cwd, { acts, reviews, sizes = SIZES, turnCostUsd } = {}) => {
  const llm = scriptedLlm({ cwd, acts, reviews })
  const mod = await scriptedModHost({ cwd, turnCostUsd, otherwise: answersTogether(llm, () => mod.spawns, sizes) })
  await mod.command(SLUG)
  const outcome = await mod.settled()
  return { outcome, mod, spawns: mod.spawns, timeline: mod.timeline, events: journal(cwd, SLUG) }
}

/** Each review node's lenses were all spawned before the first of their turns completed. @param {string[]} timeline */
const startedTogether = (timeline) => {
  const nodes = [...new Set(timeline.map(reviewNodeOf).filter((node) => node !== null))]
  return Object.fromEntries(nodes.map((node) => {
    const own = timeline.filter((line) => reviewNodeOf(line) === node && !line.includes(' · refute '))
    return [node, own.findIndex((line) => line.startsWith('complete ')) === own.filter((line) => line.startsWith('spawn ')).length]
  }))
}

/** How the review hands a confirmed finding to the phase agent. */
const FINDING_LINE = 'consistency F1 G1 blocker at docs/adr/adr-001-card-payment.md:3: The ADR names no payment provider (suggestion: name the provider)'

const lensEvents = (events, step) => events.filter((event) => event.type === 'review.lens' && event.step === step)
const recorded = (events, step) => events.filter((event) => event.type === 'step.recorded' && event.step === step)

test('lenses that all pass approve each review, spawned together, and the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, mod, spawns, timeline, events } = await runOn(cwd)

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  assert.deepEqual(reviewsOf(events), [['design_review', 1, 'approved', 'distill'], ['distill_review', 1, 'approved', 'deliver'], ['deliver_review', 1, 'approved', 'exit']])
  assert.deepEqual(startedTogether(timeline), { design_review: true, distill_review: true, deliver_review: true })
  assert.deepEqual(spawns.filter((spawn) => reviewNodeOf(spawn.description) !== null).map(({ subagentType, description }) => `${subagentType} | ${description}`), [
    ...lensDispatches('design_review'), ...lensDispatches('distill_review'), ...lensDispatches('deliver_review'),
  ])
  assert.deepEqual(lensEvents(events, 'design_review').map(({ lens, agent, verdict, findings }) => [lens, agent, verdict, findings]), [
    ['consistency', 'consistency-lens', 'pass', []], ['architecture-compliance', 'architecture-compliance-lens', 'pass', []], ['fitness', 'fitness-lens', 'pass', []],
  ])
  const review = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'reviews', 'design_review-1')
  assert.match(readFileSync(join(review, 'changes.patch'), 'utf8'), /^diff --git a\/docs\/adr\/adr-001-card-payment\.md b\/docs\/adr\/adr-001-card-payment\.md\n/)
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: deliver_review (test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity)`), mod.published.at(-1).log.join('\n'))
})

test('a blocker the refuter confirms sends DESIGN back as pass 2 with the finding in its brief, then the review approves it', async (t) => {
  const { cwd } = pipelineRepository(t)
  const blocker = finding('F1', 'blocker', 'The ADR names no payment provider')
  const revises = (brief, { slug }) => {
    fillOutputs(brief, 'The provider is Acme Pay.\n')
    commit(cwd, `docs(${slug}): name the payment provider`, { 'docs/adr/adr-001-card-payment.md': '# ADR-001 Card payment\n\nAccepted: Acme Pay.\n' })
    writeResult(brief, { status: 'done', summary: 'provider named' })
  }

  const { outcome, spawns, events } = await runOn(cwd, {
    acts: { 'solution-architect': [NOMINAL['solution-architect'], revises] },
    reviews: { consistency: [says('consistency', 'fail', [blocker])] },
  })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(reviewsOf(events).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'distill']])
  assert.deepEqual(spawns.slice(0, 10).map((spawn) => spawn.description), [
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, ...lensLabels('design_review'),
    `skraft ${SLUG} · design_review · refute consistency F1 · attempt 1`,
    `skraft ${SLUG} · design · pass 2 · attempt 1`, ...lensLabels('design_review', { visit: 2 }),
  ])
  assert.equal(spawns[5].subagentType, 'skraft:finding-refuter')
  assert.match(spawns[5].prompt, /^## Skraft finding check: consistency F1\n- Finding: G1 blocker at docs\/adr\/adr-001-card-payment\.md:3: The ADR names no payment provider\n/)
  assert.deepEqual(events.filter((event) => event.type === 'review.refuted').map(({ step, visit, lens, finding: id, verdict }) => [step, visit, lens, id, verdict]), [['design_review', 1, 'consistency', 'F1', 'confirmed']])
  assert.deepEqual(recorded(events, 'design_review')[0].failures, [FINDING_LINE])
  assert.ok(spawns[6].prompt.includes('- Pass: 2, after the review sent the work back'), spawns[6].prompt)
  assert.ok(spawns[6].prompt.includes(`The review sent the work back on pass 1, with these findings:\n- ${FINDING_LINE}`), spawns[6].prompt)
  assert.equal(git(cwd, 'show', 'HEAD:docs/adr/adr-001-card-payment.md'), '# ADR-001 Card payment\n\nAccepted: Acme Pay.')
})

test('a lens that answers twice without a readable verdict blocks the run as lens-unreadable, naming its agent', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, spawns, events, mod } = await runOn(cwd, { reviews: { fitness: ['The design fits.', 'It fits, really.'] } })

  assert.deepEqual([outcome.status, outcome.phase, outcome.code], ['blocked', 'DESIGN', 'lens-unreadable'])
  assert.equal(outcome.reason, 'fitness-lens answered 2 times without a readable verdict: the answer is not the YAML document the brief shows (line 1: is not a `key: value` line)')
  assert.deepEqual(spawns.slice(2).map((spawn) => spawn.description), [...lensLabels('design_review'), `skraft ${SLUG} · design_review · fitness · attempt 2`])
  assert.ok(spawns.at(-1).prompt.endsWith('Your previous answer was refused: the answer is not the YAML document the brief shows (line 1: is not a `key: value` line). Answer again with the YAML document only.'), spawns.at(-1).prompt)
  assert.deepEqual(recorded(events, 'design_review').map(({ outcome: result, code }) => [result, code]), [['blocked', 'lens-unreadable']])
  assert.equal(mod.notes.at(-1), `skraft ${SLUG}: blocked (lens-unreadable) — ${outcome.reason}`)
})

test('a run stopped by a lens the host could not spawn spawns only that lens again when resumed', async (t) => {
  const { cwd } = pipelineRepository(t)
  const missing = `skraft ${SLUG} · design_review · fitness · attempt 1`
  const llm = scriptedLlm({ cwd })
  const first = await scriptedModHost({ cwd, otherwise: async (spawn, control) => (spawn.description === missing ? { deny: 'skraft:fitness-lens is not installed' } : actsAs(llm)(spawn, control)) })
  await first.command(SLUG)
  const stopped = await first.settled()
  assert.deepEqual([stopped.status, stopped.phase, stopped.code, stopped.reason], ['blocked', 'DESIGN', 'agent-unavailable', 'skraft:fitness-lens is not installed'])
  assert.deepEqual(lensEvents(journal(cwd, SLUG), 'design_review').map(({ lens }) => lens), ['consistency', 'architecture-compliance'])

  const reloaded = await scriptedModHost({ cwd, otherwise: actsAs(scriptedLlm({ cwd })) })
  await reloaded.command(SLUG)
  const outcome = await reloaded.settled()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(reloaded.spawns.filter((spawn) => reviewNodeOf(spawn.description) === 'design_review').map((spawn) => spawn.description), [missing])
  assert.equal(reloaded.spawns[0].description, missing)
  assert.deepEqual(lensEvents(journal(cwd, SLUG), 'design_review').map(({ lens, visit }) => [lens, visit]), [['consistency', 1], ['architecture-compliance', 1], ['fitness', 1]])
  assert.deepEqual(reviewsOf(journal(cwd, SLUG))[0], ['design_review', 1, 'approved', 'distill'])
})

test('a repository lens added to design_review is spawned with the others, under its own id', async (t) => {
  const { cwd } = pipelineRepository(t, { lens: true })

  const { outcome, spawns, timeline, events } = await runOn(cwd, { sizes: { ...SIZES, design_review: 4 } })

  assert.equal(outcome.status, 'done')
  assert.equal(events[0].workflow, 'skraft-workflow.dot')
  const lenses = [...LENSES.design_review, SECURITY_LENS]
  const labels = lensLabels('design_review', { lenses })
  assert.deepEqual(spawns.filter((spawn) => reviewNodeOf(spawn.description) === 'design_review').map(({ subagentType, description }) => `${subagentType} | ${description}`), [
    ...LENSES.design_review.map((lens, index) => `skraft:${lens}-lens | ${labels[index]}`), `${SECURITY_LENS}-lens | ${labels[3]}`,
  ])
  assert.match(spawns.find((spawn) => spawn.subagentType === `${SECURITY_LENS}-lens`).prompt, new RegExp(`^## Skraft review lens: ${SECURITY_LENS} \\(DESIGN\\)\\n`))
  assert.equal(startedTogether(timeline).design_review, true)
  assert.deepEqual(lensEvents(events, 'design_review').map(({ lens }) => lens), lenses)
})

test('a repository lens listing a skill nobody provides is refused before anything starts, naming the node, the lens and the skill', async (t) => {
  const { cwd } = pipelineRepository(t, { lens: true, lensSkills: ['acme-threat-model'] })
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(scriptedLlm({ cwd })) })

  const text = await mod.command(SLUG)

  assert.equal(text, `skraft ${SLUG}: not started — skraft-workflow.dot is invalid: node design_review: skill acme-threat-model of lens ${SECURITY_LENS} (agent ${SECURITY_LENS}-lens) not found in the plugin's skills/, .claude/skills/ or .github/skills/`)
  assert.deepEqual(mod.spawns, [])
})

test('the session cost a review batch adds lands on the review step.recorded, no lens carries a cost of its own', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, events } = await runOn(cwd, { turnCostUsd: 0.25 })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(['design', 'design_review', 'distill_review', 'deliver_review'].map((step) => [step, recorded(events, step).map(({ cost }) => cost)]), [
    ['design', [0.25]], ['design_review', [0.75]], ['distill_review', [1]], ['deliver_review', [0.75]],
  ])
  assert.deepEqual(events.filter((event) => event.type === 'review.lens' && 'cost' in event), [])
  assert.equal(events.filter((event) => event.type === 'review.lens').length, 10)
})

test('a blocker the refuter refutes does not count; an unverifiable high finding does, marked as not verified', async (t) => {
  const { cwd } = pipelineRepository(t)
  const revises = (brief, { slug }) => {
    fillOutputs(brief, 'Payments has one owner.\n')
    commit(cwd, `docs(${slug}): one owner for payments`, { 'docs/adr/adr-001-card-payment.md': '# ADR-001 Card payment\n\nPayments owns refunds.\n' })
    writeResult(brief, { status: 'done', summary: 'owner named' })
  }

  const { outcome, spawns, events } = await runOn(cwd, {
    acts: { 'solution-architect': [NOMINAL['solution-architect'], revises] },
    reviews: {
      consistency: [says('consistency', 'fail', [finding('F1', 'blocker', 'The ADR names no payment provider'), finding('F2', 'high', 'Two contexts own payments')])],
      refuter: [refutes('refuted', 'docs/adr/adr-001-card-payment.md:3 names Acme Pay'), refutes('unverifiable', 'the context map does not say')],
    },
  })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(spawns.filter((item) => item.description.includes(' · refute ')).map((item) => item.description), [
    `skraft ${SLUG} · design_review · refute consistency F1 · attempt 1`, `skraft ${SLUG} · design_review · refute consistency F2 · attempt 1`,
  ])
  assert.deepEqual(events.filter((event) => event.type === 'review.refuted').map(({ lens, finding: id, verdict }) => [lens, id, verdict]), [['consistency', 'F1', 'refuted'], ['consistency', 'F2', 'unverifiable']])
  assert.deepEqual(recorded(events, 'design_review')[0].failures, ['consistency F2 G1 high at docs/adr/adr-001-card-payment.md:3: Two contexts own payments (suggestion: name the provider) (not verified)'])
  assert.deepEqual(reviewsOf(events).slice(0, 2), [['design_review', 1, 'needs-rework', 'design'], ['design_review', 2, 'approved', 'distill']])
})

test('on pass 2 only the lenses that had findings or whose inputs changed run again; a clean one whose inputs did not move is taken over', async (t) => {
  const { cwd } = pipelineRepository(t)
  const blocker = finding('F1', 'blocker', 'The ADR names no payment provider')
  const reworks = (brief, { slug }) => {
    commit(cwd, `docs(${slug}): name the payment provider`, { 'docs/adr/adr-001-card-payment.md': '# ADR-001 Card payment\n\nAccepted: Acme Pay.\n' })
    writeResult(brief, { status: 'done', summary: 'provider named' })
  }

  const { outcome, spawns, events } = await runOn(cwd, {
    acts: { 'solution-architect': [NOMINAL['solution-architect'], reworks] },
    reviews: { consistency: [says('consistency', 'fail', [blocker])] },
  })

  assert.equal(outcome.status, 'done')
  assert.deepEqual(spawns.filter((item) => / · design_review · .* · pass 2 · /.test(item.description)).map((item) => item.description).sort(), [
    `skraft ${SLUG} · design_review · architecture-compliance · pass 2 · attempt 1`, `skraft ${SLUG} · design_review · consistency · pass 2 · attempt 1`,
  ])
  assert.deepEqual(lensEvents(events, 'design_review').filter((event) => event.visit === 2).map(({ lens, reused }) => [lens, reused ?? false]).sort(), [
    ['architecture-compliance', false], ['consistency', false], ['fitness', true],
  ])
})
