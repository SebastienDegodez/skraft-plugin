import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { agent, pipelineHost } from '../support/pipeline-host.mjs'
import { lightDesigner } from '../support/light-designer.mjs'
import { createDeliveryRun } from '../../../../plugins/skraft-deliver/engine/application/architecture/delivery-run.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-deliver/engine/application/pipeline/run-pipeline-usecase.mjs'

const BODY = 'AC-1: receipt visible.\nAC-2: receipt mailed.'

/** A delivery of story #42 whose merged base holds no architecture brief. */
const session = (options = {}) => {
  const host = pipelineHost({ slug: 'issue-42', ...options })
  const deps = { ...host.deps,
    hasher: { sha256: async (text) => createHash('sha256').update(text).digest('hex'), hmacSha256: async (key, text) => createHmac('sha256', key).update(text).digest('hex') },
    architectureForge: { read: async () => ({ ok: true, issue: { number: 42, title: 'Checkout receipt', body: BODY, story: true, forge: 'github', repository: 'shop/checkout' } }) },
    architectureRepository: { branch: async () => ({ ok: true }), snapshot: async () => ({ ok: true, sha: 'merged-sha', paths: [], read: async () => null }), unmerged: async () => ({ ok: true, found: false }) },
  }
  return { host, deps, run: createDeliveryRun(deps) }
}

const ADR = 'docs/adr/adr-001-mail-receipts.md'
const adrText = (status = 'Proposed') => `---\nstatus: ${status}\nratified_by: null\ndecision: Receipts leave the shop through the notification gateway.\n---\n\n# ADR-001: Mail receipts through the notification gateway\n\n**Status:** ${status}\n\n## Context\n\nThe shop mails nothing yet.\n`
const withAdr = { brief: { criteria: [{ id: 'AC-1', components: ['.'], adrs: [ADR] }], adrs: [ADR] }, adrs: { [ADR]: adrText() } }

test('with no merged brief, a light design runs before DISTILL: its brief binds as the story\'s architecture and leaves the branch before the pull request', async () => {
  const { host, deps, run } = session({ scenarioReviews: [{ answer: 'APPROVED' }] })
  const started = await run.start({ issue: 42 })
  assert.equal(started.status, 'ready', JSON.stringify(started))
  const plan = JSON.parse(await host.tracking.read('issue-42', 'plans/light-design.json'))
  assert.deepEqual(plan, { issue: 42, forge: 'github', repository: 'shop/checkout', bodySha256: createHash('sha256').update(BODY).digest('hex'),
    brief: 'docs/architecture/runs/issue-42/42-checkout-receipt.md', components: [{ name: 'api', root: '.', stack: 'dotnet' }] })
  host.agentRunner.behaviours.push(lightDesigner({ brief: { criteria: [{ id: 'AC-1', components: ['.'], adrs: [] }, { id: 'AC-2', components: ['.'], adrs: [] }] } })(host), agent()(host), agent()(host))
  const finished = await createRunPipeline(deps).run()
  assert.equal(finished.status, 'done', finished.reason)
  const agents = host.agentRunner.dispatches.map(({ agent: id }) => id).filter((id) => !id.endsWith('-lens') && id !== 'deliver-finding-refuter')
  assert.deepEqual(agents, ['deliver-light-designer', 'deliver-acceptance-designer', 'deliver-software-engineer', 'deliver-pr-writer'])
  // A light design with no ADR and nothing beyond a light design asks no one: the engine approves it.
  assert.equal(host.events().some(({ type, kind }) => type === 'question.asked' && kind === 'light-design-review'), false)
  const review = host.events().find(({ type, step }) => type === 'step.recorded' && step === 'light_design_review')
  assert.deepEqual([review.outcome, review.answer, review.next], ['skipped', 'APPROVED', 'distill'])
  const manifest = JSON.parse(await host.tracking.read('issue-42', 'architecture/context.json'))
  assert.equal(manifest.mode, 'light')
  assert.deepEqual(manifest.documents.map(({ source }) => source), [plan.brief])
  assert.match(await host.tracking.read('issue-42', `architecture/${plan.brief}`), /# Checkout receipt/)
  // DISTILL reads the brief through the context the light design bound, never the working copy's.
  const distill = host.agentRunner.dispatches.find(({ agent: id }) => id === 'deliver-acceptance-designer')
  const { prompt } = distill
  assert.ok(prompt.includes(`architecture/${plan.brief}`) && prompt.includes('architecture/context.json'), prompt)
  assert.match(prompt, /mode=light/)
  const retired = host.git.engineCommits.filter(({ message }) => message.startsWith('docs(issue-42): retire'))
  assert.deepEqual(retired.map(({ paths }) => paths), [[plan.brief]])
  assert.equal(host.workspace.files.has(plan.brief), false)
})

test('a light brief the engine refuses sends the light designer back with the failure before any person or DISTILL reads it', async () => {
  const { host, deps, run } = session({ answers: [{ answer: 'APPROVED' }] })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(lightDesigner({ brief: { components: ['services/api'], criteria: [{ id: 'AC-1', components: ['services/api'], adrs: [] }] }, adrs: { [ADR]: adrText() } })(host), lightDesigner(withAdr)(host), agent()(host), agent()(host))
  await createRunPipeline(deps).run()
  const visits = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'light_design')
  assert.deepEqual(visits.map(({ outcome }) => outcome), ['failed', 'done'])
  assert.ok(visits[0].failures.some((line) => line.includes('services/api: no component of this working copy has that root; cite one of .')), JSON.stringify(visits[0].failures))
  assert.ok(visits[0].failures.some((line) => line.includes(`${ADR}: cite it in the brief's adrs and in each criterion that relies on it, or delete it.`)), JSON.stringify(visits[0].failures))
  assert.equal(host.agentRunner.dispatches[2].agent, 'deliver-acceptance-designer')
})

