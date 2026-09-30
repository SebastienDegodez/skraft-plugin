// Acceptance — the state CLI prints the dispatch manifest of a phase agent from what
// earlier phases recorded, and the timeline splits a phase's time by dispatch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CONFIG, producePhase, stateCli } from '../state/phase-closure-fixture.mjs'

const withTrackingRoot = async (fn) => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-handoff-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

// Closes every phase before DELIVER, then opens DELIVER.
const walkToDeliver = ({ root, cli }) => {
  cli('init', '--slug', 'demo')
  for (const phase of CONFIG.phaseOrder.slice(0, CONFIG.phaseOrder.indexOf('DELIVER'))) {
    cli('mark-phase-started', '--slug', 'demo', '--phase', phase)
    const review = producePhase({ root, slug: 'demo', phase, cli })
    const next = CONFIG.phaseOrder[CONFIG.phaseOrder.indexOf(phase) + 1]
    if (review) cli('transition', '--slug', 'demo', '--to', next)
    else cli('close-phase', '--slug', 'demo', '--phase', phase, '--verdict', 'APPROVED')
  }
  cli('mark-phase-started', '--slug', 'demo', '--phase', 'DELIVER')
}

test('the DELIVER engineer manifest carries the DISTILL test-plan and impl-plan', async () => {
  await withTrackingRoot(async (root) => {
    const cli = stateCli({ root })
    walkToDeliver({ root, cli })

    const block = cli('handoff', '--slug', 'demo', '--agent', 'software-engineer')

    assert.match(block, /### Handoff \(from `state\.mjs handoff` — pasted verbatim\)/)
    assert.match(block, /- Mode: first pass/)
    assert.match(block, /details\/2026-09-23\/test-plan-loyalty\.md/)
    assert.match(block, /details\/2026-09-23\/impl-plan-loyalty\.md/)
  })
})

test('after a rejected review the engineer manifest switches to rework and names the review', async () => {
  await withTrackingRoot(async (root) => {
    const cli = stateCli({ root })
    walkToDeliver({ root, cli })
    const review = 'reviews/2026-09-23/deliver-review-1.md'
    await mkdir(join(root, 'demo', 'reviews', '2026-09-23'), { recursive: true })
    await writeFile(join(root, 'demo', review), '```yaml\nverdict: "NEEDS_REWORK"\n```\n')
    cli('record-review-artifact', '--slug', 'demo', '--phase', 'DELIVER', '--path', review)
    cli('record-verdict', '--slug', 'demo', '--phase', 'DELIVER', '--verdict', 'CHANGES_REQUESTED')

    const manifest = JSON.parse(cli('handoff', '--slug', 'demo', '--agent', 'software-engineer', '--json'))

    assert.equal(manifest.mode, 'rework')
    assert.equal(manifest.previousReview, review)
    assert.ok(manifest.required.some((input) => input.paths.includes('details/2026-09-23/test-plan-loyalty.md')),
      `the test-plan must survive the retry; got ${JSON.stringify(manifest.required)}`)
  })
})

test('an agent outside the open phase gets no manifest', async () => {
  await withTrackingRoot(async (root) => {
    const cli = stateCli({ root })
    cli('init', '--slug', 'demo')
    assert.throws(() => cli('handoff', '--slug', 'demo', '--agent', 'software-engineer'), /WRONG_PHASE/)
  })
})

test('the timeline splits a phase between specialist and reviewer dispatches', async () => {
  await withTrackingRoot(async (root) => {
    const cli = stateCli({ root })
    cli('init', '--slug', 'demo')
    const auditLog = join(root, 'audit.jsonl')
    const line = (eventType, agentName, timestamp) =>
      JSON.stringify({ eventType, agentName, projectSlug: 'demo', phase: 'RESEARCH', role: 'specialist', timestamp })
    await writeFile(auditLog, [
      line('SubagentStarted', 'Skraft - Solution Researcher', '2026-09-30T10:00:00.000Z'),
      line('SubagentStopped', 'Skraft - Solution Researcher', '2026-09-30T10:04:00.000Z'),
      JSON.stringify({ eventType: 'SubagentStarted', agentName: 'x', projectSlug: 'other', timestamp: '2026-09-30T10:00:00.000Z' }),
    ].join('\n') + '\n')

    const timeline = JSON.parse(cli('timeline', '--slug', 'demo', '--audit-log', auditLog))

    const research = timeline.phases.find((p) => p.phase === 'RESEARCH')
    assert.equal(research.specialist.dispatches, 1)
    assert.equal(research.specialist.ms, 4 * 60 * 1000)
    assert.equal(timeline.unmatchedDispatches, 0)
  })
})
