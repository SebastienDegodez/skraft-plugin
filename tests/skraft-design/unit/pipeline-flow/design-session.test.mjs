import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { agent, finding, lenses, pipelineHost, refutes, says, SETTLED_PUBLISH } from '../support/pipeline-host.mjs'
import { InMemoryCodeHost } from '../support/in-memory-host.mjs'
import { createDesignRun } from '../../../../plugins/skraft-design/engine/application/architecture/design-run.mjs'
import { createAgentLoop } from '../../../../plugins/skraft-design/engine/drivers/cli/agent-loop.mjs'
import { createRunPipeline } from '../../../../plugins/skraft-design/engine/application/pipeline/run-pipeline-usecase.mjs'
import { createDecide } from '../../../../plugins/skraft-design/engine/application/decisions/decide-usecase.mjs'
import { createDraftPublication } from '../../../../plugins/skraft-design/engine/application/publish/draft-publication-usecase.mjs'
import { createObserve } from '../../../../plugins/skraft-design/engine/application/pipeline/observe-usecase.mjs'
import { openActiveRun } from '../../../../plugins/skraft-design/engine/application/pipeline/active-run.mjs'
import { draftInCi, checkInCi } from '../../../../plugins/skraft-design/engine/application/architecture/ci-mode.mjs'
import { createCommentAnswer } from '../../../../plugins/skraft-design/engine/application/decisions/comment-answer-usecase.mjs'

const story = (number, state = 'open') => ({ number, title: 'Card checkout', body: 'AC-1: the receipt is visible.', state, labels: [], story: true, forge: 'github', repository: 'shop/checkout' })
const session = (stories = [story(42)], slug = 'issue-42', options = {}) => {
  const host = pipelineHost({ slug, ...options })
  const branches = []
  const deps = { ...host.deps,
    hasher: { sha256: async (text) => createHash('sha256').update(text).digest('hex'), hmacSha256: async (key, text) => createHmac('sha256', key).update(text).digest('hex') },
    architectureForge: { read: async () => ({ ok: true, issue: story(42) }), descendants: async () => ({ ok: true, stories }), research: async () => ({ ok: true, body: 'Previous investigation.' }) },
    architectureRepository: { branch: async (request) => { branches.push(request); return { ok: true } } },
  }
  const run = createDesignRun(deps)
  const loop = createAgentLoop({ adapters: deps, log: () => {}, then: { next: 'next', record: 'record', review: () => 'review' } })
  return { host, deps, run, loop, branches }
}

test('a story creates an isolated resumable run and hands only research to the host', async () => {
  const { host, run, loop, branches } = session()
  assert.equal((await run.start({ issue: 42 })).status, 'ready')
  const dispatch = await loop.next()
  assert.equal(dispatch.status, 'dispatch', dispatch.reason)
  assert.deepEqual(dispatch.dispatches.map(({ agent }) => agent), ['design-solution-researcher'])
  const scope = JSON.parse(await host.tracking.read('issue-42', 'plans/architecture-pass.json'))
  assert.equal(scope.stories[0].number, 42)
  assert.match(scope.stories[0].bodySha256, /^[0-9a-f]{64}$/)
  assert.equal((await run.prepare()).status, 'ready')
  assert.equal((await loop.next()).code, 'not-recorded')
  assert.deepEqual(branches, [{ name: 'design/issue-42', existing: false }])
})

test('an epic leaves its closed stories out without asking, in one journal that keeps them', async () => {
  const { host, deps, run } = session([story(42), story(43, 'closed')])
  const started = await run.start({ epic: 42 })
  assert.equal(started.status, 'ready', started.reason)
  assert.equal(host.agentRunner.dispatches.length, 0)
  const events = (await deps.journal.lines('epic-42')).map((line) => JSON.parse(line))
  assert.equal(events.some(({ type }) => type === 'question.asked'), false)
  assert.deepEqual(events.find(({ type }) => type === 'architecture.scope').excluded.map(({ issue }) => issue), [43])
  assert.deepEqual(JSON.parse(await host.tracking.read('epic-42', 'plans/architecture-pass.json')).stories.map(({ number }) => number), [42])
})

