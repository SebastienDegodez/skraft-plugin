import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API, lenses, nominal, scripted, SLUG } from '../support/pipeline-host.mjs'
import { BUILT_IN_WORKFLOW, InMemoryAgentCatalog } from '../support/in-memory-host.mjs'
import { ejectedPipeline, withLenses } from '../workflow/support.mjs'

/** The lens agents a review node dispatched on its first pass. @param {ReturnType<typeof scripted>} host @param {string} step */
const askedOn = (host, step) => host.agentRunner.reviewed()
  .filter((dispatch) => dispatch.agent !== 'finding-refuter' && dispatch.label.includes(` · ${step} · `) && !dispatch.label.includes('· pass '))
  .map((dispatch) => dispatch.agent)

/** @param {ReturnType<typeof scripted>} host @param {string} step */
const lensEvents = (host, step) => host.events().filter((event) => event.type === 'review.lens' && event.step === step)

/** design_review with a lens that judges the code changes alone beside its own: DESIGN changes only `docs/adr`. */
const designWithColdReader = () => withLenses(BUILT_IN_WORKFLOW, 'design_review', ['consistency', 'architecture-compliance', 'fitness', 'cold-reader'])

test('a lens that judges the changes alone is not asked when its scope holds none: it is journaled as passed for no change, and the review still asks consistency, architecture-compliance and fitness', async () => {
  const host = scripted({ files: ejectedPipeline(designWithColdReader(), { components: [API] }) }, nominal)
  host.agentRunner.review = lenses({})

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(askedOn(host, 'design_review'), ['consistency-lens', 'architecture-compliance-lens', 'fitness-lens'])
  const skipped = lensEvents(host, 'design_review').find((event) => event.lens === 'cold-reader')
  assert.deepEqual({ ...skipped, at: undefined, seq: undefined, prev: undefined, hash: undefined, sig: undefined, fingerprint: undefined }, {
    ...skipped, at: undefined, seq: undefined, prev: undefined, hash: undefined, sig: undefined, fingerprint: undefined,
    type: 'review.lens', step: 'design_review', visit: 1, lens: 'cold-reader', agent: 'cold-reader-lens', verdict: 'pass', findings: [], skipped: 'no-changes',
  })
  assert.equal(skipped.assignment, undefined)
  assert.equal(typeof skipped.fingerprint, 'string')
  assert.ok(host.progress.lines.includes(`${SLUG}: design_review skips cold-reader: no change to judge`), host.progress.lines.join('\n'))
  const verdict = await host.tracking.read(SLUG, 'reviews/design_review-1/verdict.yaml')
  assert.ok(verdict.startsWith('status: "APPROVED"\n'), verdict)
  assert.ok(verdict.endsWith('\nreused: []\nskipped:\n  - lens: "cold-reader"\n    reason: "no-changes"\n'), verdict)
  const report = await host.tracking.read(SLUG, 'run-report.md')
  assert.ok(report.includes('## Lenses not asked\n\n| Review | Pass | Lens | Why |\n| --- | ---: | --- | --- |\n| design_review | 1 | cold-reader | no change in its scope |\n'), report)
  const qa = await host.tracking.read(SLUG, 'qa-report.md')
  assert.ok(qa.includes('| design_review | 1 | approved | 0 | cold-reader skipped (no change), consistency pass, architecture-compliance pass, fitness pass |'), qa)
})

test('in DELIVER, where the code changed, the same lens is asked', async () => {
  const host = scripted({}, nominal)
  host.agentRunner.review = lenses({})

  assert.equal((await host.start()).status, 'done')

  assert.ok(askedOn(host, 'deliver_review').includes('cold-reader-lens'))
  assert.equal(host.events().some((event) => event.type === 'review.lens' && event.skipped !== undefined), false)
  assert.ok(!(await host.tracking.read(SLUG, 'run-report.md')).includes('Lenses not asked'))
})

test('a lens absent from the patch-only list is asked even when the run changed nothing outside the tracking folder', async () => {
  const workflow = withLenses(BUILT_IN_WORKFLOW, 'design_review', ['consistency', 'architecture-compliance', 'fitness', 'acme-naming', 'cold-reader'])
  const host = scripted({ files: ejectedPipeline(workflow, { components: [API] }), catalog: new InMemoryAgentCatalog({ repository: ['acme-naming-lens'] }) }, (it) => [nominal(it)[0], nominal(it)[0], () => ({ ok: false, unavailable: true, text: '', error: 'stop here' })])
  host.agentRunner.review = lenses({})

  await host.start()

  assert.deepEqual(askedOn(host, 'design_review'), ['consistency-lens', 'architecture-compliance-lens', 'fitness-lens', 'acme-naming-lens'])
  assert.deepEqual(lensEvents(host, 'design_review').filter((event) => event.skipped).map(({ lens }) => lens), ['cold-reader'])
})

test('a resumed review does not journal the skipped lens twice and still does not ask it', async () => {
  const host = scripted({ files: ejectedPipeline(designWithColdReader(), { components: [API] }) }, nominal)
  host.agentRunner.review = lenses({ consistency: [{ ok: false, text: '', unavailable: true, error: 'consistency-lens is not installed' }] })

  assert.equal((await host.start()).code, 'agent-unavailable')
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(lensEvents(host, 'design_review').filter((event) => event.lens === 'cold-reader').map(({ skipped }) => skipped), ['no-changes'])
  assert.equal(host.agentRunner.reviewed().some((dispatch) => dispatch.agent === 'cold-reader-lens' && dispatch.label.includes(' · design_review · ')), false)
  assert.equal(host.events().find((event) => event.type === 'step.recorded' && event.step === 'design_review').outcome, 'approved')
})
