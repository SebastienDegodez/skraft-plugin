import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost, InMemoryGit } from '../support/in-memory-host.mjs'
import { finding, lenses, nominal, prWriter, REFS_42, says, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'
import { opening, section } from '../support/description.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const notOpened = (why) => `pull request not opened: ${why}; pull-request.md holds its description, and skraft publish opens it once that is fixed`
const lastReason = (host) => eventsOf(host, 'step.recorded').at(-1).reason

test('nothing is pushed while the forge does not say which branch is its default', async () => {
  const host = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ defaultBranch: null }) }, (it) => nominal(it))

  await host.start()

  assert.equal(lastReason(host), notOpened('the forge does not say which branch is the repository\'s default, so nothing is pushed'))
  assert.deepEqual(host.codeHost.calls, [])
})

test('a base written with one of the repository\'s remotes before it names that remote\'s branch; another prefix is part of the branch', async () => {
  for (const [ref, base] of [['upstream/main', 'main'], ['origin/develop', 'develop'], ['team/main', 'team/main']]) {
    const host = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ remotes: ['origin', 'upstream'] }), git: new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0', [ref]: 'root-0' } } } }) }, (it) => nominal(it))

    await host.start({ base: ref })

    assert.equal(host.codeHost.calls.find((call) => call.startsWith('create ')), `create ${base} <- checkout (draft): Pay by card at checkout`, ref)
  }
})

test('a closed or merged pull request of the branch is left alone: no new one is opened', async () => {
  for (const state of ['closed', 'merged']) {
    const host = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ open: [{ number: 7, head: 'checkout', state }] }) }, (it) => nominal(it))

    await host.start()

    assert.equal(lastReason(host), notOpened(`pull request #7 of checkout is ${state}, and skraft opens no other one`))
    assert.deepEqual(host.codeHost.calls, ['push checkout', 'find checkout'])
  }
})

test('a body a human edited since skraft wrote it, or skraft never wrote, is not overwritten', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it))
  await host.start()
  await host.workspace.write('skraft-config.json', JSON.stringify({ ...host.workspace.config(), publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }))
  host.codeHost.pullRequests[0].body = 'Rewritten by the reviewer.\n'
  const prose = host.events().find((event) => event.type === 'step.started' && event.step === 'pr_writer').outputs[0]
  await host.tracking.write(SLUG, prose, (await host.tracking.read(SLUG, prose)).replace('Refunds are out of scope.', 'Refunds stay out of scope.'))

  assert.deepEqual(await host.publish(), { ok: false, slug: SLUG, code: 'not-published', reason: notOpened('pull request #42 was edited since skraft last wrote its body, which stays as it is') })
  assert.equal(host.codeHost.calls.filter((call) => call.startsWith('edit ')).length, 0)

  const foreign = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ open: [{ number: 7, head: 'checkout', body: 'Opened by hand.' }] }) }, (it) => nominal(it))
  await foreign.start()
  assert.equal(lastReason(foreign), notOpened('pull request #7 was edited since skraft last wrote its body, which stays as it is'))
})

test('closing keywords, mentions and HTML an agent writes are made inert, a tag hidden inside another included; only the engine\'s own line refers to the issue', async () => {
  const what = 'Closes #12, fixes GH-3 and Resolved acme/shop#4; see fix https://github.com/acme/shop/issues/5 — thanks @alice <b>bold</b><img src=x onerror=alert(1)> <</details>/details>then<<details>details> end'
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))
  host.prWriters.push(prWriter({ what, summary: 'Pay by card, closes #9' }))
  host.agentRunner.review = lenses({ 'cold-reader': [says('cold-reader', 'pass', [finding('F1', 'low', 'ping @bob<</details>/details>, this fixes #8', { location: 'src/`odd`.cs:3' })])] })

  await host.start({ story: { issue: 42, title: 'Pay by card' } })

  const body = await host.tracking.read(SLUG, 'pull-request-body.md')
  assert.ok(body.startsWith('Closes #42\n\n'), body)
  assert.equal(section(body, 'What changes'), '`Closes #12`, `fixes GH-3` and `Resolved acme/shop#4`; see `fix https://github.com/acme/shop/issues/5` — thanks `@alice` bold then end')
  assert.equal(section(body, 'Review'), 'Findings that count:\n\n- deliver_review · cold-reader F1 (low) `` src/`odd`.cs:3 ``: ping `@bob`, this `fixes #8`')
  assert.equal(opening(body, 'Review'), '<details><summary>Review: 1 finding</summary>')
  assert.deepEqual([body.split('<details').length, body.split('</details>').length], [8, 8])
  assert.equal(host.codeHost.calls.find((call) => call.startsWith('create ')), 'create main <- checkout (draft): Pay by card, `closes #9`')
})

test('a red commit subject breaks no table: its pipes are escaped and its lines joined', async () => {
  const host = scripted({ config: CONSENTED }, (it) => [...nominal(it).slice(0, 3), async (dispatch) => {
    await nominal(it)[3](dispatch)
    const last = it.git.repositories.get('').history.at(-3)
    last.subject = 'test(checkout): pays | refunds\nand more'
  }])

  await host.start()

  assert.ok(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'RED evidence').includes('| test(checkout): pays \\| refunds and more | 1 |'))
})

test('a pr-writer that leaves a placeholder is refused, its output still missing', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it))
  host.prWriters.push(prWriter({ limitations: '{{limitations}}' }))

  await host.start()

  const refused = eventsOf(host, 'step.recorded').find(({ step }) => step === 'pr_writer')
  assert.deepEqual([refused.code, refused.missing], ['missing-outputs', [`details/2026-10-11/pull-request-prose-${SLUG}.md`]])
})

test('skraft publish finds the prose by the journal, even once the workflow no longer names the pr-writer step', async () => {
  const host = scripted({ config: CONSENTED, codeHost: new InMemoryCodeHost({ unavailable: 'gh is not signed in' }) }, (it) => nominal(it))
  await host.start()
  host.deps.workflowSource.text = host.deps.workflowSource.text.replaceAll('pr_writer', 'prose_writer')
  host.codeHost.missing = null

  assert.equal((await host.publish()).ok, true)
  assert.ok((await host.tracking.read(SLUG, 'pull-request.md')).startsWith('Pay by card at checkout\n'))
})