test('research and reviewed story architecture publish a single research comment and architecture PR', async () => {
  const { host, deps, run } = session([story(42)], 'issue-42', {
    config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } },
    files: { 'docs/adr/adr-001-example.md': '<!-- markdownlint-disable-file -->\n---\nstatus: Accepted\n---\n' },
  })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(agent()(host), agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('issue-42', 'plans/architecture-pass.json')).stories
    const brief = { version: 1, issue: current.number, forge: current.forge, repository: current.repository,
      bodySha256: current.bodySha256, components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: ['docs/adr/adr-001-example.md'] }],
      adrs: ['docs/adr/adr-001-example.md'], documents: ['docs/architecture/context-map.md'] }
    const path = 'docs/architecture/runs/issue-42/42-card-checkout.md'
    await workspace.write(path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
    git.change(path)
  } })(host))
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(host.agentRunner.dispatches.map(({ agent }) => agent), ['design-solution-researcher', 'design-solution-architect', 'design-pr-writer'])
  assert.deepEqual(host.agentRunner.reviewed().map(({ agent }) => agent), ['design-consistency-lens', 'design-architecture-compliance-lens', 'design-fitness-lens'])
  assert.equal(host.events().filter(({ type }) => type === 'architecture.pass-completed').length, 1)
  assert.ok(host.events().some(({ type }) => type === 'run.finished'))
  const comments = host.codeHost.comments.filter(({ body }) => body.startsWith('<!-- skraft-design:research:v1 -->'))
  assert.equal(comments.length, 1)
  assert.equal(comments[0].edits, 0)
  assert.equal(host.codeHost.pullRequests.length, 1)
})

test('an epic runs separate reviewed passes of twenty stories and one remaining story', async () => {
  const { host, deps, run } = session(Array.from({ length: 21 }, (_, index) => story(index + 1)), 'epic-42')
  const started = await run.start({ epic: 42 })
  assert.equal(started.status, 'ready', started.reason)
  const sizes = []
  const design = agent({ work: async ({ workspace, git, tracking }) => {
    const current = JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories
    sizes.push(current.length)
    for (const item of current) {
      const brief = { version: 1, issue: item.number, forge: item.forge, repository: item.repository, bodySha256: item.bodySha256,
        components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [] }], adrs: [], documents: ['docs/architecture/context-map.md'] }
      const path = `docs/architecture/runs/epic-42/${item.number}-card-checkout.md`
      await workspace.write(path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
      git.change(path)
    }
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), design, design)
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual(sizes, [20, 1])
  const events = (await deps.journal.lines('epic-42')).map((line) => JSON.parse(line))
  assert.equal(events.filter(({ type }) => type === 'architecture.pass-completed').length, 2)
})

test('excluding every architecture-blocked story stops without an empty architecture PR', async () => {
  const { host, deps, run } = session()
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(agent()(host), agent({ work: async ({ tracking }) => {
    await tracking.write('issue-42', 'details/blocked-stories.json', JSON.stringify([{ issue: 42, reason: 'Missing business decision.' }]))
  } })(host))
  const paused = await createRunPipeline(deps).run()
  assert.equal(paused.status, 'waiting', paused.reason)
  assert.equal(paused.question.kind, 'architecture-blocked')
  assert.equal((await createDecide(deps).decide({ key: paused.question.key, answer: 'CONTINUE' })).ok, true)
  const finished = await createRunPipeline(deps).run()
  assert.equal(finished.status, 'blocked', finished.reason)
  assert.equal(finished.code, 'architecture-empty')
  assert.equal(host.agentRunner.dispatches.some(({ agent }) => agent === 'design-pr-writer'), false)
})

test('a human-blocked architecture decision opens an engine-approved draft PR with answer choices', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42 })
  host.agentRunner.behaviours.push(agent()(host), agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories
    const brief = { version: 1, issue: current.number, forge: current.forge, repository: current.repository, bodySha256: current.bodySha256,
      components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [] }], adrs: [], documents: ['docs/architecture/context-map.md'] }
    const path = 'docs/architecture/runs/epic-42/42-card-checkout.md'
    await workspace.write(path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
    git.change(path)
    await tracking.write('epic-42', 'details/blocked-stories.json', JSON.stringify([{ issue: 43, reason: 'Missing business decision.' }]))
  } })(host))
  const paused = await createRunPipeline(deps).run()
  assert.equal(paused.status, 'waiting', paused.reason)
  const published = await createDraftPublication(deps).publish()
  assert.equal(published.ok, true, published.reason)
  assert.equal(host.codeHost.pullRequests.length, 1)
  assert.equal(host.codeHost.pullRequests[0].draft, true)
  assert.match(host.codeHost.pullRequests[0].body, /Human decision pending/)
  assert.match(host.codeHost.pullRequests[0].body, /Options: `CONTINUE`, `STOP`/)
  assert.match(host.codeHost.pullRequests[0].body, /\/skraft-answer/)
})

test('status exposes draft eligibility only for pending architecture decisions', async () => {
  const host = pipelineHost({ slug: 'issue-42' })
  await host.init({ slug: 'issue-42', story: { issue: 42, title: 'Card checkout' } })
  const opened = await openActiveRun(host.deps, 'issue-42')
  assert.equal(opened.ok, true)
  await opened.journal.append('question.asked', {
    key: 'architecture-blocked-0', kind: 'architecture-blocked', text: 'Continue or stop?', options: ['CONTINUE', 'STOP'],
    refusals: [], header: 'Blocked', step: 'design_review', visit: 1, subjects: [],
  })
  const view = await createObserve(host.deps).view()
  assert.equal(view.status, 'waiting')
  assert.equal(view.question?.kind, 'architecture-blocked')
  assert.deepEqual(view.draftPublication, { allowed: true, reason: 'human-decision-pending' })
})

