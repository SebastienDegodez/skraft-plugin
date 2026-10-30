import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { agent, scripted, SLUG } from '../support/pipeline-host.mjs'
import { ADR_1, ADR_2, adrText, afterDesign, architect, eventsOf, INDEX, indexFor, UNLISTABLE_ADRS, waitingOnEnvironment } from '../support/decisions.mjs'

const REASON = 'tokens belong in ADR-001'
const designRecords = (host) => eventsOf(host, 'step.recorded').filter((event) => event.step === 'design').map(({ visit, attempt, outcome, code, failures }) => [visit, attempt, outcome, code, failures])
const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const heldOnDefaultBranch = (text) => {
  const git = new InMemoryGit({ published: [ADR_1] })
  git.holds('root-0', { [ADR_1]: text })
  return git
}

test('an ADR not on the default branch that a new ADR supersedes is refused; edited in place and Proposed again, it is asked again', async () => {
  const tokens = adrText({ number: 2, title: 'Card tokens' })
  const host = scripted({ answers: [{ answer: 'REJECTED', reason: REASON }, { answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText(), [ADR_2]: tokens })(it),
    architect({ [ADR_2]: tokens.replace('supersedes: null', 'supersedes: ADR-001') })(it),
    architect({ [ADR_1]: adrText({ title: 'Card payment with tokens' }), [ADR_2]: tokens })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(designRecords(host), [
    [1, 1, 'done', null, []],
    [2, 1, 'failed', 'adr-lifecycle', [`${ADR_2} supersedes ADR-001, which is not on the default branch yet: edit ${ADR_1} in place instead`]],
    [2, 2, 'done', null, []],
  ])
  assert.deepEqual(host.human.questions.map((question) => question.key), ['adr-1', 'adr-2'])
  assert.match(await host.workspace.read(ADR_1), /^title: Card payment with tokens\nstatus: Accepted$/m)
})

test('an ADR folder the machine cannot list while DESIGN is checked asks the human to fix it; RETRY checks it again without running the architect', async () => {
  const why = 'git ls-files failed: fatal: index file corrupt'
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ git, workspace }) => {
      workspace.files.set(ADR_1, adrText())
      workspace.files.set(INDEX, indexFor(1))
      git.commit('docs(checkout): decide the card payment', [ADR_1, INDEX])
      workspace.unlistable.set('docs/adr', why)
    } })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: waitingOnEnvironment('design', UNLISTABLE_ADRS) })
  assert.deepEqual(designRecords(host), [])
  host.workspace.unlistable.clear()
  assert.equal((await host.decide({ answer: 'RETRY' })).ok, true)
  assert.equal((await host.run()).code, 'adr-ratification')
  assert.deepEqual(designRecords(host), [[1, 1, 'done', null, []]])
  assert.equal(host.agentRunner.dispatches.length, 2)
})

test('an ADR ratified in this run and changed again must go back to Proposed before DESIGN can pass', async () => {
  const ratified = adrText({ status: 'Accepted' })
  const host = scripted({ files: { [ADR_1]: ratified }, answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: ratified.replace('Card payment', 'Card payment by Stripe') })(it),
    architect({ [ADR_1]: adrText({ title: 'Card payment by Stripe' }) })(it),
    ...afterDesign(it),
  ])
  host.git.change(ADR_1)

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(designRecords(host), [
    [1, 1, 'failed', 'adr-lifecycle', [`${ADR_1} is not on the default branch yet and was changed: set its status back to Proposed; the engine asks for its ratification again`]],
    [1, 2, 'done', null, []],
  ])
  assert.equal(host.human.questions.length, 1)
})

test('an unpublished ADR keeps no draft history: amended_in_place, amended_by or a history section are refused', async () => {
  const host = scripted({}, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ header: 'amended_in_place: true\namended_by: ADR-002', body: '## Historique\n\n- first draft: Stripe' }) })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(designRecords(host), [[1, 1, 'failed', 'adr-lifecycle', [
    `${ADR_1} is not on the default branch yet: drop amended_by and edit it in place`,
    `${ADR_1} is not on the default branch yet: drop amended_in_place and edit it in place`,
    `${ADR_1} is not on the default branch yet: drop its history section; git keeps the drafts`,
  ]]])
})

test('a draft ADR carries no erratum, amendment, changelog or revision section either, at any heading depth', async () => {
  for (const heading of ['## Erratum', '## Errata', '### Amendments', '## Amendment', '## Changelog', '## Revisions', '### Revision', '## Historic']) {
    const host = scripted({}, (it) => [agent()(it), architect({ [ADR_1]: adrText({ body: `${heading}\n\n- first draft: Stripe` }) })(it), unavailable])

    await host.start()

    assert.deepEqual(designRecords(host)[0].slice(2), ['failed', 'adr-lifecycle', [`${ADR_1} is not on the default branch yet: drop its history section; git keeps the drafts`]])
  }
})

