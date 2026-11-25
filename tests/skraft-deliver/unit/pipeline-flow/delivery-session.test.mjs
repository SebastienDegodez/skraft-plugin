import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, pipelineHost } from '../support/pipeline-host.mjs'
import { createDeliveryRun } from '../../../../plugins/skraft-deliver/engine/application/architecture/delivery-run.mjs'
import { createAgentLoop } from '../../../../plugins/skraft-deliver/engine/drivers/cli/agent-loop.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-deliver/engine/application/pipeline/run-pipeline-usecase.mjs'
import { createDecide } from '../../../../plugins/skraft-deliver/engine/application/decisions/decide-usecase.mjs'
import { createHash, createHmac } from 'node:crypto'

const session = (options = {}) => {
  const host = pipelineHost({ slug: 'issue-42', ...options })
  const branches = []
  const deps = { ...host.deps, architectureForge: { read: async () => ({ ok: true, issue: {
    number: 42, title: 'Checkout', body: 'AC-1: receipt visible.', story: true, forge: 'github', repository: 'shop/checkout',
  } }) }, architectureRepository: {
    branch: async (request) => { branches.push(request); return { ok: true } },
    snapshot: async () => ({ ok: true, sha: 'merged-sha', paths: [] }), unmerged: async () => ({ ok: true, found: false }),
  } }
  const run = createDeliveryRun(deps)
  return { host, deps, branches, run }
}

test('no architecture starts at DISTILL, never RESEARCH or DESIGN, and resumes pending work', async () => {
  const { host, deps, branches, run } = session()
  const started = await run.start({ issue: 42 })
  assert.equal(started.status, 'ready', started.reason)
  assert.match(started.notice, /No architecture brief/)
  const loop = createAgentLoop({ adapters: deps, log: () => {}, then: { next: 'next', record: 'record', review: () => 'review' } })
  const step = await loop.next()
  assert.equal(step.status, 'dispatch', step.reason)
  assert.deepEqual(step.dispatches.map(({ agent }) => agent), ['deliver-acceptance-designer'])
  assert.equal((await run.prepare()).status, 'ready')
  assert.equal((await loop.next()).code, 'not-recorded')
  assert.deepEqual(branches, [{ name: 'deliver/issue-42', existing: false }])
  assert.equal(host.events().some(({ phase }) => ['RESEARCH', 'DESIGN'].includes(phase)), false)
})

test('delivery retains human scenario approval, TDD, gates and final review before its local PR', async () => {
  const { host, deps, run } = session({ scenarioReviews: [null, { answer: 'APPROVED' }] })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(agent()(host), agent()(host))
  const first = await createRunPipeline(deps).run()
  assert.equal(first.status, 'waiting', first.reason)
  assert.equal(host.agentRunner.dispatches.some(({ agent }) => agent === 'deliver-software-engineer'), false)
  const finished = await createRunPipeline(deps).run()
  assert.equal(finished.status, 'done', finished.reason)
  assert.ok(host.agentRunner.dispatches.some(({ agent }) => agent === 'deliver-software-engineer'))
  const lenses = host.agentRunner.reviewed().map(({ agent }) => agent)
  assert.ok(lenses.includes('deliver-test-integrity-lens'), lenses.join(', '))
  // the gates run through skraft_deliver_repl; the DELIVER review's quality-gates lens judges them from the signed trace
  assert.ok(lenses.includes('deliver-quality-gates-lens'), lenses.join(', '))
  assert.ok(host.events().some(({ type, step, outcome }) => type === 'step.recorded' && step === 'publish' && outcome === 'local'))
})