test('a researcher-blocked run cannot be published as a draft PR', async () => {
  const { host, deps, run } = session([story(42)], 'issue-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(agent({ result: { status: 'blocked', summary: 'Three questions need the product owner.' } })(host))
  assert.equal((await createRunPipeline(deps).run()).status, 'waiting')
  const published = await createDraftPublication(deps).publish()
  assert.equal(published.code, 'draft-not-allowed')
  assert.equal(host.codeHost.pullRequests.length, 0)
})

test('a researcher that cannot go on keeps its research and open questions on the issue while a human answers', async () => {
  const { host, deps, run } = session([story(42)], 'issue-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(agent({ result: { status: 'blocked', summary: 'Three questions need the product owner.' } })(host))
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'waiting', outcome.reason)
  const comments = host.codeHost.comments.filter(({ body }) => body.startsWith('<!-- skraft-design:research:v1 -->'))
  assert.equal(comments.length, 1)
})

test('without consent a blocked researcher writes nothing on the issue', async () => {
  const { host, deps, run } = session()
  await run.start({ issue: 42 })
  host.agentRunner.behaviours.push(agent({ result: { status: 'blocked', summary: 'Three questions need the product owner.' } })(host))
  assert.equal((await createRunPipeline(deps).run()).status, 'waiting')
  assert.equal(host.codeHost.comments.length, 0)
})

test('a brief whose repository differs from the engine identity is refused naming the field and its expected value', async () => {
  const { host, deps, run } = session()
  await run.start({ issue: 42 })
  const wrong = agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('issue-42', 'plans/architecture-pass.json')).stories
    const brief = { version: 1, issue: 42, forge: 'github', repository: 'checkout', bodySha256: current.bodySha256, components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [] }], adrs: [], documents: [] }
    const path = 'docs/architecture/runs/issue-42/42-card-checkout.md'
    await workspace.write(path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
    git.change(path)
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), wrong, wrong, wrong, wrong)
  await createRunPipeline(deps).run()
  const failures = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'design').flatMap(({ failures }) => failures)
  assert.ok(failures.some((line) => line.includes('repository="shop/checkout"') && !line.includes('bodySha256=')), failures.join('|'))
})

test('an unreadable brief is refused naming the rule it breaks', async () => {
  const { host, deps, run } = session()
  await run.start({ issue: 42 })
  const wrong = agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('issue-42', 'plans/architecture-pass.json')).stories
    const brief = { version: 1, issue: 42, forge: current.forge, repository: current.repository, bodySha256: current.bodySha256,
      components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: ['docs/adr/adr-001-x.md'] }], adrs: [], documents: [] }
    const path = 'docs/architecture/runs/issue-42/42-card-checkout.md'
    await workspace.write(path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
    git.change(path)
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), wrong, wrong, wrong, wrong)
  await createRunPipeline(deps).run()
  const failures = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'design').flatMap(({ failures }) => failures)
  assert.ok(failures.some((line) => line.includes('invalid criteria') && line.includes('listed in the brief adrs')), failures.join('|'))
})

test('a Proposed ADR is accepted only after every architecture pass and only through the PR merge', async () => {
  const adr = 'docs/adr/adr-001-card-checkout.md'
  const index = 'docs/adr/decisions-index.md'
  const { host, deps, run } = session(Array.from({ length: 21 }, (_, index) => story(index + 1)), 'epic-42', {
    files: { [index]: '| ADR | Status | Ratified by |\n| --- | --- | --- |\n| ADR-001 | Proposed | — |\n' },
  })
  await run.start({ epic: 42 })
  const statusBetweenPasses = []
  const design = agent({ work: async ({ workspace, git, tracking }) => {
    const currentStories = JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories
    if (currentStories[0].number === 21) statusBetweenPasses.push((await workspace.read(adr)).match(/status: (\w+)/)?.[1])
    const decision = '<!-- markdownlint-disable-file -->\n---\nadr: 1\ntitle: Card checkout\nstatus: Proposed\ndecision: Expose checkout state through a read query.\nratified_by: null\n---\n'
    for (const current of currentStories) {
      const citesAdr = current.number === 1
      const brief = { version: 1, issue: current.number, forge: current.forge, repository: current.repository,
        bodySha256: current.bodySha256, components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: citesAdr ? [adr] : [] }],
        adrs: citesAdr ? [adr] : [], documents: [] }
      const path = `docs/architecture/runs/epic-42/${current.number}-card-checkout.md`
      if (citesAdr) await workspace.write(adr, decision)
      await workspace.write(path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
      git.change(...(citesAdr ? [adr, path] : [path]))
    }
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), design, design)
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'done', host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'design').flatMap(({ failures }) => failures).join('; '))
  assert.equal(host.human.questions.some(({ kind }) => kind === 'adr-merge-acceptance'), false)
  assert.deepEqual(statusBetweenPasses, ['Proposed'])
  assert.match(await host.workspace.read(adr), /status: Accepted/)
  assert.match(await host.workspace.read(adr), /ratified_by: "architecture PR merge"/)
  assert.match(await host.workspace.read(index), /\| ADR-001 \| Accepted \| architecture PR merge \|/)
  const events = host.events()
  assert.ok(events.findIndex(({ type, step }) => type === 'step.recorded' && step === 'adr') > events.findLastIndex(({ type }) => type === 'architecture.pass-completed'))
  const step = events.find(({ type, step }) => type === 'step.recorded' && step === 'adr')
  assert.equal(step.answer, 'ACCEPTED_ON_MERGE')
  assert.equal(step.outcome, 'skipped')
  assert.deepEqual(step.subjects, [adr])
  assert.match(await host.tracking.read('epic-42', 'pull-request-body.md'), /accepted only if this architecture PR merges/)
})

