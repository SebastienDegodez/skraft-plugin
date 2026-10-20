import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, scripted } from '../support/pipeline-host.mjs'

const unavailable = () => ({ ok: false, unavailable: true, text: '' })
const recorded = (host, step) => host.events().filter((event) => event.type === 'step.recorded' && event.step === step)
const verdicts = (host) => host.events().filter((event) => event.type === 'commits.checked').flatMap((event) => event.commits.map((commit) => `${commit.sha} ${commit.verdict}`))
const STORY = { issue: 42, title: 'Pay by card' }
const NOTES = '.copilot-tracking/skraft-plans/checkout/notes.md'

/** A researcher that commits the tracking notes once per body, then the run stops at DESIGN. @param {string[]} bodies */
const researchCommitting = (bodies) => scripted({}, (it) => [
  agent({ work: ({ git }) => { for (const body of bodies) git.commit('docs(checkout): research notes', [NOTES], body) } })(it),
  unavailable,
])

test('a story with an issue: commits whose body ends with Refs: #<issue>, a trailer after it or not, are accepted', async () => {
  const host = researchCommitting(['Refs: #42', 'Card payment notes.\n\nRefs: #42\nSigned-off-by: Ann <ann@example.com>', 'Refs: #42\n\nSigned-off-by: Ann <ann@example.com>\nCo-authored-by: Bob <bob@example.com>'])

  const outcome = await host.start({ story: STORY })

  assert.equal(outcome.code, 'agent-unavailable')
  assert.deepEqual(recorded(host, 'research').map((event) => [event.outcome, event.failures]), [['done', []]])
  assert.deepEqual(verdicts(host), ['root-1 ok', 'root-2 ok', 'root-3 ok'])
})

test('a story with an issue: a commit that does not end with Refs: #<issue>, closes an issue or cites another one is refused', async () => {
  const host = researchCommitting([
    '',
    'Refs: #42\nPaid at checkout: by card',
    'refs: #42',
    'Closes #42',
    'Card notes.\n\nfixes: #42\n\nRefs: #42',
    'Resolved https://github.com/acme/shop/issues/42\n\nRefs: #42',
    'Closes acme/shop#42\n\nRefs: #42',
    'Fixes GH-42\n\nRefs: #42',
    'See #43.\n\nRefs: #42',
    'Refs: #42\nRefs: GH-7',
  ])

  await host.start({ story: STORY })

  const [refused] = recorded(host, 'research')
  assert.deepEqual([refused.outcome, refused.code], ['failed', 'commit-convention'])
  const missing = (sha) => `commit ${sha} "docs(checkout): research notes" does not end its message with "Refs: #42"; make "Refs: #42" the last line of the body, before any trailer such as Signed-off-by`
  const closed = (sha) => `commit ${sha} "docs(checkout): research notes" closes an issue; a commit never closes one: end the body with "Refs: #42" and close the issue in the pull request body`
  const other = (sha) => `commit ${sha} "docs(checkout): research notes" cites an issue other than #42; cite only #42, as "Refs: #42" on the last line of the body`
  assert.deepEqual(refused.failures, [missing('root-1'), missing('root-2'), missing('root-3'), closed('root-4'), closed('root-5'), closed('root-6'), closed('root-7'), closed('root-8'), other('root-9'), other('root-10')])
  assert.deepEqual(verdicts(host), [
    'root-1 issue-reference-missing', 'root-2 issue-reference-missing', 'root-3 issue-reference-missing',
    'root-4 issue-closed', 'root-5 issue-closed', 'root-6 issue-closed', 'root-7 issue-closed', 'root-8 issue-closed', 'root-9 issue-not-in-story', 'root-10 issue-not-in-story',
  ])
})

test('a story without an issue: a commit that cites none is accepted, one that cites or references an issue is refused', async () => {
  const host = researchCommitting(['Card payment notes.\n\nSigned-off-by: Ann <ann@example.com>', 'See #7.', 'Refs: GH-7', 'Refs: none', 'From https://github.com/acme/shop/issues/7', 'Escaped &#38; entity', 'Card notes.\ncloses: the old checkout'])

  await host.start()

  const [refused] = recorded(host, 'research')
  const cited = (sha) => `commit ${sha} "docs(checkout): research notes" cites an issue, and the story has none; reference no issue in a commit`
  assert.deepEqual([refused.outcome, refused.code, refused.failures], ['failed', 'commit-convention', [cited('root-2'), cited('root-3'), cited('root-4'), cited('root-5'), cited('root-7')]])
  assert.deepEqual(verdicts(host), ['root-1 ok', 'root-2 issue-not-in-story', 'root-3 issue-not-in-story', 'root-4 issue-not-in-story', 'root-5 issue-not-in-story', 'root-6 ok', 'root-7 issue-not-in-story'])
})