test('a draft ADR may carry a section that only starts like a history one', async () => {
  const host = scripted({}, (it) => [agent()(it), architect({ [ADR_1]: adrText({ body: '## Revisionist alternatives\n\n- keep the legacy flow\n\n##Changelog stays text' }) })(it), unavailable])

  await host.start()

  assert.deepEqual(designRecords(host), [[1, 1, 'done', null, []]])
})

test('an architect never ratifies: a new ADR written Accepted is refused', async () => {
  const host = scripted({}, (it) => [agent()(it), architect({ [ADR_1]: adrText({ status: 'Accepted' }) })(it), unavailable])

  await host.start()

  assert.equal(designRecords(host)[0][3], 'adr-lifecycle')
})

test('an ADR on the default branch is still superseded the usual way: a new ADR and its status line', async () => {
  const git = new InMemoryGit({ published: [ADR_1] })
  git.holds('root-0', { [ADR_1]: adrText({ status: 'Accepted' }) })
  const superseded = adrText({ status: 'Superseded' }).replace('**Status:** Superseded', '**Status:** Superseded by ADR-002').replace('supersedes: null', 'supersedes: null\nsuperseded_by: ADR-002')
  const host = scripted({ git, files: { [ADR_1]: adrText({ status: 'Accepted' }) }, answers: [{ answer: 'RATIFIED' }] }, (it) => [
    agent()(it),
    architect({ [ADR_1]: superseded, [ADR_2]: adrText({ number: 2, title: 'Card tokens' }).replace('supersedes: null', 'supersedes: ADR-001') })(it),
    ...afterDesign(it),
  ])

  const outcome = await host.start()

  assert.equal(outcome.status, 'done')
  assert.deepEqual(designRecords(host), [[1, 1, 'done', null, []]])
  assert.deepEqual(host.human.questions.map((question) => question.text.split('?')[0]), [`Ratify the Proposed ADRs ${ADR_2}`])
  assert.equal(await host.workspace.read(ADR_1), superseded)
})

test('an ADR on the default branch changed beyond its status lines, or deleted, is refused', async () => {
  const accepted = adrText({ status: 'Accepted' })
  const edited = scripted({ git: heldOnDefaultBranch(accepted), files: { [ADR_1]: accepted } }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ status: 'Accepted', body: '## Erratum\n\nThe provider is Stripe.' }) })(it),
    unavailable,
  ])
  await edited.start()
  assert.deepEqual(designRecords(edited)[0].slice(2), ['failed', 'adr-lifecycle', [`${ADR_1} is on the default branch: change only its status lines; write a new ADR that supersedes or amends it`]])

  const deleted = scripted({ git: heldOnDefaultBranch(accepted), files: { [ADR_1]: accepted } }, (it) => [
    agent()(it),
    agent({ work: ({ git, workspace }) => {
      workspace.files.delete(ADR_1)
      git.commit('docs(checkout): drop the card payment decision', [ADR_1])
    } })(it),
    unavailable,
  ])
  await deleted.start()
  assert.deepEqual(designRecords(deleted)[0].slice(2), ['failed', 'adr-lifecycle', [`${ADR_1} is on the default branch and was deleted: restore it; an ADR is never deleted`]])
})