test('a Proposed ADR already on the merge base cannot be auto-accepted by the architecture PR', async () => {
  const adr = 'docs/adr/adr-001-card-checkout.md'
  const decision = '<!-- markdownlint-disable-file -->\n---\nadr: 1\ntitle: Card checkout\nstatus: Proposed\ndecision: Expose checkout state through a read query.\nratified_by: null\n---\n'
  const { host, deps, run } = session([story(42)], 'issue-42', { files: { [adr]: decision } })
  host.git.published.add(adr)
  await run.start({ issue: 42 })
  const design = agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('issue-42', 'plans/architecture-pass.json')).stories
    const brief = { version: 1, issue: current.number, forge: current.forge, repository: current.repository,
      bodySha256: current.bodySha256, components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [adr] }],
      adrs: [adr], documents: [] }
    const path = 'docs/architecture/runs/issue-42/42-card-checkout.md'
    await workspace.write(path, `<!-- skraft-architecture-brief:v1\n${JSON.stringify(brief)}\n-->\n\n# Checkout\n`)
    git.change(path)
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), design)
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'waiting')
  assert.match(await host.workspace.read(adr), /status: Proposed/)
  assert.equal(host.events().some(({ type, step }) => type === 'step.recorded' && step === 'adr'), false)
})

const briefOf = (current) => `<!-- skraft-architecture-brief:v1\n${JSON.stringify({ version: 1, issue: current.number, forge: current.forge, repository: current.repository,
  bodySha256: current.bodySha256, components: ['api'], criteria: [{ id: 'AC-1', components: ['api'], adrs: [] }], adrs: [], documents: [] })}\n-->\n\n# Checkout\n`
const OPEN_QUESTIONS = [
  { id: 'Q1', issue: 42, criterion: 'AC-1', question: 'How is the receipt proved in this slice?',
    options: [{ id: 'A', label: 'Through the HTTP entry point', consequence: 'The browser proof waits for the UI story.' },
      { id: 'B', label: 'In a browser now', consequence: 'A front-end component joins this slice.' }], assumption: 'A' },
  { id: 'Q2', issue: 43, criterion: 'AC-1', question: 'Does a declined card keep the basket?',
    options: [{ id: 'KEEP', label: 'Keep it', consequence: 'A retry reuses the basket.' },
      { id: 'EMPTY', label: 'Empty it', consequence: 'The customer starts again.' }], assumption: 'KEEP' },
]

test('an architect pass that leaves content questions is done, and the run waits on one decision holding each with its options', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42')
  await run.start({ epic: 42 })
  host.agentRunner.behaviours.push(agent()(host), agent({ work: async ({ workspace, git, tracking }) => {
    for (const current of JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories) {
      const path = `docs/architecture/runs/epic-42/${current.number}-card-checkout.md`
      await workspace.write(path, briefOf(current))
      git.change(path)
    }
    await tracking.write('epic-42', 'details/open-questions.json', JSON.stringify(OPEN_QUESTIONS))
  } })(host))
  const paused = await createRunPipeline(deps).run()
  assert.equal(paused.status, 'waiting', paused.reason)
  assert.equal(paused.question.kind, 'architecture-questions')
  assert.deepEqual(paused.question.questions.map(({ id, issue, options }) => [id, issue, options.map((option) => option.id)]),
    [['Q1', 42, ['A', 'B']], ['Q2', 43, ['KEEP', 'EMPTY']]])
  assert.match(paused.question.text, /Q1 \(#42 AC-1\): How is the receipt proved in this slice\?/)
  assert.match(paused.question.text, /B: In a browser now — A front-end component joins this slice\./)
  const design = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'design')
  assert.deepEqual(design.map(({ outcome }) => outcome), ['done'])
  assert.deepEqual(host.agentRunner.reviewed(), [])
})

