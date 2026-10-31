import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { agent, scripted } from '../support/pipeline-host.mjs'
import { ADR_1, adrText, afterDesign, architect, eventsOf } from '../support/decisions.mjs'

const designRecords = (host) => eventsOf(host, 'step.recorded').filter((event) => event.step === 'design').map(({ visit, attempt, outcome, code, failures }) => [visit, attempt, outcome, code, failures])
const pinned = (token) => `${ADR_1} names a version (${token}): name the technology or the capability it brings; versions live in the manifests`
const tooMany = (count) => `${ADR_1} states its decision in ${count} sentences: keep one sentence and give each independent decision its own ADR`

test('a draft ADR that pins a version, an image tag or a package is refused, one line per pin; rewritten with families it passes', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ header: 'generator: skraft@1.15.3', body: 'We build on ubi8/ubi:8.9 and node:20-alpine, runtime:8.0-ubi8, digest sha256:ab12cd34, golang:1, node:18.4, ci:202610, react-router@6, release 2.1.0, SDK v3, API v2.1, and again 2.1.0.' }) })(it),
    architect({ [ADR_1]: adrText({ body: 'We build on Red Hat UBI base images and a client-side router that loads data. Events go through kafka:9092 and postgres:5432, the health check is http://localhost:8080/health, the probe http://dev:8/ping, the docs are at localhost:3000/docs (see /v1/orders).' }) })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [pinned('ubi8/ubi:8.9'), pinned('node:20-alpine'), pinned('runtime:8.0-ubi8'), pinned('sha256:ab12cd34'), pinned('golang:1'), pinned('node:18.4'), pinned('ci:202610'), pinned('react-router@6'), pinned('2.1.0'), pinned('v3'), pinned('v2.1')]],
    [1, 2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('the decision header of a draft ADR holds one sentence: a missing one and a two-sentence one are refused, a quoted one-sentence one with a comment passes', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ decision: null }) })(it),
    architect({ [ADR_1]: adrText({ decision: 'We will pay by card. Tokens are kept by the provider.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: '"We will pay by card (e.g. through Stripe), tokens kept by the provider."  # One sentence. Not two.' }) })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [`${ADR_1} has no decision in its header: state it in one sentence`]],
    [1, 2, 'failed', 'adr-lifecycle', [tooMany(2)]],
    [1, 3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a version in the decision header is refused like one in the body: a runtime release, an image tag', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ decision: 'We pin Node 20.11.1 for builds.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: 'Build on ubi8/ubi:8.9.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: 'We build on a Node runtime.' }) })(it),
    ...afterDesign(it),
  ])

  await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [pinned('20.11.1')]],
    [1, 2, 'failed', 'adr-lifecycle', [pinned('ubi8/ubi:8.9')]],
    [1, 3, 'done', null, []],
  ])
})

test('an abbreviation or a code span does not end the sentence of a decision, a full stop before a capital does', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ decision: 'We pay by card. We keep cash.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: 'We use C# only. Second sentence is here. A third one follows.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: 'Use a broker, e.g. Kafka, i.e. Pulsar, vs. RabbitMQ, etc. Kafka, cf. Pulsar, for `Order.Placed. Event` streams.' }) })(it),
    ...afterDesign(it),
  ])

  await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [tooMany(2)]],
    [1, 2, 'failed', 'adr-lifecycle', [tooMany(3)]],
    [1, 3, 'done', null, []],
  ])
})

test('a draft ADR whose decision block is empty has no decision', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ decision: '>' }) })(it),
    architect({ [ADR_1]: adrText() })(it),
    ...afterDesign(it),
  ])

  await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [`${ADR_1} has no decision in its header: state it in one sentence`]],
    [1, 2, 'done', null, []],
  ])
})

test('a decision written as a folded or literal block is read whole: two sentences are refused in either, one passes', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ decision: '>-\n  We will pay by card.\n  Tokens are kept by the provider.\n  Refunds go back to the card.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: '|\n  We will pay by card.\n  Tokens are kept by the provider.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: '>-\n  We will pay by card,\n  tokens kept by the provider.' }) })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [tooMany(3)]],
    [1, 2, 'failed', 'adr-lifecycle', [tooMany(2)]],
    [1, 3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

const badStatus = (value) => `${ADR_1} has the status "${value}": use Proposed, Accepted, Rejected, Deprecated or Superseded by ADR-NNN; a partial replacement is a new ADR that amends it`
const unavailable = () => ({ ok: false, unavailable: true, text: '' })

test('a draft ADR with a status that is Proposed plus a remark is refused once, whether the header, the Status line or both carry it', async () => {
  const both = adrText({ status: 'Proposed (draft)' })
  const variants = [
    both,
    adrText().replace('status: Proposed', 'status: Proposed (draft)'),
    adrText().replace('**Status:** Proposed', '**Status:** Proposed (draft)'),
    both.replace(/\*\*Status:\*\*.*\n/, ''),
    both.replace(/^status:.*\n/m, ''),
  ]
  for (const text of variants) {
    const host = scripted({}, (it) => [agent()(it), architect({ [ADR_1]: text })(it), unavailable])

    await host.start()

    assert.deepEqual(designRecords(host)[0].slice(2), ['failed', 'adr-lifecycle', [badStatus('Proposed (draft)')]])
  }
})

test('an ADR on the default branch may take any status of the closed set, a supersession linked or not', async () => {
  for (const status of ['Deprecated', 'Rejected', 'Superseded', 'Superseded by ADR-002', 'Superseded by [ADR-002](./adr-002-card-tokens.md)']) {
    const git = new InMemoryGit({ published: [ADR_1] })
    git.holds('root-0', { [ADR_1]: adrText({ status: 'Accepted' }) })
    const host = scripted({ git, files: { [ADR_1]: adrText({ status: 'Accepted' }) } }, (it) => [agent()(it), architect({ [ADR_1]: adrText({ status }) })(it), unavailable])

    await host.start()

    assert.deepEqual(designRecords(host), [[1, 1, 'done', null, []]])
  }
})

test('an ADR on the default branch with a status outside the closed English set is refused: a partial supersession, another language', async () => {
  for (const status of ['Superseded (partiel)', 'Accepté', 'Not Accepted']) {
    const git = new InMemoryGit({ published: [ADR_1] })
    git.holds('root-0', { [ADR_1]: adrText({ status: 'Accepted' }) })
    const host = scripted({ git, files: { [ADR_1]: adrText({ status: 'Accepted' }) } }, (it) => [agent()(it), architect({ [ADR_1]: adrText({ status }) })(it), unavailable])

    await host.start()

    assert.deepEqual(designRecords(host)[0].slice(2), ['failed', 'adr-lifecycle', [badStatus(status)]])
  }
})