test('an ADR on the default branch saved with Windows line endings and a new status is not a change beyond its status lines', async () => {
  const accepted = adrText({ status: 'Accepted' })
  const host = scripted({ git: heldOnDefaultBranch(accepted), files: { [ADR_1]: accepted } }, (it) => [
    agent()(it),
    architect({ [ADR_1]: adrText({ status: 'Deprecated' }).replaceAll('\n', '\r\n') })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(designRecords(host), [[1, 1, 'done', null, []]])
})

test('a draft ADR the attempt wrote and deleted again is no ADR to judge', async () => {
  const host = scripted({}, (it) => [
    agent()(it),
    agent({ work: ({ git, workspace }) => {
      workspace.files.set(ADR_1, adrText({ decision: null }))
      git.commit('docs(checkout): decide the card payment', [ADR_1])
      workspace.files.delete(ADR_1)
      git.commit('docs(checkout): drop the card payment decision', [ADR_1])
    } })(it),
    unavailable,
  ])

  await host.start()

  assert.deepEqual(designRecords(host), [[1, 1, 'done', null, []]])
})

test('an ADR on the default branch that Git cannot read at the run base asks the human to fix the machine', async () => {
  const accepted = adrText({ status: 'Accepted' })
  const git = new InMemoryGit({ published: [ADR_1] })
  const host = scripted({ git, files: { [ADR_1]: accepted } }, (it) => [agent()(it), architect({ [ADR_1]: adrText({ status: 'Superseded' }) })(it), unavailable])

  const outcome = await host.start()

  assert.deepEqual(outcome, { status: 'waiting', slug: SLUG, phase: 'DESIGN', code: 'environment', reason: waitingOnEnvironment('design', 'Git cannot read docs/adr/adr-001-card-payment.md at root-0') })
})

test('an amendment of an ADR on the default branch is allowed; one of an unpublished ADR is refused', async () => {
  const git = new InMemoryGit({ published: [ADR_1] })
  const amending = adrText({ number: 2, title: 'Card tokens', header: 'amends: ADR-001' })
  const allowed = scripted({ git, files: { [ADR_1]: adrText({ status: 'Accepted' }) } }, (it) => [agent()(it), architect({ [ADR_2]: amending })(it)])
  await allowed.start()
  assert.deepEqual(designRecords(allowed), [[1, 1, 'done', null, []]])

  const refused = scripted({ files: { [ADR_1]: adrText({ status: 'Accepted' }), [INDEX]: indexFor(1) } }, (it) => [agent()(it), architect({ [ADR_2]: amending })(it), unavailable])
  refused.git.change(ADR_1)
  await refused.start()
  assert.deepEqual(designRecords(refused)[0][4], [`${ADR_2} amends ADR-001, which is not on the default branch yet: edit ${ADR_1} in place instead`])
})

test('a supersession written as a **Supersedes:** line is judged as the header one: refused for an unpublished ADR, once, and allowed for a published one', async () => {
  const line = '**Supersedes:** [ADR-001](./adr-001-card-payment.md)'
  const registry = { 'docs/adr/supersessions.md': '| date | superseded ADR | new ADR | reason |\n| --- | --- | --- | --- |\n| 2026-10-11 | ADR-001 | ADR-002 | token choice |\n' }
  const tokens = adrText({ number: 2, title: 'Card tokens', body: line })
  const refusal = [`${ADR_2} supersedes ADR-001, which is not on the default branch yet: edit ${ADR_1} in place instead`]

  const refused = scripted({ files: { [ADR_1]: adrText() } }, (it) => [agent()(it), architect({ [ADR_2]: tokens, ...registry })(it), unavailable])
  await refused.start()
  assert.deepEqual(designRecords(refused)[0][4], refusal)

  const both = scripted({ files: { [ADR_1]: adrText() } }, (it) => [agent()(it), architect({ [ADR_2]: tokens.replace('supersedes: null', 'supersedes: ADR-001'), ...registry })(it), unavailable])
  await both.start()
  assert.deepEqual(designRecords(both)[0][4], refusal)

  const third = 'docs/adr/adr-003-refunds.md'
  const two = scripted({ files: { [ADR_1]: adrText(), [third]: adrText({ number: 3, title: 'Refunds' }) } }, (it) => [
    agent()(it),
    architect({ [ADR_2]: tokens.replace('supersedes: null', 'supersedes: ADR-003'), 'docs/adr/supersessions.md': `${registry['docs/adr/supersessions.md']}| 2026-10-11 | ADR-003 | ADR-002 | refunds |\n` })(it),
    unavailable,
  ])
  await two.start()
  assert.deepEqual(designRecords(two)[0][4], [
    `${ADR_2} supersedes ADR-003, which is not on the default branch yet: edit ${third} in place instead`,
    ...refusal,
  ])

  const allowed = scripted({ git: new InMemoryGit({ published: [ADR_1] }), files: { [ADR_1]: adrText({ status: 'Accepted' }) } }, (it) => [agent()(it), architect({ [ADR_2]: tokens, ...registry })(it)])
  await allowed.start()
  assert.deepEqual(designRecords(allowed), [[1, 1, 'done', null, []]])
})

test('a link names an ADR by ADR-NNN or its number, inline or as a YAML list; a date is no link', async () => {
  const git = new InMemoryGit({ published: [ADR_1] })
  const tenth = 'docs/adr/adr-010-refunds.md'
  const dated = adrText({ number: 2, title: 'Card tokens' }).replace('supersedes: null', 'supersedes: ADR-001 (2026-10-10)')
  const allowed = scripted({ git, files: { [ADR_1]: adrText({ status: 'Accepted' }), [tenth]: adrText({ number: 10, title: 'Refunds' }), [INDEX]: indexFor(10) } }, (it) => [agent()(it), architect({ [ADR_2]: dated })(it)])
  allowed.git.change(tenth)
  await allowed.start()
  assert.deepEqual(designRecords(allowed), [[1, 1, 'done', null, []]])

  const listed = adrText({ number: 2, title: 'Card tokens' }).replace('supersedes: null', 'supersedes:\n  - ADR-010 # refunds')
  const refused = scripted({ git: new InMemoryGit({ published: [ADR_1] }), files: { [tenth]: adrText({ number: 10, title: 'Refunds' }), [INDEX]: indexFor(10) } }, (it) => [agent()(it), architect({ [ADR_2]: listed })(it), unavailable])
  refused.git.change(tenth)
  await refused.start()
  assert.deepEqual(designRecords(refused)[0][4], [`${ADR_2} supersedes ADR-010, which is not on the default branch yet: edit ${tenth} in place instead`])
})