test('open questions that offer one option, or assume none of theirs, are refused naming the file and the rule', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42')
  await run.start({ epic: 42 })
  const [first, second] = OPEN_QUESTIONS
  const malformed = [{ ...first, options: first.options.slice(0, 1) }, { ...second, assumption: 'MAYBE' }]
  const wrong = agent({ work: async ({ workspace, git, tracking }) => {
    for (const current of JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories) {
      const path = `docs/architecture/runs/epic-42/${current.number}-card-checkout.md`
      await workspace.write(path, briefOf(current))
      git.change(path)
    }
    await tracking.write('epic-42', 'details/open-questions.json', JSON.stringify(malformed))
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), wrong, wrong, wrong, wrong)
  await createRunPipeline(deps).run()
  const failures = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'design').flatMap(({ failures }) => failures)
  assert.ok(failures.includes('details/open-questions.json: Q1: it offers at least two options.'), failures.join('|'))
  assert.ok(failures.includes('details/open-questions.json: Q2: its assumption is the id of one of its options.'), failures.join('|'))
})

test('answering every open question runs the architect once more with each answer, then the review; a partial set changes nothing', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42')
  await run.start({ epic: 42 })
  const architect = (questions) => agent({ work: async ({ workspace, git, tracking }) => {
    for (const current of JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories) {
      const path = `docs/architecture/runs/epic-42/${current.number}-card-checkout.md`
      await workspace.write(path, briefOf(current))
      git.change(path)
    }
    await tracking.write('epic-42', 'details/open-questions.json', JSON.stringify(questions))
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), architect(OPEN_QUESTIONS))
  const paused = await createRunPipeline(deps).run()
  const view = await createObserve(deps).view()
  assert.deepEqual(view.question?.questions?.map(({ id, options }) => [id, options.map((option) => option.id)]), [['Q1', ['A', 'B']], ['Q2', ['KEEP', 'EMPTY']]])
  const decide = (answer) => createDecide(deps).decide({ key: paused.question.key, answer })
  const partial = await decide(JSON.stringify({ Q1: 'a' }))
  assert.equal(partial.code, 'invalid-answer')
  assert.match(partial.reason, /Q2/)
  assert.equal(host.events().some(({ type, key }) => type === 'question.answered' && key === paused.question.key), false)
  const full = await decide(JSON.stringify({ Q1: 'a', Q2: 'Keep it, and warn the customer' }))
  assert.equal(full.ok, true, full.reason)
  host.agentRunner.behaviours.push(architect([]))
  const finished = await createRunPipeline(deps).run()
  assert.equal(finished.status, 'done', finished.reason)
  const designs = host.agentRunner.dispatches.filter(({ agent: id }) => id === 'design-solution-architect')
  assert.equal(designs.length, 2)
  assert.match(designs[1].prompt, /Q1 \(#42 AC-1\): A — Through the HTTP entry point/)
  assert.match(designs[1].prompt, /Q2 \(#43 AC-1\): Keep it, and warn the customer/)
  assert.deepEqual(host.agentRunner.reviewed().map(({ agent: id }) => id), ['design-consistency-lens', 'design-architecture-compliance-lens', 'design-fitness-lens'])
})

const questioningArchitect = (host, slug) => agent({ work: async ({ workspace, git, tracking }) => {
  for (const current of JSON.parse(await tracking.read(slug, 'plans/architecture-pass.json')).stories) {
    const path = `docs/architecture/runs/epic-42/${current.number}-card-checkout.md`
    await workspace.write(path, briefOf(current))
    git.change(path)
  }
  await tracking.write(slug, 'details/open-questions.json', JSON.stringify(OPEN_QUESTIONS))
} })(host)

test('in CI the engine publishes the draft itself, every open question in its body with one reply form for all', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  assert.equal((await run.start({ epic: 42, mode: 'ci' })).status, 'ready')
  host.agentRunner.behaviours.push(agent()(host), questioningArchitect(host, 'epic-42'))
  const settled = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(settled.status, 'waiting', settled.reason)
  assert.equal(settled.draft?.ok, true, settled.draft?.reason)
  assert.equal(host.codeHost.pullRequests.length, 1)
  const [{ draft, body }] = host.codeHost.pullRequests
  assert.equal(draft, true)
  assert.match(body, /Q1 \(#42 AC-1\): How is the receipt proved in this slice\?/)
  assert.match(body, /`A`: Through the HTTP entry point — The browser proof waits for the UI story\./)
  assert.match(body, /`EMPTY`: Empty it — The customer starts again\./)
  assert.ok(body.includes('  ```text\n  /skraft-answer\n  Q1: <option or your words>\n  Q2: <option or your words>\n  ```'), body)
})

test('a researcher blocked in CI, nothing designed yet, asks on the epic with the branch pushed', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42, mode: 'ci' })
  host.agentRunner.behaviours.push(agent({ result: { status: 'blocked', summary: 'Two questions need the product owner.' } })(host))
  const settled = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(settled.status, 'waiting', settled.reason)
  assert.equal(settled.draft?.ok, true, settled.draft?.reason)
  assert.equal(settled.draft.on, 'issue')
  assert.equal(host.codeHost.pullRequests.length, 0)
  const asked = host.codeHost.comments.filter(({ body }) => body.startsWith('<!-- skraft-design:question:v1 -->'))
  assert.equal(asked.length, 1)
  assert.equal(asked[0].number, 42)
  assert.match(asked[0].body, /Options: `STOP`/)
  assert.ok(host.events().some(({ type, write, outcome }) => type === 'forge.write' && write === 'push' && outcome === 'applied'))
})

test('an interactive run publishes no draft while it waits, and a mode the engine does not know is refused', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42 })
  host.agentRunner.behaviours.push(agent()(host), questioningArchitect(host, 'epic-42'))
  const settled = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(settled.status, 'waiting')
  assert.equal(settled.draft, undefined)
  assert.equal(host.codeHost.pullRequests.length, 0)
  const refused = await session([story(42)], 'issue-42').run.start({ issue: 42, mode: 'nightly' })
  assert.equal(refused.status, 'refused')
  assert.equal(refused.code, 'invalid-mode')
})