const architectureSession = ({ changed = false, status = 'Accepted' } = {}) => {
  const context = session()
  context.deps.hasher = { sha256: async (text) => createHash('sha256').update(text).digest('hex'),
    hmacSha256: async (key, text) => createHmac('sha256', key).update(text).digest('hex') }
  const path = 'docs/architecture/stories/42-checkout.md'
  const adr = 'docs/adr/adr-001-checkout.md'
  const brief = { version: 1, issue: 42, forge: 'github', repository: 'shop/checkout',
    bodySha256: createHash('sha256').update(changed ? 'Earlier criteria.' : 'AC-1: receipt visible.').digest('hex'),
    components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [adr] }], adrs: [adr], documents: [] }
  const documents = new Map([[path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout`],
    [adr, `<!-- markdownlint-disable-file -->\n---\nstatus: ${status}\n---\n\n# Accepted checkout architecture`]])
  context.deps.architectureRepository.snapshot = async () => ({ ok: true, sha: 'merged-sha', paths: [...documents.keys()], read: async (name) => documents.get(name) ?? null })
  return { ...context, documents }
}

test('a merged brief and cited ADR reach the actual DISTILL dispatch and remain bound on resume', async () => {
  const { host, deps, run } = architectureSession()
  assert.equal((await run.start({ issue: 42 })).status, 'ready')
  const loop = createAgentLoop({ adapters: deps, log: () => {}, then: { next: 'next', record: 'record', review: () => 'review' } })
  const handoff = await loop.next()
  assert.equal(handoff.status, 'dispatch', handoff.reason)
  const architecture = host.events().find(({ type }) => type === 'architecture.bound').artifacts
  assert.equal(architecture.length, 3)
  assert.match(await host.tracking.read('issue-42', architecture[1]), /Accepted checkout architecture/)
  const prompt = await host.tracking.read('issue-42', handoff.dispatches[0].brief.slice(host.tracking.location('issue-42', '').length))
  assert.ok(architecture.every((path) => prompt.includes(path)), prompt)
  assert.match(prompt, /never substitute working-copy architecture/)
  const manifest = JSON.parse(await host.tracking.read('issue-42', architecture[2]))
  assert.equal(manifest.mode, 'merged')
  assert.equal(manifest.sha, 'merged-sha')
  assert.deepEqual(manifest.documents.map(({ source }) => source), ['docs/architecture/stories/42-checkout.md', 'docs/adr/adr-001-checkout.md'])
  deps.architectureRepository.snapshot = async () => { throw new Error('Already bound architecture must not be reread.') }
  assert.equal((await run.prepare()).status, 'ready')
})

test('changed architecture requires native KEEP before any DISTILL handoff', async () => {
  const { host, deps, run } = architectureSession({ changed: true })
  const waiting = await run.start({ issue: 42 })
  assert.equal(waiting.status, 'waiting', waiting.reason)
  assert.deepEqual(waiting.question.options, ['KEEP', 'REDESIGN'])
  assert.equal(host.agentRunner.dispatches.length, 0)
  assert.equal((await createDecide(deps).decide({ key: waiting.question.key, answer: 'KEEP' })).ok, true)
  assert.equal((await run.prepare()).status, 'ready')
  assert.equal(host.events().find(({ type }) => type === 'question.answered').by, 'decide')
})

test('REDESIGN ends the delivery run without binding architecture or dispatching workers', async () => {
  const { host, deps, run } = architectureSession({ changed: true })
  const waiting = await run.start({ issue: 42 })
  await createDecide(deps).decide({ key: waiting.question.key, answer: 'REDESIGN' })
  assert.equal((await run.prepare()).code, 'architecture-redesign')
  assert.equal(host.events().find(({ type }) => type === 'run.finished').status, 'cancelled')
  assert.equal(host.events().some(({ type }) => type === 'architecture.bound'), false)
  assert.equal(host.agentRunner.dispatches.length, 0)
})

test('an actual delivery run refuses a rejected merged ADR before dispatch', async () => {
  const { host, run } = architectureSession({ status: 'Rejected' })
  assert.equal((await run.start({ issue: 42 })).code, 'architecture-stale')
  assert.equal(host.agentRunner.dispatches.length, 0)
})
