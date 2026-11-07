import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { agent, scripted } from '../support/pipeline-host.mjs'
import { ADR_1, ADR_2, adrText, afterDesign, architect, eventsOf } from '../support/decisions.mjs'

const designRecords = (host) => eventsOf(host, 'step.recorded').filter((event) => event.step === 'design').map(({ visit, attempt, outcome, code, failures }) => [visit, attempt, outcome, code, failures])
const pinned = (token) => `${ADR_1} names a version (${token}): name the technology or the capability it brings; versions live in the manifests`
const codeFile = (token) => `${ADR_1} cites a code file (${token}): an ADR names the component, never the file; code moves`
const criterion = (token) => `${ADR_1} cites an acceptance criterion (${token}): an ADR states the decision, the story stays in decisions-index.md`
const ticket = (token) => `${ADR_1} cites a ticket (${token}): an ADR reads on its own, the story and its tickets stay in decisions-index.md`
const tooMany = (count) => `${ADR_1} states its decision in ${count} sentences: keep one sentence and give each independent decision its own ADR`

test('a draft ADR that pins a version, an image tag or a package is refused, one line per pin, a major written vN is none; rewritten with families, an address or a day, it passes', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ header: 'generator: skraft@1.15.3', body: 'We build on ubi8/ubi:8.9 and node:20-alpine, runtime:8.0-ubi8, digest sha256:ab12cd34, golang:1, node:18.4, ci:202610, react-router@6, release 2.1.0, SDK v3, API v2.1, postgres:16, and again 2.1.0.' }) })(it),
    architect({ [ADR_1]: adrText({ body: '## Context\n\nWe build on Red Hat UBI base images and a client-side router that loads data, in C# on System.IO and in TypeScript on Node.js with DependencyInjection.cs &#35;. Events go through kafka:9092 and postgres:5432, the health check is http://localhost:8080/health, the probe http://dev:8/ping, the docs are at localhost:3000/docs (see /v1/orders) and https://example.com/guide/setup.html. The API listens on 127.0.0.1:3917 and 10.0.0.12 since 2026.11.07 and 2026/11/08, and keeps API v1 stable.' }) })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [pinned('ubi8/ubi:8.9'), pinned('node:20-alpine'), pinned('runtime:8.0-ubi8'), pinned('sha256:ab12cd34'), pinned('golang:1'), pinned('node:18.4'), pinned('ci:202610'), pinned('react-router@6'), pinned('2.1.0'), pinned('postgres:16')]],
    [1, 2, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a draft ADR that cites a code file is refused once per file and never read as a version; naming the component passes', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ body: 'The store is registered in api/src/Mastermind.Infrastructure/DependencyInjection.cs:9 and called from web/src/palette/infrastructure/HttpPaletteGateway.ts:8-12, see Order.cs:120, #file:src/Domain/Order.cs and src/Domain/Order.cs, web\\src\\app\\App.tsx, again Order.cs:120.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: 'We keep the game state in web/src/state.ts.' }) })(it),
    architect({ [ADR_1]: adrText({ body: 'The store is registered by the infrastructure layer of the API and called from the palette gateway of the web client.' }) })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [codeFile('api/src/Mastermind.Infrastructure/DependencyInjection.cs:9'), codeFile('web/src/palette/infrastructure/HttpPaletteGateway.ts:8-12'), codeFile('Order.cs:120'), codeFile('#file:src/Domain/Order.cs'), codeFile('src/Domain/Order.cs'), codeFile('web\\src\\app\\App.tsx')]],
    [1, 2, 'failed', 'adr-lifecycle', [codeFile('web/src/state.ts')]],
    [1, 3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

test('a draft ADR that cites an acceptance criterion by its identifier or a ticket is refused, in the body or the decision; its title line and the words acceptance criteria are not read', async () => {
  const host = scripted({ answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ body: 'This meets AC-2, AC 3 and ac4, for #81 and AB#1234, see https://github.com/o/r/issues/12, https://github.com/o/r/pull/34 and https://dev.azure.com/o/p/_workitems/edit/56, again #81.' }) })(it),
    architect({ [ADR_1]: adrText({ decision: 'We will pay by card to meet AC-2 of https://github.com/o/r/issues/8.' }) })(it),
    architect({ [ADR_1]: adrText({ title: 'Card payment for #8 in src/pay/card.ts', body: 'The acceptance criteria are checked by Gherkin scenarios; each acceptance criterion and critère d\'acceptation stays in the story.' }) })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [criterion('AC-2'), criterion('AC 3'), criterion('ac4'), ticket('#81'), ticket('AB#1234'), ticket('https://github.com/o/r/issues/12'), ticket('https://github.com/o/r/pull/34'), ticket('https://dev.azure.com/o/p/_workitems/edit/56')]],
    [1, 2, 'failed', 'adr-lifecycle', [criterion('AC-2'), ticket('https://github.com/o/r/issues/8')]],
    [1, 3, 'done', null, []],
  ])
  assert.equal(outcome.status, 'done')
})

const citesAdr = (path, token) => `${path} cites ${token} outside its Supersedes/Amends line: an ADR names only the ADR it replaces; any other ADR may be superseded`