test('a reply in the draft from someone with write access answers every open question in their words or options; anyone else, an unknown key or a comment that is no reply records nothing', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42, mode: 'ci' })
  host.agentRunner.behaviours.push(agent()(host), questioningArchitect(host, 'epic-42'))
  const { question } = await draftInCi(deps, await createRunPipeline(deps).run())
  host.codeHost.permissions = { maintainer: 'maintain', reader: 'read' }
  const comment = (author, reply) => createCommentAnswer(deps).answer({ author, body: `/skraft-answer ${JSON.stringify(reply)}` })
  const reader = await comment('reader', { key: question.key, answer: { Q1: 'A', Q2: 'KEEP' } })
  assert.equal(reader.code, 'not-a-writer', reader.reason)
  assert.equal((await comment('maintainer', { key: 'architecture-questions-9-nothing', answer: { Q1: 'A', Q2: 'KEEP' } })).ok, false)
  assert.equal((await comment('maintainer', { key: question.key, answer: { Q1: 'Z', Q2: 'KEEP' } })).ok, true)
  assert.equal((await createCommentAnswer(deps).answer({ author: 'maintainer', body: 'Looks good to me' })).code, 'not-an-answer')
  const answered = host.events().filter(({ type, key }) => type === 'question.answered' && key === question.key)
  assert.deepEqual(answered.map(({ by }) => by), ['pr-comment'])
  assert.match(answered[0].answer, /Q1 \(#42 AC-1\): Z/)
})

test('what a blocked architect pass wrote is committed with the pass that resumes it, though that pass left it as it was', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42')
  await run.start({ epic: 42 })
  const briefs = (numbers) => async ({ workspace, git, tracking }) => {
    for (const current of JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories.filter(({ number }) => numbers.includes(number))) {
      const path = `docs/architecture/runs/epic-42/${current.number}-card-checkout.md`
      await workspace.write(path, `${briefOf(current)}\nPass ${numbers.length}.\n`)
      git.change(path)
    }
  }
  host.agentRunner.behaviours.push(agent()(host),
    agent({ work: briefs([42, 43]), result: { status: 'blocked', summary: 'The product owner decides the receipt proof.' } })(host))
  const blocked = await createRunPipeline(deps).run()
  assert.equal(blocked.status, 'waiting', blocked.reason)
  const { question } = await createObserve(deps).view()
  assert.equal((await createDecide(deps).decide({ key: question.key, answer: 'Prove it through the HTTP entry point.' })).ok, true)
  host.agentRunner.behaviours.push(agent({ work: briefs([42]) })(host))
  const finished = await createRunPipeline(deps).run()
  assert.equal(finished.status, 'done', finished.reason)
  const committed = host.git.engineCommits.flatMap(({ paths }) => paths)
  assert.ok(committed.includes('docs/architecture/runs/epic-42/43-card-checkout.md'), committed.join(', '))
  assert.ok(committed.includes('docs/architecture/runs/epic-42/42-card-checkout.md'), committed.join(', '))
})

