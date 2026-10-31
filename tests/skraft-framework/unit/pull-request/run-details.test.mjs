import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { finding, lenses, nominal, prWriter, refutes, REFS_42, says, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'
import { opening } from '../support/description.mjs'

const CONSENTED = { publish: { pullRequest: true, questionVersions: { pullRequest: 2 } } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const TEST_PLAN = `details/2026-10-11/test-plan-${SLUG}.md`
const LONG_WHY = `${'Customers asked to pay by card.\n'.repeat(60)}End.`
const POINTER = 'The run\'s other details (tests, consistency matrix, RED evidence, quality gates, review, screenshots, run summary, AI disclosure) are in this pull request\'s comments titled skraft · run details.'

/** Azure Repos' limits and link, the story's issue read as the forge double gives it unless `issues` says. */
const azure = (more = {}) => new InMemoryCodeHost({ bodyLimit: 4_000, commentLimit: 140_000, link: (issue, closes) => `${closes ? 'Fixes ' : ''}#${issue}`, ...more })

/** A run that ends by opening its pull request on `codeHost`, the pr-writer's Why as given. */
const opened = async (codeHost, why = LONG_WHY, story = STORY) => {
  const host = scripted({ config: CONSENTED, codeHost }, (it) => nominal(it, REFS_42))
  host.prWriters.push(prWriter({ why }))
  const outcome = await host.start(story)
  assert.equal(outcome.status, 'done', outcome.reason)
  return host
}

const reasonOf = (host) => eventsOf(host, 'step.recorded').at(-1).reason

test('a body that fits its forge keeps everything in the description and posts no comment, on GitHub up to its 60,000 characters and on Azure up to its 4,000', async () => {
  for (const codeHost of [new InMemoryCodeHost(), azure()]) {
    const host = await opened(codeHost, 'Customers asked to pay by card.')

    const body = await host.tracking.read(SLUG, 'pull-request-body.md')
    assert.ok(body.includes('<summary>Tests'), body)
    assert.ok(!body.includes('comments titled'), body)
    assert.deepEqual([host.codeHost.pullRequestComments, eventsOf(host, 'pull-request.details-kept'), eventsOf(host, 'pull-request.details-skipped')], [[], [], []])
    assert.ok(!host.codeHost.calls.some((call) => call.startsWith('keep pr comment')), host.codeHost.calls.join('\n'))
  }
})

test('the details of a run republished after they changed, the description itself up to date, are rewritten in the same comment, never posted twice, and written nowhere when they did not change', async () => {
  const host = await opened(azure())
  const [comment] = host.codeHost.pullRequestComments
  const body = async () => host.tracking.read(SLUG, 'pull-request-body.md')

  await host.publish()
  assert.equal(comment.edits, 1, 'the run summary the first publish wrote said the run was still in progress')
  assert.equal((await host.publish()).reason, `pull request #42 is up to date: ${host.codeHost.pullRequests[0].url}; its run details are in 1 comment, the first at ${comment.url}`)
  assert.deepEqual([host.codeHost.pullRequestComments.length, comment.edits], [1, 1])

  await host.tracking.write(SLUG, TEST_PLAN, 'A sharper test plan.')
  const reason = (await host.publish()).reason

  assert.equal(reason, `pull request #42 is up to date: ${host.codeHost.pullRequests[0].url}; its run details are in 1 comment, the first at ${comment.url}`)
  assert.deepEqual([host.codeHost.pullRequestComments.length, comment.edits, comment.body.includes('A sharper test plan.')], [1, 2, true])
  assert.equal(host.codeHost.calls.at(-1), `keep pr comment #42 ${comment.url.slice(comment.url.indexOf('#'))}`)
  assert.equal((await body()).endsWith(`\n\n${POINTER}\n`), true)
  assert.deepEqual(eventsOf(host, 'pull-request.details-kept').map(({ part, parts, url }) => [part, parts, url]), [[1, 1, comment.url], [1, 1, comment.url], [1, 1, comment.url]])
})

test('a finding left to a human stays in the description, open, never in the comment', async () => {
  const lone = [finding('F1', 'medium', 'pay names no currency')]
  const host = scripted({ config: CONSENTED, codeHost: azure() }, (it) => nominal(it, REFS_42))
  host.prWriters.push(prWriter({ why: LONG_WHY }))
  host.agentRunner.review = lenses({ 'cold-reader': [says('cold-reader', 'fail', lone)], refuter: [refutes('refuted', 'context-map.md:12 fixes pay(amount)')] })

  assert.equal((await host.start(STORY)).status, 'done')

  const body = await host.tracking.read(SLUG, 'pull-request-body.md')
  assert.match(opening(body, 'Review'), /^<details open>/)
  assert.ok(!host.codeHost.pullRequestComments[0].body.includes('<summary>Review'))
  assert.ok(host.codeHost.pullRequestComments[0].body.includes('<summary>Tests'))
})

test('details past what one comment takes are packed whole into numbered parts, each with its own marker; a later publication that needs fewer empties the others instead of posting a new one', async () => {
  const host = await opened(azure({ commentLimit: 1_200 }))
  const parts = host.codeHost.pullRequestComments

  assert.ok(parts.length >= 2, String(parts.length))
  parts.forEach(({ body }, index) => {
    assert.ok(body.length <= 1_200, `${body.length}`)
    assert.ok(body.startsWith(`<!-- skraft:run-details slug=${SLUG} part=${index + 1} -->\n# skraft · run details ${index + 1}/${parts.length}\n\n`), body.slice(0, 120))
  })
  assert.deepEqual(eventsOf(host, 'pull-request.details-kept').map(({ part, parts: of }) => [part, of]), parts.map((_, index) => [index + 1, parts.length]))

  host.codeHost.commentLimit = 140_000
  await host.publish()

  assert.equal(host.codeHost.pullRequestComments.length, parts.length)
  assert.ok(host.codeHost.pullRequestComments[0].body.startsWith(`<!-- skraft:run-details slug=${SLUG} part=1 -->\n# skraft · run details\n\n`))
  for (const [index, { body }] of host.codeHost.pullRequestComments.entries().filter(([index]) => index > 0)) {
    assert.equal(body, `<!-- skraft:run-details slug=${SLUG} part=${index + 1} -->\n# skraft · run details\n\nThis part of the run details is no longer used.\n`)
  }
})

test('a body that fits its forge again empties every part kept before', async () => {
  const host = await opened(azure())
  assert.equal(host.codeHost.pullRequestComments.length, 1)

  host.codeHost.bodyLimit = 60_000
  assert.match((await host.publish()).reason, /^pull request #42 updated: [^;]*$/)

  assert.equal(host.codeHost.pullRequestComments.length, 1)
  assert.equal(host.codeHost.pullRequestComments[0].body, `<!-- skraft:run-details slug=${SLUG} part=1 -->\n# skraft · run details\n\nThis part of the run details is no longer used.\n`)
})

test('details the forge refused to keep do not unpublish the pull request: the reason is fixed, the keep is journaled skipped, and the next publish keeps them', async () => {
  const refusal = 'az could not comment pull request #42 on Shop/payment'
  const host = await opened(azure({ fails: { pullRequestComment: refusal } }))

  assert.equal(reasonOf(host), `pull request #42 opened as a draft: ${host.codeHost.pullRequests[0].url}; its run details were not kept: ${refusal}; pull-request-details-1.md holds them, and skraft publish keeps them once that is fixed`)
  assert.deepEqual(eventsOf(host, 'pull-request.details-skipped').map(({ number, part, parts, reason }) => ({ number, part, parts, reason })), [{ number: 42, part: 1, parts: 1, reason: refusal }])
  assert.deepEqual(eventsOf(host, 'pull-request.details-kept'), [])
  assert.ok((await host.tracking.read(SLUG, 'pull-request-details-1.md')).includes('<summary>Tests'))

  host.codeHost.fails = {}
  const published = await host.publish()

  assert.match(published.reason, /^pull request #42 is up to date: [^;]*; its run details are in 1 comment, the first at /)
  assert.equal(host.codeHost.pullRequestComments.length, 1)
  assert.equal(eventsOf(host, 'pull-request.details-kept').length, 1)
})

test('a forge that takes request files is handed the thread to post, closed, and the comment to rewrite, beside the Markdown', async () => {
  const host = await opened(azure({ takesRequestFile: true }))
  const [{ body, threadFile, commentFile }] = host.codeHost.pullRequestComments

  assert.deepEqual(JSON.parse(host.codeHost.read(threadFile)), { comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: 4 })
  assert.deepEqual(JSON.parse(host.codeHost.read(commentFile)), { content: body })
  assert.deepEqual([threadFile, commentFile], [`${TRACKING}/pull-request-details-1.thread.json`, `${TRACKING}/pull-request-details-1.comment.json`])
})

test('the details are titled in the language of the story, detected from the issue the run kept: French for a French story, English for an English one or one with no words to tell by', async () => {
  const issues = {
    french: { title: 'Payer par carte', body: 'En tant que client, je veux payer par carte pour que la commande soit validée sans passer par la livraison.' },
    english: { title: 'Pay by card', body: 'As a shopper, I want to pay by card so that the order is placed without cash on delivery.' },
    neither: { title: 'Checkout #42', body: '42 / 17' },
    tied: { title: 'Checkout #42', body: 'le the' },
  }
  const expected = { french: ['skraft · détails du run', 'sont dans les commentaires de cette pull request intitulés skraft · détails du run.'], english: ['skraft · run details', 'are in this pull request\'s comments titled skraft · run details.'], neither: ['skraft · run details', 'are in this pull request\'s comments titled skraft · run details.'], tied: ['skraft · run details', 'are in this pull request\'s comments titled skraft · run details.'] }
  for (const [language, issue] of Object.entries(issues)) {
    const host = await opened(azure({ issues: { 42: issue } }), LONG_WHY, { story: { issue: 42, title: issue.title } })

    const [{ body }] = host.codeHost.pullRequestComments
    const description = await host.tracking.read(SLUG, 'pull-request-body.md')
    assert.ok(body.includes(`\n# ${expected[language][0]}\n`), `${language}: ${body.slice(0, 160)}`)
    assert.ok(description.trimEnd().endsWith(expected[language][1]), `${language}: ${description.slice(-200)}`)
  }
})

test('a story whose run kept no issue is told by its title alone', async () => {
  const host = scripted({ config: CONSENTED, codeHost: azure({ fails: { issue: 'the forge could not be asked' } }) }, (it) => nominal(it, REFS_42))
  host.prWriters.push(prWriter({ why: LONG_WHY }))

  assert.equal((await host.start({ story: { issue: 42, title: 'Payer la commande par carte pour les clients de la boutique' } })).status, 'done')

  assert.ok(host.codeHost.pullRequestComments[0].body.includes('\n# skraft · détails du run\n'))
})

test('details that fill the room of a comment exactly stay in one part, one character less makes two', async () => {
  const whole = await opened(azure())
  const [{ body }] = whole.codeHost.pullRequestComments
  const header = `<!-- skraft:run-details slug=${SLUG} part=1 -->\n# skraft · run details\n\n`
  const room = body.length - header.length

  const fits = await opened(azure({ commentLimit: room + 200 }))
  const tight = await opened(azure({ commentLimit: room + 199 }))

  assert.deepEqual([fits.codeHost.pullRequestComments.length, tight.codeHost.pullRequestComments.length], [1, 2])
})
