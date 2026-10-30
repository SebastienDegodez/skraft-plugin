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
  assert.deepEqual([body.split('<details').length, body.split('</details>').length], [9, 9])
  assert.equal(host.codeHost.calls.find((call) => call.startsWith('create ')), 'create main <- checkout (draft): Pay by card, `closes #9`')
})

test('a test plan and a consistency matrix an agent wrote are shown inert: no comment, tag, heading or code block of theirs breaks the description', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))
  await host.start({ story: { issue: 42, title: 'Pay by card' } })
  await host.tracking.write(SLUG, 'details/2026-10-11/test-plan-checkout.md', [
    '<!-- markdownlint-disable-file -->',
    '# Test plan — checkout',
    '',
    '| Criterion | Scenario | Test |',
    '| --- | --- | --- |',
    '| AC1 | Pays by card | `CheckoutTests.PaysByCard` |',
    '</details>',
    '## Not a section of the pull request',
    'Fixes #7 <img src=x onerror=alert(1)>for @alice, <details',
    '```text',
    'a code block left open',
  ].join('\n'))
  await host.tracking.write(SLUG, 'details/2026-10-11/consistency-matrix-checkout.md', '| ADR | Verdict |\n| --- | --- |\n| ADR-001 | <b>kept</b> |\n- consistency-gate: PASS\n<!-- left open\n## Swallowed\n')

  await host.publish()

  const body = await host.tracking.read(SLUG, 'pull-request-body.md')
  assert.equal(section(body, 'Tests'), [
    'From `details/2026-10-11/test-plan-checkout.md` in the tracking folder:',
    '',
    '#### Test plan — checkout',
    '',
    '| Criterion | Scenario | Test |',
    '| --- | --- | --- |',
    '| AC1 | Pays by card | `CheckoutTests.PaysByCard` |',
    '',
    '#### Not a section of the pull request',
    '``Fixes #7`` for ``@alice``, &lt;details',
  ].join('\n'))
  assert.equal(section(body, 'Consistency matrix'), 'From `details/2026-10-11/consistency-matrix-checkout.md` in the tracking folder:\n\n| ADR | Verdict |\n| --- | --- |\n| ADR-001 | kept |\n- consistency-gate: PASS')
  assert.equal(opening(body, 'RED evidence'), '<details><summary>RED evidence: 2 red commits</summary>')
  assert.deepEqual([body.split('<details').length, body.split('</details>').length, body.includes('<!--')], [9, 9, false])
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

const PLAN = 'details/2026-10-11/test-plan-checkout.md'

/** The Tests section of the description of a run whose test plan holds the text; every <details> block stays closed. */
const testsOf = async (plan) => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))
  await host.start({ story: { issue: 42, title: 'Pay by card' } })
  await host.tracking.write(SLUG, PLAN, plan)
  await host.publish()
  const body = await host.tracking.read(SLUG, 'pull-request-body.md')
  assert.deepEqual([body.split('<details').length, body.split('</details>').length], [9, 9], body)
  return section(body, 'Tests').replace(`From \`${PLAN}\` in the tracking folder:\n\n`, '')
}

test('a backtick in the info string makes no code fence, as GitHub reads it: nothing opens, nothing is closed for it', async () => {
  assert.equal(await testsOf('```a`b\ncode'), '```a`b\ncode')
  assert.equal(await testsOf('```a`b\nfoo\n```\nrest'), '```a`b\nfoo')
})

test('a code fence an agent leaves open is dropped with what follows it, never closed by the engine; one in a list item makes no fence', async () => {
  assert.equal(await testsOf('Steps\n```text\ncode\n</details>'), 'Steps')
  assert.equal(await testsOf('1. step\n   ```text\n   code'), '1. step\n   \\```text\n   code')
  assert.equal(await testsOf('1. step\n   ```text\n   code\n```\nMore'), '1. step\n   \\```text\n   code')
  assert.equal(await testsOf('~~~\nkept\n  ~~~\nafter'), '~~~\nkept\n  ~~~\nafter')
})

test('C# generics, shell comments and comparisons inside a code block are shown as written; anywhere else they are tags and headings', async () => {
  const plan = ['Returns `Result<Order>` and Result<Order>, a <b', 'c> tag.', '```bash', '# install', 'dotnet add package X<y', '```', '# Heading'].join('\n')
  assert.equal(await testsOf(plan), ['Returns `Result` and Result, a &lt;b', 'c> tag.', '```bash', '# install', 'dotnet add package X<y', '```', '#### Heading'].join('\n'))
})

test('a bare issue reference of an agent\'s file, a task item included, is a code span: it links no issue, an agent\'s own span included', async () => {
  const plan = '- [ ] #12 done\nsee #7 and acme/shop#4, `#9` and &#39;, not C#\n```\n#8\n```'
  assert.equal(await testsOf(plan), '- [ ] ``#12`` done\nsee ``#7`` and ``acme/shop#4``, ` ``#9`` ` and &#39;, not C#\n```\n#8\n```')
})

test('a code span that a table row cuts in two shelters nothing: its closing keyword, mention and tags are made inert', async () => {
  assert.equal(await testsOf('| `a | Closes #12 | @alice b` |'), '| `a | ``Closes #12`` | ``@alice`` b` |')
  assert.equal(await testsOf('| `x | </details><h1>Hijack</h1><details><summary>y` |'), '| `x | Hijacky` |')
})

test('a backslash before a reference of the agent cannot escape the backtick that opens the engine\'s span', async () => {
  assert.equal(await testsOf('x \\Closes #8 and \\@dave and \\#10'), 'x \\ `Closes #8` and \\ `@dave` and \\ `#10`')
})

test('a reference the engine puts in a code span never pairs with a backtick of the agent: its span is longer than any run of theirs and set apart from an adjacent one', async () => {
  assert.equal(await testsOf('``Closes #1'), '`` `Closes #1`')
  assert.equal(await testsOf('`start\n</details>\nend` Closes #9'), '`start\n\nend` ``Closes #9``')
})
