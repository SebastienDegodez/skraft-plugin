import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agent, finding, lenses, nominal, REFS_42, reviews, says, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { BUILT_IN_REVIEW } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'

/** The prompt of the lens agent `id` in the review `step`. @param {ReturnType<typeof scripted>} host @param {string} id @param {string} step */
const prompt = (host, id, step) => host.agentRunner.reviewed().find((dispatch) => dispatch.agent === id && dispatch.label.includes(step)).prompt

/** The files a review pass wrote beside itself. @param {ReturnType<typeof scripted>} host @param {string} folder */
const written = async (host, folder) => (await host.tracking.list(SLUG, folder)).map((path) => path.slice(folder.length + 1))

test('NEEDS_REWORK returned by the call to review.dot sends the DELIVER agent back with the findings, as a review does', async () => {
  const host = scripted({}, (it) => [...nominal(it), agent({ work: tddCycle(SLUG, 'Refund') })(it)])
  host.agentRunner.review = lenses({
    'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the refund test asserts nothing', { gate: 'G7', location: 'tests/CheckoutTests.cs:9' })])],
  })

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(reviews(host).filter(([step]) => step === 'deliver_review'), [['deliver_review', 1, 'needs-rework', 'deliver'], ['deliver_review', 2, 'approved', 'visuals']])
  const started = host.events().filter((event) => event.type === 'step.started' && event.step === 'deliver')
  assert.deepEqual(started.map(({ visit, sentBy, feedback }) => [visit, sentBy, feedback]), [
    [1, undefined, []],
    [2, 'review', ['test-integrity F1 G7 blocker at tests/CheckoutTests.cs:9: the refund test asserts nothing']],
  ])
  const workflow = await host.tracking.read(SLUG, 'WORKFLOW.md')
  assert.ok(workflow.includes('\n- [x] deliver_review — test-integrity, architecture-boundaries, cold-reader, mock-fidelity, contract-fidelity: approved, pass 2\n'), workflow)
})

test('a review.dot bound to neither story nor documents reviews the changes alone: no context.md, no document of the run, no story in the briefs', async () => {
  const review = edit(BUILT_IN_REVIEW, ['input_story="optional", input_documents="optional", ', ''])
  const host = scripted({ files: { 'review.dot': review } }, (it) => nominal(it, REFS_42))

  assert.equal((await host.start({ story: { issue: 42, title: 'Pay by card' } })).status, 'done')

  assert.deepEqual(await written(host, 'reviews/deliver_review-1'), ['changed-files.txt', 'changes.patch', 'code-files.txt', 'code.patch', 'components.json', 'verdict.yaml'])
  const boundaries = prompt(host, 'architecture-boundaries-lens', 'deliver_review')
  assert.equal(boundaries.slice(0, boundaries.indexOf('\n- Write no file')), [
    '## Skraft review lens: architecture-boundaries (DELIVER)',
    '- Story: none',
    `- Feature scope: ${SLUG}`,
    '- Read these inputs and the files they name; search the repository for nothing else:',
    `  - Changes since the base of the run (open a whole file only when the patch lacks the context a finding needs): ${TRACKING}/reviews/deliver_review-1/changes.patch`,
    `  - Paths those changes touch (a path with no section in the patch is a new file: open it): ${TRACKING}/reviews/deliver_review-1/changed-files.txt`,
    `  - Components (stack, mocking strategy, contract testing, gates that passed): ${TRACKING}/reviews/deliver_review-1/components.json`,
  ].join('\n'))
  const delivered = host.agentRunner.reviewed().filter(({ label }) => label.includes('deliver_review')).map(({ prompt: text }) => text)
  assert.deepEqual(delivered.filter((text) => text.includes('Documents of') || text.includes('Review context')), [])
  assert.ok((await written(host, 'reviews/design_review-1')).includes('context.md'))
  assert.ok(prompt(host, 'fitness-lens', 'design_review').includes('- Story: #42 — Pay by card'))
})

test('a review.dot bound to no components writes no components.json and hands the lenses none', async () => {
  const review = edit(BUILT_IN_REVIEW, [', input_components="optional"', ''])
  const host = scripted({ files: { 'review.dot': review } }, nominal)

  assert.equal((await host.start()).status, 'done')

  assert.deepEqual(await written(host, 'reviews/deliver_review-1'), ['changed-files.txt', 'changes.patch', 'code-files.txt', 'code.patch', 'context.md', 'verdict.yaml'])
  assert.ok(!prompt(host, 'architecture-boundaries-lens', 'deliver_review').includes('Components'))
  assert.ok((await written(host, 'reviews/design_review-1')).includes('components.json'))
})