test('a light design that writes an ADR waits for a person to ratify it; APPROVED accepts it on the delivery pull request\'s merge and DISTILL relies on it', async () => {
  const { host, deps, run } = session({ answers: [null, { answer: 'APPROVED' }], scenarioReviews: [null] })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(lightDesigner(withAdr)(host), agent()(host))
  const waiting = await createRunPipeline(deps).run()
  assert.equal(waiting.status, 'waiting', waiting.reason)
  assert.equal(waiting.code, 'light-design-review')
  const [question] = host.human.questions
  assert.deepEqual(question.options, ['APPROVED', 'REVISE', 'STOP'])
  assert.match(question.text, /The light design of #42 wrote docs\/architecture\/runs\/issue-42\/42-checkout-receipt\.md and one ADR that DISTILL and DELIVER will rely on: docs\/adr\/adr-001-mail-receipts\.md: Receipts leave the shop through the notification gateway\./)
  assert.equal(host.agentRunner.dispatches.some(({ agent: id }) => id === 'deliver-acceptance-designer'), false)
  assert.equal((await createRunPipeline(deps).run()).status, 'waiting')
  assert.match(host.workspace.files.get(ADR), /^status: Accepted$/m)
  assert.match(host.workspace.files.get(ADR), /^ratified_by: "architecture PR merge"$/m)
  assert.ok(host.git.engineCommits.some(({ message, paths }) => message.startsWith('docs(adr): accept on PR merge ADR-001') && paths.includes(ADR)))
  const manifest = JSON.parse(await host.tracking.read('issue-42', 'architecture/context.json'))
  assert.deepEqual([manifest.mode, manifest.documents.map(({ source }) => source)], ['light', ['docs/architecture/runs/issue-42/42-checkout-receipt.md', ADR]])
  assert.ok(host.agentRunner.dispatches.some(({ agent: id }) => id === 'deliver-acceptance-designer'))
})

test('REVISE sends the light design back with the person\'s corrections; STOP ends the delivery before DISTILL', async () => {
  const revised = session({ answers: [{ answer: 'REVISE', reason: 'Mail the receipt from the order context.' }, null] })
  await revised.run.start({ issue: 42 })
  revised.host.agentRunner.behaviours.push(lightDesigner(withAdr)(revised.host), lightDesigner(withAdr)(revised.host))
  await createRunPipeline(revised.deps).run()
  const again = revised.host.events().filter(({ type, step }) => type === 'step.started' && step === 'light_design')
  assert.equal(again.length, 2)
  assert.ok(again[1].feedback.some((line) => line.includes('A human read the light design and asks for these corrections: Mail the receipt from the order context.')), JSON.stringify(again[1].feedback))

  const stopped = session({ answers: [{ answer: 'STOP' }] })
  await stopped.run.start({ issue: 42 })
  stopped.host.agentRunner.behaviours.push(lightDesigner(withAdr)(stopped.host))
  const outcome = await createRunPipeline(stopped.deps).run()
  assert.equal(outcome.code, 'stopped', outcome.reason)
  assert.match(outcome.reason, /A human stopped the delivery at its light design\./)
  assert.equal(stopped.host.agentRunner.dispatches.some(({ agent: id }) => id === 'deliver-acceptance-designer'), false)
})
