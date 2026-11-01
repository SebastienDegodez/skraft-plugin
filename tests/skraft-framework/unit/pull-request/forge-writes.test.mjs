import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost, InMemoryGit } from '../support/in-memory-host.mjs'
import { nominal, REFS_42, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const notOpened = (why) => `pull request not opened: ${why}; pull-request.md holds its description, and skraft publish opens it once that is fixed`

/** GitHub's forge, or Azure DevOps' with its limits, its link and its pages: the same guarantees on both. */
const FORGES = {
  github: (more = {}) => new InMemoryCodeHost(more),
  'azure-devops': (more = {}) => new InMemoryCodeHost({ bodyLimit: 4_000, commentLimit: 140_000, takesRequestFile: true, link: (issue, closes) => `${closes ? 'Fixes ' : ''}#${issue}`, pages: 'https://dev.azure.com/acme/Shop%20Team/_git/payment', repository: null, ...more }),
}
const REMOTES = { github: undefined, 'azure-devops': 'https://dev.azure.com/acme/Shop%20Team/_git/payment' }

/** A run from issue 42 on that forge, consented, its forge double as given. */
const runOn = async (forge, more = {}, story = STORY) => {
  const codeHost = FORGES[forge](more)
  const host = scripted({ config: CONSENTED, codeHost, forge, ...(REMOTES[forge] ? { git: new InMemoryGit({ remote: REMOTES[forge] }) } : {}) }, (it) => nominal(it, REFS_42))
  const outcome = await host.start(story)
  return { host, outcome }
}

/** The writes journaled: what, on what, how it ended, why. */
const writes = (host) => eventsOf(host, 'forge.write').map(({ write, subject, outcome, reason }) => [write, subject, outcome, reason])
const lastReason = (host) => eventsOf(host, 'step.recorded').at(-1).reason

for (const forge of Object.keys(FORGES)) {
  test(`${forge}: each write the forge shows when read back is journaled applied, the push seen by ls-remote, each comment read back at its URL`, async () => {
    const { host, outcome } = await runOn(forge)

    assert.equal(outcome.status, 'done', outcome.reason)
    const pages = host.codeHost.pages
    assert.deepEqual(writes(host), [
      ...Array(4).fill(['issue-comment', '42', 'applied', null]),
      ['push', 'checkout', 'applied', null],
      ['pull-request-create', 'checkout', 'applied', null],
      ...Array(2).fill(['issue-comment', '42', 'applied', null]),
    ])
    assert.deepEqual(host.codeHost.reads.filter((read) => read.startsWith('ls-remote')), ['ls-remote checkout'])
    assert.ok(host.codeHost.reads.includes('read #issuecomment-901'), host.codeHost.reads.join('\n'))
    assert.match(lastReason(host), new RegExp(`^pull request #42 opened as a draft: ${pages}/pull/42`))
    const report = await host.tracking.read(SLUG, 'run-report.md')
    assert.ok(report.includes('## Forge writes\n\n| Write | Subject | Outcome | Reason |\n| --- | --- | --- | --- |\n| issue-comment | 42 | applied | - |\n'), report)
    assert.ok(report.includes('| push | checkout | applied | - |\n| pull-request-create | checkout | applied | - |\n'), report)
  })

  test(`${forge}: a write the forge refuses is journaled refused with the adapter's fixed reason, shown in the run report`, async () => {
    const refusal = 'git push of checkout to origin failed or was refused'
    const { host } = await runOn(forge, { fails: { push: refusal } })

    assert.deepEqual(writes(host).filter(([write]) => write === 'push'), [['push', 'checkout', 'refused', refusal]])
    assert.deepEqual(host.codeHost.calls.filter((call) => call.startsWith('push')), ['push checkout'], 'a refused push is not tried again')
    assert.equal(lastReason(host), notOpened(refusal))
    assert.ok((await host.tracking.read(SLUG, 'run-report.md')).includes(`| push | checkout | refused | ${refusal} |`))
  })

  test(`${forge}: a comment the forge says it kept but does not show when read back is verification-failed, never kept`, async () => {
    const { host } = await runOn(forge, { unseen: ['comment'] })

    const [first] = writes(host)
    assert.deepEqual(first, ['issue-comment', '42', 'verification-failed', `the forge said it kept the comment on #42, but reading it back at ${host.codeHost.pages}/issues/42#issuecomment-901 does not show it`])
    assert.deepEqual(eventsOf(host, 'issue.commented'), [])
    assert.equal(eventsOf(host, 'issue.comment-skipped')[0].reason, first[3])
  })

  test(`${forge}: a write whose answer is lost (a time limit, a cut) is unknown, never done`, async () => {
    const cut = `${forge === 'github' ? 'gh' : 'az'} got no answer within 120 s`
    const { host } = await runOn(forge, { cut: { comment: cut } })

    assert.deepEqual(writes(host)[0], ['issue-comment', '42', 'unknown', cut])
    assert.deepEqual(eventsOf(host, 'issue.commented'), [])
    assert.ok((await host.tracking.read(SLUG, 'run-report.md')).includes(`| issue-comment | 42 | unknown | ${cut} |`))
    assert.deepEqual((await host.report()).writes[0], { write: 'issue-comment', subject: '42', outcome: 'unknown', reason: cut })
  })

  test(`${forge}: a run resumed after its pull request's opening was cut finds that pull request by its head and opens no second one`, async () => {
    const cut = `${forge === 'github' ? 'gh' : 'az'} got no answer within 120 s`
    const { host } = await runOn(forge, { cut: { create: cut } })

    assert.deepEqual(writes(host).filter(([write]) => write.startsWith('pull-request')), [['pull-request-create', 'checkout', 'unknown', cut]])
    assert.deepEqual(eventsOf(host, 'pull-request.create-started').map(({ head, base }) => [head, base]), [['checkout', 'main']])
    assert.equal(lastReason(host), notOpened(cut))

    host.codeHost.cut = {}
    const published = await host.publish()

    assert.equal(host.codeHost.pullRequests.length, 1, 'one pull request on the forge')
    assert.equal(host.codeHost.calls.filter((call) => call.startsWith('create ')).length, 1, 'the resume opens none')
    assert.deepEqual(published, { ok: true, slug: SLUG, code: null, reason: `found again after an opening that was cut; pull request #42 updated: ${host.codeHost.pages}/pull/42` })
    const [opened] = eventsOf(host, 'pull-request.opened')
    assert.deepEqual([opened.number, opened.head, opened.reconciled], [42, 'checkout', true])
    assert.deepEqual(writes(host).filter(([write]) => write.startsWith('pull-request')).slice(1), [['pull-request-create', 'checkout', 'applied', null], ['pull-request-edit', '42', 'applied', null]])

    assert.equal((await host.publish()).reason, `pull request #42 is up to date: ${host.codeHost.pages}/pull/42`)
  })

  test(`${forge}: a pull request opened but not listed by its head when read back is verification-failed; the resume opens no second one while the opening is unsettled`, async () => {
    const { host } = await runOn(forge, { unseen: ['create'] })

    const reason = 'the forge said it opened pull request #42 of checkout, but listing the pull requests of checkout does not show it'
    assert.deepEqual(writes(host).filter(([write]) => write.startsWith('pull-request')), [['pull-request-create', 'checkout', 'verification-failed', reason]])
    assert.equal(lastReason(host), notOpened(reason))

    const resumed = await host.publish()

    assert.equal(host.codeHost.calls.filter((call) => call.startsWith('create ')).length, 1, 'no second opening')
    assert.equal(resumed.reason, notOpened('an earlier opening of the pull request of checkout was cut or not shown, and the forge lists none for checkout: skraft opens no other one; open it by hand, or check the forge'))
  })

  test(`${forge}: a push ls-remote does not show is sent once more, then never declared done`, async () => {
    const { host } = await runOn(forge, { unseen: ['push'] })

    assert.deepEqual(host.codeHost.calls.filter((call) => call.startsWith('push')), ['push checkout', 'push checkout'])
    assert.deepEqual(host.codeHost.reads.filter((read) => read.startsWith('ls-remote')), ['ls-remote checkout', 'ls-remote checkout'])
    const reason = 'git push of checkout answered, twice, but git ls-remote does not show the branch at the local commit'
    assert.deepEqual(writes(host).filter(([write]) => write === 'push'), [['push', 'checkout', 'verification-failed', reason]])
    assert.equal(lastReason(host), notOpened(reason))
    assert.ok(!host.codeHost.calls.some((call) => call.startsWith('find ')), 'no pull request for a branch the remote does not hold')
  })

  test(`${forge}: a push whose answer is lost and that ls-remote then shows is applied after one more try; one never shown is unknown`, async () => {
    const lost = 'git push of checkout got no answer within 120 s'
    const { host } = await runOn(forge, { cut: { push: lost } })

    assert.deepEqual(writes(host).filter(([write]) => write === 'push'), [['push', 'checkout', 'applied', null]])
    assert.deepEqual(host.codeHost.calls.filter((call) => call.startsWith('push')), ['push checkout'], 'the remote shows it: no second push')

    const never = await runOn(forge, { cut: { push: lost }, unseen: ['push'] })
    assert.deepEqual(never.host.codeHost.calls.filter((call) => call.startsWith('push')), ['push checkout', 'push checkout'])
    assert.deepEqual(writes(never.host).filter(([write]) => write === 'push'), [['push', 'checkout', 'unknown', 'git push of checkout got no answer twice, and git ls-remote does not show the branch at the local commit']])
  })
}
