import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { agent, pipelineHost, SETTLED_PUBLISH } from '../support/pipeline-host.mjs'
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
  const host = pipelineHost({ slug: 'issue-42', config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } }, scenarioReviews: [null] })
  // The brief's fingerprint is a SHA-256, and the traces the agents leave are signed with the same hasher.
  host.deps.hasher = { sha256: async (text) => createHash('sha256').update(text).digest('hex'), hmacSha256: async (key, text) => createHmac('sha256', key).update(text).digest('hex') }
  const deps = { ...host.deps,
    architectureForge: { read: async () => ({ ok: true, issue: { number: 42, title: 'Checkout receipt', body: BODY, story: true, forge: 'github', repository: 'shop/checkout' } }) },
    architectureRepository: { branch: async () => ({ ok: true }), snapshot: async () => ({ ok: true, sha: 'merged-sha', paths: [], read: async () => null }),
      unmerged: async () => ({ ok: true, found: true }), concurrent: async () => ({ ok: true, branches: [] }) },
  }
  host.codeHost.permissions = { maintainer: 'write' }
  return { host, deps, run: createDeliveryRun(deps) }
}

const questionComments = (comments) => comments.filter(({ body }) => body.startsWith('<!-- skraft-deliver:question:v1 key='))

test('CI fails when the delivery is refused before it can dispatch or publish a question', async () => {
  const { host, deps, run } = ciSession()
  const config = JSON.parse(await host.workspace.read('skraft-deliver-config.json'))
  delete config.components[0].bdd
  await host.workspace.write('skraft-deliver-config.json', JSON.stringify(config))
  assert.equal((await run.start({ issue: 42, mode: 'ci' })).status, 'ready')
  assert.equal((await createRunPipeline(deps).run()).code, 'configuration-incomplete')
  assert.equal((await checkInCi(deps)).ok, false)
})

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
  assert.match(onIssue.body, /^<summary>The question as it was asked<\/summary>$/m)
  assert.match(onIssue.body, /^\| `CONTINUE` \| /m)
  assert.doesNotMatch(onIssue.body, /\/skraft-answer|Reply in one comment/)
  assert.equal(host.events().find(({ type, key }) => type === 'question.answered' && key === 'design_wait-1').author, 'maintainer')
})

test('in CI each question of a delivery reads as a person reads it: the wait for a design, the light design to ratify, the scenarios and their red', async () => {
  const { host, deps, run } = ciSession()
  await draftInCi(deps, await run.start({ issue: 42, mode: 'ci' }))
  await draftInCi(deps, await createRunPipeline(deps).run())
  const [wait] = questionComments(host.codeHost.comments)
  assert.match(wait.body, /^The delivery of #42 waits for a design: Merge the architecture pull request before delivering this story\.$/m)
  assert.match(wait.body, /^Run skraft-design on #42 and merge its pull request, check out `deliver\/issue-42` again, then answer RESUME\.$/m)
  assert.match(wait.body, /^\| `RESUME` \| reads the merged base again, once skraft-design merged a brief for the story \|$/m)
  assert.match(wait.body, /^\| `CONTINUE` \| delivers on a light design instead \|$/m)

  await createCommentAnswer(deps).answer({ author: 'maintainer', body: '/skraft-answer continue' })
  host.agentRunner.behaviours.push(lightDesigner({ brief: { criteria: [{ id: 'AC-1', components: ['.'], adrs: [ADR] }], adrs: [ADR] }, adrs: { [ADR]: adrText },
    body: '# Checkout receipt\n\n## Assumptions\n\n- The receipt is mailed once the payment is captured.\n' })(host))
  await draftInCi(deps, await createRunPipeline(deps).run())
  const [light] = questionComments(host.codeHost.pullRequestComments)
  assert.match(light.body, /^The light design wrote `docs\/architecture\/runs\/issue-42\/42-checkout-receipt\.md`\.$/m)
  assert.ok(light.body.includes('**ADRs to ratify**\n\n| ADR | Decision |\n| --- | --- |\n| docs/adr/adr-001-mail-receipts.md | Receipts leave the shop through the notification gateway. |'), light.body)
  assert.ok(light.body.includes('**What it assumed where the story leaves a choice open**\n- The receipt is mailed once the payment is captured.'), light.body)
  assert.match(light.body, /^\| `APPROVED` \| ratifies its ADRs, accepted on the merge of the delivery pull request, and goes on to DISTILL \|$/m)
  assert.match(light.body, /^REVISE takes your corrections after it, on its line or the next ones: `\/skraft-answer REVISE <your corrections>`\.$/m)

  await createCommentAnswer(deps).answer({ author: 'maintainer', body: '/skraft-answer approved' })
  host.agentRunner.behaviours.push(agent()(host))
  const review = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(review.code, 'scenario-review', review.reason)
  const scenarios = questionComments(host.codeHost.pullRequestComments).find(({ body }) => body.includes('key=scenario_review-1'))
  // A tag is written as code, so that GitHub mentions nobody.
  assert.ok(scenarios.body.includes("**The story's scenarios (1)**\n\n| # | Scenario | Component | Tags |\n| --- | --- | --- | --- |\n| S1 | Customer pays by card | api | `@walking-skeleton` |"), scenarios.body)
  assert.ok(scenarios.body.includes('**The order DELIVER makes them pass in**\n1. S1'), scenarios.body)
  assert.match(scenarios.body, /^\*\*Their red:\*\* [0-9a-z-]{4,7} `test\(issue-42\): walking skeleton` — `tests\/Integration\/WalkingSkeletonTests\.cs`$/m)
  assert.ok(scenarios.body.includes("<details><summary>The end of the designer's traced run of them</summary>\n\n````text\nS1_pays: expected paid 10, got nothing\n````"), scenarios.body)
  assert.match(scenarios.body, /^\| `REVISE` \| sends DISTILL back with your corrections \|$/m)
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

test('in CI a story whose issue changed since its brief asks on the story, at the start, whether to keep the brief or design it again', async () => {
  const { host, deps, run } = ciSession()
  const path = 'docs/architecture/runs/epic-1/42-checkout-receipt.md'
  const brief = { version: 1, issue: 42, forge: 'github', repository: 'shop/checkout', bodySha256: createHash('sha256').update('Earlier criteria.').digest('hex'),
    components: ['.'], criteria: [{ id: 'AC-1', components: ['.'], adrs: [] }], adrs: [], documents: [] }
  deps.architectureRepository.snapshot = async () => ({ ok: true, sha: 'merged-sha', paths: [path], read: async (name) => (name === path ? `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Receipt\n` : null) })
  const asked = await draftInCi(deps, await run.start({ issue: 42, mode: 'ci' }))
  assert.equal(asked.status, 'waiting', asked.reason)
  assert.equal(asked.draft?.on, 'issue', JSON.stringify(asked.draft))
  const [comment] = questionComments(host.codeHost.comments)
  assert.match(comment.body, /^The story's issue changed since its brief `docs\/architecture\/runs\/epic-1\/42-checkout-receipt\.md` was designed\.$/m)
  assert.match(comment.body, /^\| `KEEP` \| delivers on the merged brief as it is \|$/m)
  assert.match(comment.body, /^\| `REDESIGN` \| pauses the delivery for a new design of the story \|$/m)
})
