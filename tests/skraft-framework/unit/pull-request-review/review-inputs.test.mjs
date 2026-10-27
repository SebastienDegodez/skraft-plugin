import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_REVIEW } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'
import { PULL_REQUEST, REVIEWS, reviewHost, SLUG } from './support.mjs'

const MOCK_SETUP = 'tests/Shop.IntegrationTest/PaymentMockSetup.cs'

test('a pull request from a fork without skraft-config.json: the stack is detected as skraft init would, Microcks assumed for mock-fidelity, and no file written in the working copy', async () => {
  const host = reviewHost({ config: null, files: { 'Shop.sln': '', 'src/Shop.Api/Shop.Api.csproj': '<Project />', 'tests/Shop.IntegrationTest/Shop.IntegrationTest.csproj': '<Project />' } })
  host.git.commit('test: mock the payment provider', [MOCK_SETUP])
  host.git.adds(MOCK_SETUP, 'var provider = new HttpClient { BaseAddress = new Uri("https://payments.example.com") };')
  const before = [...host.workspace.files.keys()].sort()

  const outcome = await host.review()

  assert.equal(outcome.status, 'APPROVED')
  assert.deepEqual(host.agentRunner.batches[0].map(({ agent }) => agent), ['test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens', 'mock-fidelity-lens'])
  assert.deepEqual(JSON.parse(await host.reviews.read(SLUG, 'reviews/verdict-1/components.json')), [
    { name: 'shop', root: '.', stack: 'dotnet', mocking: { strategy: 'microcks' }, contractTesting: false, gates: [] },
  ])
  assert.ok(host.prompt('mock-fidelity-lens').includes(`\n  - Components (stack, mocking strategy, contract testing, gates that passed): ${REVIEWS}/reviews/verdict-1/components.json\n`))
  assert.deepEqual([...host.workspace.files.keys()].sort(), before)
})

test('the pull request\'s title and body, and the decision records of the repository, are what the review reads as its story and documents', async () => {
  const host = reviewHost({ files: { 'docs/adr/decisions-index.md': '| ADR | Title |\n' } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  await host.review()

  assert.equal(await host.reviews.read(SLUG, 'pull-request.md'), '# Pull request #12: Discount at checkout\n\nApplies a 10% discount to orders above 100.\n')
  const context = await host.reviews.read(SLUG, 'reviews/verdict-1/context.md')
  assert.ok(context.includes(`\nStory documents:\n- ${REVIEWS}/pull-request.md\n`), context)
  assert.ok(context.includes('\n- docs/adr/decisions-index.md\n'), context)
  assert.ok(host.prompt('architecture-boundaries-lens').includes(`\n  - Documents of the story and of the other phases: ${REVIEWS}/pull-request.md\n`))
})

test('a pull request with no body in a repository with no decision records hands the review no document: no context.md', async () => {
  const host = reviewHost({ pullRequest: { ...PULL_REQUEST, body: '  \n' } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  await host.review()

  assert.deepEqual((await host.reviews.list(SLUG, 'reviews/verdict-1')).map((path) => path.split('/').at(-1)), ['changed-files.txt', 'changes.patch', 'code-files.txt', 'code.patch', 'components.json', 'verdict.yaml'])
  assert.equal(await host.reviews.read(SLUG, 'pull-request.md'), null)
})

test('an ejected review.skraft.dot that declares neither documents nor components gets neither: no pull-request.md, no context.md, no components.json', async () => {
  const review = edit(BUILT_IN_REVIEW, [', input_documents="optional", input_components="optional"', ''])
  const host = reviewHost({ base: { '.skraft/review.skraft.dot': review }, files: { 'docs/adr/decisions-index.md': '| ADR |\n' } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  await host.review()

  assert.deepEqual((await host.reviews.list(SLUG, '')).filter((path) => !path.startsWith('reviews/') && path !== 'events.jsonl'), ['comment.md'])
  assert.deepEqual((await host.reviews.list(SLUG, 'reviews/verdict-1')).map((path) => path.split('/').at(-1)), ['changed-files.txt', 'changes.patch', 'code-files.txt', 'code.patch', 'verdict.yaml'])
  assert.ok(host.prompt('test-integrity-lens').includes('- Story: #12 — Discount at checkout\n'))
})

test('the decision records alone are documents: context.md lists them, no pull-request.md', async () => {
  const host = reviewHost({ pullRequest: { ...PULL_REQUEST, body: '' }, files: { 'docs/adr/decisions-index.md': '| ADR |\n' } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  await host.review()

  assert.ok((await host.reviews.read(SLUG, 'reviews/verdict-1/context.md')).includes('\n- docs/adr/decisions-index.md\n'))
  assert.equal(await host.reviews.read(SLUG, 'pull-request.md'), null)
})

test('a body emptied since the last pass leaves pull-request.md out of the documents', async () => {
  const host = reviewHost({ files: { 'docs/adr/decisions-index.md': '| ADR |\n' } })
  host.git.commit('feat: discount', ['src/Discount.cs'])
  await host.review()
  host.pullRequests.pullRequests[0] = { ...PULL_REQUEST, body: '' }

  await host.review()

  assert.ok(!(await host.reviews.read(SLUG, 'reviews/verdict-2/context.md')).includes('pull-request.md'))
  assert.ok(!host.prompt('architecture-boundaries-lens').includes('pull-request.md'))
})

test('the review reads skraft-config.json and .skraft/review.skraft.dot from the base, never from the pull request\'s head', async () => {
  const dropped = edit(BUILT_IN_REVIEW, ['  test_integrity          [shape=note, lens="test-integrity", mandatory=true]\n', ''], ['  lenses -> test_integrity -> verdict\n', ''])
  const host = reviewHost({ files: { '.skraft/review.skraft.dot': dropped, 'skraft-config.json': JSON.stringify({ components: [], publish: { reviewComment: true } }) } })
  host.git.commit('feat: discount', ['src/Discount.cs'])

  const outcome = await host.review({ publish: true })

  assert.equal(outcome.status, 'APPROVED')
  assert.ok(host.agentRunner.batches[0].some(({ agent }) => agent === 'test-integrity-lens'))
  assert.equal(host.human.questions.length, 1)
  assert.equal(JSON.parse(await host.reviews.read(SLUG, 'reviews/verdict-1/components.json'))[0].name, 'api')
})