test('a pull request a previous run of the branch left closed does not stop a new run publishing; one this run opened and a person closed does', async () => {
  const codeHost = new InMemoryCodeHost({ open: [{ number: 6, head: 'checkout', state: 'closed' }] })
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { codeHost, config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42, mode: 'ci' })
  host.agentRunner.behaviours.push(agent()(host), questioningArchitect(host, 'epic-42'))
  const settled = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(settled.draft?.ok, true, settled.draft?.reason)
  const opened = host.codeHost.pullRequests.filter(({ state }) => state === 'open')
  assert.deepEqual(opened.map(({ number }) => number === 6), [false])
  opened[0].state = 'closed'
  const again = await createDraftPublication(deps).publish()
  assert.equal(again.ok, false)
  assert.match(again.reason, new RegExp(`#${opened[0].number} of checkout is closed, and skraft opens no other one`))
})

test('a reply in free lines under /skraft-answer, one per question, answers them all without the key; a question left out records nothing', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42, mode: 'ci' })
  host.agentRunner.behaviours.push(agent()(host), questioningArchitect(host, 'epic-42'))
  const { question } = await draftInCi(deps, await createRunPipeline(deps).run())
  host.codeHost.permissions = { maintainer: 'maintain' }
  const reply = (body) => createCommentAnswer(deps).answer({ author: 'maintainer', body })
  const partial = await reply('/skraft-answer\nQ1:b')
  assert.equal(partial.ok, false)
  assert.match(partial.reason, /Q2 has no answer/)
  assert.equal((await reply('/skraft-answer\nQ1:b\nq2 = keep it, and warn the customer')).ok, true)
  const [answered] = host.events().filter(({ type, key }) => type === 'question.answered' && key === question.key)
  assert.match(answered.answer, /Q1 \(#42 AC-1\): B — In a browser now/)
  assert.match(answered.answer, /Q2 \(#43 AC-1\): keep it, and warn the customer/)
})

test('a one-line reply under /skraft-answer answers the one decision a CI run waits on, without its key', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42, mode: 'ci' })
  host.agentRunner.behaviours.push(agent({ result: { status: 'blocked', summary: 'Two questions need the product owner.' } })(host))
  await draftInCi(deps, await createRunPipeline(deps).run())
  const { question } = await createObserve(deps).view()
  host.codeHost.permissions = { maintainer: 'write' }
  assert.equal((await createCommentAnswer(deps).answer({ author: 'maintainer', body: '/skraft-answer stop' })).ok, true)
  assert.deepEqual(host.events().filter(({ type, key }) => type === 'question.answered' && key === question.key).map(({ answer }) => answer), ['STOP'])
})

test('in CI a block met after something is committed goes to the draft, and a reply in several lines is the instruction', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42, mode: 'ci' })
  host.agentRunner.behaviours.push(agent()(host), questioningArchitect(host, 'epic-42'))
  const asked = await draftInCi(deps, await createRunPipeline(deps).run())
  host.codeHost.permissions = { maintainer: 'write' }
  const reply = (body) => createCommentAnswer(deps).answer({ author: 'maintainer', body })
  assert.equal((await reply('/skraft-answer\nQ1: A\nQ2: KEEP')).ok, true)
  host.agentRunner.behaviours.push(agent({ result: { status: 'blocked', summary: 'The product owner decides the receipt proof.' } })(host))
  const blocked = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(blocked.status, 'waiting', blocked.reason)
  assert.equal(blocked.draft?.ok, true, blocked.draft?.reason)
  assert.equal(host.codeHost.pullRequests.length, 1)
  const { question } = await createObserve(deps).view()
  assert.notEqual(question.key, asked.question.key)
  assert.ok(host.codeHost.pullRequests[0].body.includes(`(key \`${question.key}\`)`), host.codeHost.pullRequests[0].body)
  const instruction = await reply('/skraft-answer\nProve it through the HTTP entry point,\nand move the browser proof to the UI story.')
  assert.equal(instruction.ok, true, instruction.reason)
  const [answered] = host.events().filter(({ type, key }) => type === 'question.answered' && key === question.key)
  assert.equal(answered.answer, 'Prove it through the HTTP entry point, and move the browser proof to the UI story.')
})

test('a CI job fails when its run waits on a question no draft and no issue comment holds, and passes once one does', async () => {
  const { host, deps, run } = session([story(42), story(43)], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42, mode: 'ci' })
  host.agentRunner.behaviours.push(agent()(host), questioningArchitect(host, 'epic-42'))
  host.codeHost.fails.create = 'GraphQL: Something went wrong'
  const refused = await draftInCi(deps, await createRunPipeline(deps).run())
  assert.equal(refused.draft?.ok, false)
  const failing = await checkInCi(deps)
  assert.equal(failing.ok, false)
  assert.equal(failing.code, 'question-unpublished')
  assert.match(failing.reason, new RegExp(refused.question.key))
  delete host.codeHost.fails.create
  assert.equal((await createDraftPublication(deps).publish()).ok, true)
  assert.deepEqual(await checkInCi(deps), { ok: true, code: null, reason: 'the question the run waits on is published' })
})