test('a draft ADR names no other ADR, by id, link or path, in its body or decision; its own number, its Supersedes and Amends lines and its header links pass', async () => {
  const third = 'docs/adr/adr-003-refunds.md'
  const tokens = adrText({ number: 2, title: 'Card tokens', header: 'amends: ADR-003', body: '**Supersedes:** [ADR-001](./adr-001-card-payment.md)\n**Amends:** ADR-003\n\n## Context\n\nADR-002 keeps card tokens with the provider, as [ADR-004](./adr-004-wallets.md) and ADR-005 did; see docs/adr/adr-006-cash.md, ../adr/adr-009-queue.md, [cash](adr-007-cash.md) and #file:docs/adr/decisions-index.md, again ADR-005.' }).replace('supersedes: null', 'supersedes: ADR-001')
  const git = new InMemoryGit({ published: [ADR_1, third] })
  const host = scripted({ git, files: { [ADR_1]: adrText({ status: 'Accepted' }), [third]: adrText({ number: 3, title: 'Refunds', status: 'Accepted' }) }, answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_2]: tokens, 'docs/adr/supersessions.md': '| date | superseded ADR | new ADR | reason |\n| --- | --- | --- | --- |\n| 2026-10-11 | ADR-001 | ADR-002 | token choice |\n' })(it),
    architect({ [ADR_2]: tokens.replace('decision: We will pay by card.', 'decision: We keep tokens with the provider, unlike ADR-008.') })(it),
    architect({ [ADR_2]: tokens.replace(/## Context[\s\S]*$/, '## Context\n\nADR-002 keeps card tokens with the provider.\n') })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  const first = [citesAdr(ADR_2, 'ADR-004'), citesAdr(ADR_2, 'ADR-005'), citesAdr(ADR_2, 'docs/adr/adr-006-cash.md'), citesAdr(ADR_2, '../adr/adr-009-queue.md'), citesAdr(ADR_2, '#file:docs/adr/decisions-index.md'), citesAdr(ADR_2, 'adr-007-cash.md')]
  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', first],
    [1, 2, 'failed', 'adr-lifecycle', [citesAdr(ADR_2, 'ADR-004'), citesAdr(ADR_2, 'ADR-005'), citesAdr(ADR_2, 'ADR-008'), ...first.slice(2)]],
    [1, 3, 'done', null, []],
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

test('an Accepted ADR on the default branch may become Deprecated or Superseded by its successor, linked or not', async () => {
  for (const status of ['Deprecated', 'Superseded by ADR-002', 'Superseded by [ADR-002](./adr-002-card-tokens.md)']) {
    const git = new InMemoryGit({ published: [ADR_1] })
    git.holds('root-0', { [ADR_1]: adrText({ status: 'Accepted' }) })
    const host = scripted({ git, files: { [ADR_1]: adrText({ status: 'Accepted' }) } }, (it) => [agent()(it), architect({ [ADR_1]: adrText({ status }) })(it), unavailable])

    await host.start()

    assert.deepEqual(designRecords(host), [[1, 1, 'done', null, []]])
  }
})

const moved = (from, to) => `${ADR_1} is on the default branch with the status "${from}" and was given "${to}": an Accepted ADR becomes only Superseded by ADR-NNN or Deprecated; any other status stays`

test('an ADR on the default branch keeps its lifecycle: Accepted goes nowhere else, Rejected, Deprecated and Superseded stay; the header may say Superseded alone', async () => {
  const cases = [
    ['Accepted', adrText({ status: 'Proposed' }), [moved('Accepted', 'Proposed')]],
    ['Accepted', adrText({ status: 'Rejected' }), [moved('Accepted', 'Rejected')]],
    ['Accepted', adrText({ status: 'Superseded' }), [moved('Accepted', 'Superseded')]],
    ['Accepted', adrText({ status: 'Superseded by ADR-002' }).replace('status: Superseded by ADR-002', 'status: Superseded'), []],
    ['Accepted', adrText({ status: 'Accepted' }).replace('**Status:** Accepted', '**Status:** Deprecated'), []],
    ['Rejected', adrText({ status: 'Accepted' }), [moved('Rejected', 'Accepted')]],
    ['Deprecated', adrText({ status: 'Superseded by ADR-002' }), [moved('Deprecated', 'Superseded by ADR-002')]],
    ['Superseded by ADR-002', adrText({ status: 'Deprecated' }), [moved('Superseded by ADR-002', 'Deprecated')]],
    ['Rejected', adrText({ status: 'Rejected' }), []],
  ]
  for (const [from, text, problems] of cases) {
    const git = new InMemoryGit({ published: [ADR_1] })
    git.holds('root-0', { [ADR_1]: adrText({ status: from }) })
    const host = scripted({ git, files: { [ADR_1]: adrText({ status: from }) } }, (it) => [agent()(it), architect({ [ADR_1]: text })(it), unavailable])

    await host.start()

    assert.deepEqual(designRecords(host)[0].slice(2), problems.length === 0 ? ['done', null, []] : ['failed', 'adr-lifecycle', problems], `${from} -> ${text.match(/\*\*Status:\*\* .*/)[0]}`)
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
