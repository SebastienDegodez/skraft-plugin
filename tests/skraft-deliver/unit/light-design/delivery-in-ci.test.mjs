import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { pipelineHost, SETTLED_PUBLISH } from '../support/pipeline-host.mjs'
import { lightDesigner } from '../support/light-designer.mjs'
import { createDeliveryRun } from '../../../../plugins/skraft-deliver/engine/application/architecture/delivery-run.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-deliver/engine/application/pipeline/run-pipeline-usecase.mjs'
import { draftInCi, checkInCi } from '../../../../plugins/skraft-deliver/engine/application/architecture/ci-mode.mjs'
import { createCommentAnswer } from '../../../../plugins/skraft-deliver/engine/application/decisions/comment-answer-usecase.mjs'

const BODY = 'AC-1: the receipt is visible.'
const ADR = 'docs/adr/adr-001-mail-receipts.md'
const adrText = '---\nstatus: Proposed\nratified_by: null\ndecision: Receipts leave the shop through the notification gateway.\n---\n\n# ADR-001: Mail receipts\n\n**Status:** Proposed\n'

/** A delivery of story #42 in CI, consented to publish, whose brief waits on an unmerged design. */
const ciSession = () => {
  const host = pipelineHost({ slug: 'issue-42', config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  const deps = { ...host.deps,
    hasher: { sha256: async (text) => createHash('sha256').update(text).digest('hex'), hmacSha256: async (key, text) => createHmac('sha256', key).update(text).digest('hex') },
    architectureForge: { read: async () => ({ ok: true, issue: { number: 42, title: 'Checkout receipt', body: BODY, story: true, forge: 'github', repository: 'shop/checkout' } }) },
    architectureRepository: { branch: async () => ({ ok: true }), snapshot: async () => ({ ok: true, sha: 'merged-sha', paths: [], read: async () => null }),
      unmerged: async () => ({ ok: true, found: true }), concurrent: async () => ({ ok: true, branches: [] }) },
  }
  host.codeHost.permissions = { maintainer: 'write' }
  return { host, deps, run: createDeliveryRun(deps) }
}

const questionComments = (comments) => comments.filter(({ body }) => body.startsWith('<!-- skraft-deliver:question:v1 key='))

test('in CI a delivery asks each question in a comment of its own: on the story before it commits anything, then on its draft, each answer marked with who gave it', async () => {
  const { host, deps, run } = ciSession()
  const started = await draftInCi(deps, await run.start({ issue: 42, mode: 'ci' }))
  assert.equal(started.status, 'ready', started.reason)
  assert.deepEqual(host.events().filter(({ type }) => type === 'run.mode').map(({ mode }) => mode), ['ci'])

  // The brief waits on an unmerged design: nothing is committed yet, so the question goes on the story.
  const waiting = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(waiting.code, 'architecture-wait', waiting.reason)
  assert.equal(waiting.draft?.on, 'issue', JSON.stringify(waiting.draft))
  const [onIssue] = questionComments(host.codeHost.comments)
  assert.equal(onIssue.number, 42)
  assert.ok(onIssue.body.startsWith('<!-- skraft-deliver:question:v1 key=design_wait-1 -->'), onIssue.body)
  assert.equal(host.codeHost.pullRequests.length, 0)
  assert.deepEqual(await checkInCi(deps), { ok: true, code: null, reason: 'the question the run waits on is published' })

  // A writer answers CONTINUE in a comment; the light design writes an ADR, which a person ratifies on the draft.
  assert.equal((await createCommentAnswer(deps).answer({ author: 'maintainer', body: '/skraft-answer continue' })).ok, true)
  host.agentRunner.behaviours.push(lightDesigner({ brief: { criteria: [{ id: 'AC-1', components: ['.'], adrs: [ADR] }], adrs: [ADR] }, adrs: { [ADR]: adrText } })(host))
  const review = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(review.code, 'light-design-review', review.reason)
  assert.equal(review.draft?.on, 'pull-request', JSON.stringify(review.draft))
  assert.equal(host.codeHost.pullRequests[0].draft, true)
  const [onDraft] = questionComments(host.codeHost.pullRequestComments)
  assert.ok(onDraft.body.startsWith('<!-- skraft-deliver:question:v1 key=light_design_review-1 -->'), onDraft.body)
  assert.match(onIssue.body, /^\*\*Recorded answer, from maintainer:\*\* `CONTINUE`/m)
  assert.equal(host.events().find(({ type, key }) => type === 'question.answered' && key === 'design_wait-1').author, 'maintainer')
})

test('in CI a refusal takes its reason in the reply: REVISE and the person\'s corrections, on its line or the next ones', async () => {
  const { host, deps, run } = ciSession()
  await draftInCi(deps, await run.start({ issue: 42, mode: 'ci' }))
  await draftInCi(deps, await createRunPipeline(deps).run())
  await createCommentAnswer(deps).answer({ author: 'maintainer', body: '/skraft-answer continue' })
  host.agentRunner.behaviours.push(lightDesigner({ brief: { criteria: [{ id: 'AC-1', components: ['.'], adrs: [ADR] }], adrs: [ADR] }, adrs: { [ADR]: adrText } })(host))
  await draftInCi(deps, await createRunPipeline(deps).run())
  const revised = await createCommentAnswer(deps).answer({ author: 'maintainer', body: '/skraft-answer REVISE\nMail the receipt from the order context,\nnot from checkout.' })
  assert.equal(revised.ok, true, revised.reason)
  const answered = host.events().findLast(({ type }) => type === 'question.answered')
  assert.deepEqual([answered.answer, answered.reason, answered.author], ['REVISE', 'Mail the receipt from the order context, not from checkout.', 'maintainer'])
  // The JSON form gives its reason in its own field.
  const again = ciSession()
  await draftInCi(again.deps, await again.run.start({ issue: 42, mode: 'ci' }))
  await draftInCi(again.deps, await createRunPipeline(again.deps).run())
  await createCommentAnswer(again.deps).answer({ author: 'maintainer', body: '/skraft-answer continue' })
  again.host.agentRunner.behaviours.push(lightDesigner({ brief: { criteria: [{ id: 'AC-1', components: ['.'], adrs: [ADR] }], adrs: [ADR] }, adrs: { [ADR]: adrText } })(again.host))
  await draftInCi(again.deps, await createRunPipeline(again.deps).run())
  assert.equal((await createCommentAnswer(again.deps).answer({ author: 'maintainer', body: '/skraft-answer {"answer":"revise","reason":"Mail it from orders."}' })).ok, true)
  assert.equal(again.host.events().findLast(({ type }) => type === 'question.answered').reason, 'Mail it from orders.')
})