test('the architecture pull request lists the stories the run left out and why', async () => {
  const { host, deps, run } = session([story(42), story(43, 'closed')], 'epic-42', { config: { publish: { ...SETTLED_PUBLISH, pullRequest: true } } })
  await run.start({ epic: 42 })
  host.agentRunner.behaviours.push(agent()(host), agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('epic-42', 'plans/architecture-pass.json')).stories
    const path = 'docs/architecture/runs/epic-42/42-card-checkout.md'
    await workspace.write(path, briefOf(current))
    git.change(path)
  } })(host))
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'done', outcome.reason)
  assert.match(host.codeHost.pullRequests[0].body, /- Story #43 left out: the issue is closed/)
})

test('a pass the review sends back is told the files its findings cite, once each, and to change only those', async () => {
  const { host, deps, run } = session([story(42)], 'issue-42')
  await run.start({ issue: 42 })
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [
      finding('F1', 'high', 'ContractRevision sits inside the ManagedApi boundary', { location: 'docs/architecture/contract.md:24' }),
      finding('F2', 'high', 'The relation label differs from ARCHITECTURE.md', { location: 'docs/architecture/context-map.md:52' }),
      finding('F3', 'high', 'The hash is named twice', { location: 'docs/architecture/contract.md:40' }),
    ])],
    refuter: [refutes('confirmed'), refutes('confirmed'), refutes('confirmed')],
  })
  const design = agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('issue-42', 'plans/architecture-pass.json')).stories
    const path = 'docs/architecture/runs/issue-42/42-card-checkout.md'
    await workspace.write(path, briefOf(current))
    git.change(path)
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), design, design)
  await createRunPipeline(deps).run()
  const designs = host.agentRunner.dispatches.filter(({ agent: id }) => id === 'design-solution-architect')
  assert.equal(designs.length, 2)
  assert.ok(designs[1].prompt.includes('Files the findings cite, the only ones this pass reads again and changes unless a fix needs another: docs/architecture/contract.md, docs/architecture/context-map.md'), designs[1].prompt)
})

test('a context map the pass changes without its glossary is refused, so every document names things one way', async () => {
  const { host, deps, run } = session([story(42)], 'issue-42')
  await run.start({ issue: 42 })
  const mapping = (map) => agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('issue-42', 'plans/architecture-pass.json')).stories
    await workspace.write('docs/architecture/runs/issue-42/42-card-checkout.md', briefOf(current))
    await workspace.write('docs/architecture/context-map.md', map)
    git.change('docs/architecture/runs/issue-42/42-card-checkout.md', 'docs/architecture/context-map.md')
  } })(host)
  host.agentRunner.behaviours.push(agent()(host), mapping('# Context map\n\n## Contexts\n- Checkout\n'),
    mapping('# Context map\n\n## Glossary\n\n| Term | Context | Meaning |\n| --- | --- | --- |\n| Receipt | Checkout | What the customer keeps |\n'))
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'done', outcome.reason)
  const failures = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'design').flatMap(({ failures }) => failures)
  assert.deepEqual(failures, ['docs/architecture/context-map.md: name every term the documents share once, in a ## Glossary table (term, context, meaning), and use it verbatim everywhere.'])
})

test('a document the run creates outside its context folder is refused naming where it belongs; one already on the base keeps its path', async () => {
  const old = 'docs/domain/event-model/payment.md'
  const { host, deps, run } = session([story(42)], 'issue-42', { files: { [old]: '# Payment\n' } })
  host.git.published.add(old)
  await run.start({ issue: 42 })
  const misplaced = ['docs/architecture/contract.md', 'docs/domain/event-model/contract.md']
  const writing = (paths) => agent({ work: async ({ workspace, git, tracking }) => {
    const [current] = JSON.parse(await tracking.read('issue-42', 'plans/architecture-pass.json')).stories
    for (const path of misplaced.filter((each) => !paths.includes(each))) { workspace.files.delete(path); git.revert(path) }
    await workspace.write('docs/architecture/runs/issue-42/42-card-checkout.md', briefOf(current))
    for (const path of paths) await workspace.write(path, '# Contract governance\n')
    git.change('docs/architecture/runs/issue-42/42-card-checkout.md', ...paths)
  } })(host)
  host.agentRunner.behaviours.push(agent()(host),
    writing([...misplaced, old]),
    writing(['docs/architecture/contexts/contract-governance/tactical-design.md', 'docs/architecture/contexts/contract-governance/event-model/register-api.md', old]))
  const outcome = await createRunPipeline(deps).run()
  assert.equal(outcome.status, 'done', outcome.reason)
  const failures = host.events().filter(({ type, step }) => type === 'step.recorded' && step === 'design').flatMap(({ failures }) => failures)
  const where = 'write it under docs/architecture/contexts/<context>/, as tactical-design.md or event-model/<slice>.md'
  assert.deepEqual(failures, [`docs/architecture/contract.md: ${where}.`, `docs/domain/event-model/contract.md: ${where}.`])
})
