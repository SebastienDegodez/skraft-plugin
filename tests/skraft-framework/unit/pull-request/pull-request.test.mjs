import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryCodeHost, InMemoryGit, ScriptedReplay } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'
import { agent, API, finding, lenses, nominal, prWriter, PROSE_TEMPLATE, refutes, REFS_42, says, scripted, SLUG, tddCycle, TRACKING } from '../support/pipeline-host.mjs'
import { passing } from '../support/in-memory-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

const CONSENTED = { publish: { pullRequest: true } }
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const BODY_FILE = `${TRACKING}/pull-request-body.md`

/** The text of a section of a description, between its heading and the next one. */
const section = (text, heading) => {
  const from = text.indexOf(`\n## ${heading}\n`)
  assert.ok(from >= 0, `no section ${heading} in\n${text}`)
  const rest = text.slice(from + heading.length + 5)
  return rest.slice(0, rest.indexOf('\n## ') < 0 ? rest.length : rest.indexOf('\n## ')).trim()
}

test('the run ends by opening a draft pull request from its branch to its base, the pr-writer\'s prose around the facts the engine read in the journal', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))

  const outcome = await host.start(STORY)

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.deepEqual(host.codeHost.calls, ['push checkout', 'find checkout', 'create main <- checkout (draft): Pay by card at checkout'])
  assert.equal(host.codeHost.pullRequests[0].bodyFile, BODY_FILE)
  const description = await host.tracking.read(SLUG, 'pull-request.md')
  const body = await host.tracking.read(SLUG, 'pull-request-body.md')
  assert.equal(description, `Pay by card at checkout\n\n${body}`)
  assert.equal(body, [
    'Closes #42',
    '',
    '## What changes',
    '',
    'Checkout takes a card payment and records it.',
    '',
    '## Why',
    '',
    'Customers asked to pay by card instead of on delivery.',
    '',
    '## Decisions applied',
    '',
    'None recorded: no ADR was ratified and no locked gate was unlocked in this run.',
    '',
    '## Tests',
    '',
    'Not recorded yet: this run journals no grid from acceptance criteria to tests.',
    '',
    '## RED evidence',
    '',
    '| Commit | Subject | Replay exit code |',
    '| --- | --- | ---: |',
    '| `root-2` | test(checkout): acceptance of the card payment | 1 |',
    '| `root-3` | test(checkout): Checkout pays by card | 1 |',
    '',
    'Output excerpts of the replays are not recorded yet.',
    '',
    '## Quality gates',
    '',
    '| Component | Gate | Command | Result | Time | Evidence |',
    '| --- | --- | --- | --- | ---: | --- |',
    '| api | build | `dotnet build` | pass | 0 s | `gates/api/build-1.log` |',
    '| api | test | `dotnet test` | pass | 0 s | `gates/api/test-1.log` |',
    '| api | mutation | `dotnet stryker` | pass | 0 s | `gates/api/mutation-1.log` |',
    '',
    '## Review',
    '',
    'Every lens of the last pass of each review passed without a finding.',
    '',
    '## Screenshots',
    '',
    'None recorded: this run took no screenshots (no visuals step, or no front end in skraft-config.json).',
    '',
    '## Out of scope and limitations',
    '',
    'Refunds are out of scope.',
    '',
    '## Run summary',
    '',
    'running',
    '',
    '| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    '| publish_consent | RESEARCH | 1 | 1 | 0 | 0 s | - | skipped |',
    '| visuals_consent | RESEARCH | 1 | 1 | 0 | 0 s | - | skipped |',
    '| research | RESEARCH | 1 | 1 | 0 | 0 s | - | done |',
    '| design | DESIGN | 1 | 1 | 0 | 0 s | - | done |',
    '| design_review | DESIGN | 1 | 1 | 0 | 0 s | - | approved |',
    '| adr | DESIGN | 1 | 1 | 0 | 0 s | - | skipped |',
    '| distill | DISTILL | 1 | 1 | 0 | 0 s | - | done |',
    '| distill_review | DISTILL | 1 | 1 | 0 | 0 s | - | approved |',
    '| deliver | DELIVER | 1 | 1 | 0 | 0 s | - | done |',
    '| gates | DELIVER | 1 | 1 | 0 | 0 s | - | pass |',
    '| mutation | DELIVER | 1 | 1 | 0 | 0 s | - | pass |',
    '| deliver_review | DELIVER | 1 | 1 | 0 | 0 s | - | approved |',
    '| visuals | DELIVER | 1 | 1 | 0 | 0 s | - | skipped |',
    '| pr_writer | PUBLISH | 1 | 1 | 0 | 0 s | - | done |',
    '| publish | PUBLISH | 1 | 1 | 0 | 0 s | - | in progress |',
    '| Total | | | 15 | 0 | 0 s | - | |',
    '',
    '## AI disclosure',
    '',
    "This pull request was prepared by skraft with AI agents on the model families economy, implementer, planner, researcher, reviewer (the host named no model). What changes, Why and Out of scope were written by the pr-writer agent; every other section is rendered by the engine from the run's journal. A human reviews it before it merges.",
    '',
  ].join('\n'))
  const [opened] = eventsOf(host, 'pull-request.opened')
  assert.deepEqual(opened, { ...opened, number: 42, url: 'https://github.example.com/acme/shop/pull/42', base: 'main', head: 'checkout', draft: true, bodyHash: await host.deps.hasher.sha256(body.trimEnd()) })
  const { type, at, prev, ...published } = eventsOf(host, 'step.recorded').at(-1)
  assert.deepEqual(published, { step: 'publish', visit: 1, attempt: 1, outcome: 'published', code: null, missing: [], failures: [], next: 'exit', reason: 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42', durationMs: 0 })
  assert.deepEqual(eventsOf(host, 'step.recorded').slice(-2).map(({ step, outcome: result, next, reason }) => [step, result, next, reason]), [
    ['pr_writer', 'done', 'publish', undefined],
    ['publish', 'published', 'exit', 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42'],
  ])
  assert.ok(host.progress.lines.includes(`${SLUG}: publish: pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42`), host.progress.lines.join('\n'))
})

test('the pr-writer is told where to write its prose and what to read; a summary over 72 characters or an empty section sends it back with what to fix', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it))
  const seen = []
  const seeing = (writer) => (it) => async (dispatch) => {
    seen.push(await it.tracking.read(SLUG, `details/2026-10-11/pull-request-prose-${SLUG}.md`))
    return writer(it)(dispatch)
  }
  host.prWriters.push(seeing(prWriter({ summary: 'Pay by card at checkout, keeping the card token for the next payments of the customer', why: '' })), prWriter({ summary: 'Pay by card\nat checkout' }), prWriter({ summary: 'P'.repeat(72) }))

  await host.start()

  assert.equal(seen[0], PROSE_TEMPLATE)
  assert.equal(writes(host)[0].prompt, [
    '## Skraft dispatch: pr-writer (PUBLISH)',
    '- Story: none',
    `- Feature scope: ${SLUG}`,
    '- Attempt: 1 of 3',
    '- Read first:',
    `- ${TRACKING}/research/2026-10-11/${SLUG}-research.md`,
    `- ${TRACKING}/details/2026-10-11/context-map.md`,
    `- ${TRACKING}/details/2026-10-11/test-plan-${SLUG}.md`,
    `- ${TRACKING}/changes/2026-10-11/change-log.md`,
    '- Fill each output in place; keep the path, create no other copy:',
    `- ${TRACKING}/details/2026-10-11/pull-request-prose-${SLUG}.md`,
    `- Write your result as JSON to ${TRACKING}/results/pr_writer-1-1.json: {"status": "done" | "blocked", "summary": "<what you did, or why you cannot go on>"}`,
    '- Change nothing outside these paths of the working copy; the engine refuses the step otherwise:',
    `- .copilot-tracking/skraft-plans/${SLUG}`,
  ].join('\n'))
  assert.deepEqual(host.codeHost.calls.at(-1), `create main <- checkout (draft): ${'P'.repeat(72)}`)

  assert.deepEqual(writes(host).map(({ label }) => label), [`skraft ${SLUG} · pr_writer · attempt 1`, `skraft ${SLUG} · pr_writer · attempt 2`, `skraft ${SLUG} · pr_writer · attempt 3`])
  assert.ok(writes(host)[0].prompt.includes(`- Fill each output in place; keep the path, create no other copy:\n- ${TRACKING}/details/2026-10-11/pull-request-prose-${SLUG}.md\n`), writes(host)[0].prompt)
  assert.ok(writes(host)[0].prompt.includes(`- ${TRACKING}/changes/2026-10-11/change-log.md\n`), writes(host)[0].prompt)
  const refused = eventsOf(host, 'step.recorded').find(({ step }) => step === 'pr_writer')
  assert.deepEqual([refused.outcome, refused.code, refused.failures], ['failed', 'pull-request-prose', [
    'pull request prose: Summary is 85 characters; at most 72',
    'pull request prose: Why is empty',
  ]])
  assert.ok(writes(host)[1].prompt.includes('Refused in attempt 1 of 3:\n- pull request prose: Summary is 85 characters; at most 72\n- pull request prose: Why is empty'), writes(host)[1].prompt)
  assert.deepEqual(eventsOf(host, 'step.recorded').filter(({ step }) => step === 'pr_writer').map(({ failures }) => failures)[1], ['pull request prose: Summary must be one line'])

  const silent = scripted({ config: CONSENTED }, (it) => nominal(it))
  silent.prWriters.push((it) => async () => { it.tracking.files.delete(`${SLUG}/details/2026-10-11/pull-request-prose-${SLUG}.md`) })
  await silent.start()
  const missing = eventsOf(silent, 'step.recorded').find(({ step }) => step === 'pr_writer')
  assert.deepEqual([missing.code, missing.missing, missing.failures], ['missing-outputs', [`details/2026-10-11/pull-request-prose-${SLUG}.md`], ['result is missing']])

  const headless = scripted({ config: CONSENTED }, (it) => nominal(it))
  headless.prWriters.push((it) => async () => {
    const step = it.events().filter((event) => event.type === 'step.started').at(-1)
    await it.tracking.write(SLUG, step.outputs[0], '# Pull request prose\n\n## Summary\n\n\n## What changes\n\nCheckout takes cards.\n\n## Out of scope and limitations\n\nNone known.\n')
    await it.tracking.write(SLUG, step.result, JSON.stringify({ status: 'done', summary: 'prose written' }))
  })
  await headless.start()
  assert.deepEqual(eventsOf(headless, 'step.recorded').find(({ step }) => step === 'pr_writer').failures, ['pull request prose: Summary is empty', 'pull request prose: Why is empty'])
})

test('a repository workflow with no consent question and no pr-writer: nothing is pushed, the description says what nobody wrote, and its title is the story\'s, cut to 72 characters', async () => {
  const bare = edit(BUILT_IN_WORKFLOW,
    ['  publish_consent [shape=hexagon, question="publish-consent", phase="RESEARCH"]\n  visuals_consent [shape=hexagon, question="reporting-consent"]\n', ''],
    ['start -> publish_consent -> visuals_consent -> research', 'start -> research'],
    ['  pr_writer [shape=box, agent="pr-writer", phase="PUBLISH"]\n', ''],
    ['  publish  [shape=parallelogram, publish="pull-request"]', '  publish  [shape=parallelogram, publish="pull-request", phase="PUBLISH"]'],
    ['visuals -> pr_writer -> publish -> exit', 'visuals -> publish -> exit'])
  const title = 'Pay by card at checkout with a saved token, and refund it from the back office'
  const host = scripted({ workflow: bare }, (it) => nominal(it, REFS_42))

  await host.start({ story: { issue: 42, title } })

  assert.deepEqual(host.codeHost.calls, [])
  assert.equal(eventsOf(host, 'step.recorded').at(-1).reason, 'pull request not opened: nobody answered the publish-consent question yet (publish.pullRequest in skraft-config.json); pull-request.md holds its description, and skraft publish opens it once that is fixed')
  const description = await host.tracking.read(SLUG, 'pull-request.md')
  assert.ok(description.startsWith(`${title.slice(0, 71)}…\n\nRefs #42\n\n## What changes\n\nNot written: the run has no pr-writer step that wrote what changes.\n\n## Why\n\nNot written: the run has no pr-writer step that wrote why.\n`), description)
  assert.equal(section(description, 'Out of scope and limitations'), 'Not written: the run has no pr-writer step that wrote what is out of scope.')

  const untitled = scripted({ workflow: bare }, (it) => nominal(it))
  await untitled.start()
  assert.ok((await untitled.tracking.read(SLUG, 'pull-request.md')).startsWith(`${SLUG}\n\n## What changes\n`))
  const exact = scripted({ workflow: bare }, (it) => nominal(it))
  await exact.start({ story: { title: 'T'.repeat(72) } })
  assert.ok((await exact.tracking.read(SLUG, 'pull-request.md')).startsWith(`${'T'.repeat(72)}\n\n## What changes\n`))
})

test('without the consent, a forge, a branch apart from the base, the run completes locally, says why, and keeps the description', async () => {
  const cases = [
    [{ config: { publish: { pullRequest: false } } }, 'skraft-config.json sets publish.pullRequest to false', 'Refs'],
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ unavailable: 'gh, the GitHub CLI, is not installed' }) }, 'gh, the GitHub CLI, is not installed', 'Refs'],
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ branch: null }) }, 'HEAD is detached, on no branch to push', 'Refs'],
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ branch: 'main' }) }, 'HEAD is on main, the branch the pull request would merge into', 'Refs'],
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ branch: 'trunk', defaultBranch: 'trunk' }) }, 'HEAD is on trunk, the branch the pull request would merge into', 'Refs'],
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ fails: { push: 'git push of checkout to origin failed or was refused' } }) }, 'git push of checkout to origin failed or was refused', 'Closes'],
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ fails: { find: 'gh could not list the pull requests' } }) }, 'gh could not list the pull requests', 'Closes'],
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ fails: { create: 'gh could not open the pull request' } }) }, 'gh could not open the pull request', 'Closes'],
  ]
  for (const [options, why, issueLine] of cases) {
    const host = scripted(options, (it) => nominal(it, REFS_42))

    const outcome = await host.start(STORY)

    const reason = `pull request not opened: ${why}; pull-request.md holds its description, and skraft publish opens it once that is fixed`
    assert.deepEqual([outcome.status, outcome.reason], ['done', 'PUBLISH closed'])
    assert.deepEqual(eventsOf(host, 'step.recorded').at(-1), { ...eventsOf(host, 'step.recorded').at(-1), step: 'publish', outcome: 'local', next: 'exit', reason })
    assert.ok(host.progress.lines.includes(`${SLUG}: publish: ${reason}`), host.progress.lines.join('\n'))
    assert.ok((await host.tracking.read(SLUG, 'pull-request.md')).startsWith(`Pay by card at checkout\n\n${issueLine} #42\n`), why)
    assert.deepEqual([...eventsOf(host, 'pull-request.opened'), ...eventsOf(host, 'pull-request.updated')], [])
  }
  const declined = scripted({ config: { publish: { pullRequest: false } } }, (it) => nominal(it))
  await declined.start()
  assert.deepEqual(declined.codeHost.calls, [])
})

test('a base apart from the default branch is referenced, never closed, and a base named by its remote opens on the branch', async () => {
  const develop = { mergeBases: { develop: 'root-0', 'origin/main': 'root-0', main: 'root-0' } }
  const toDevelop = scripted({ config: { ...CONSENTED, baseBranch: 'develop' }, git: gitWith(develop) }, (it) => nominal(it, REFS_42))
  await toDevelop.start(STORY)
  assert.deepEqual(toDevelop.codeHost.calls.at(-1), 'create develop <- checkout (draft): Pay by card at checkout')
  assert.ok((await toDevelop.tracking.read(SLUG, 'pull-request-body.md')).startsWith('Refs #42\n\n'))

  const remote = scripted({ config: CONSENTED, git: gitWith(develop) }, (it) => nominal(it, REFS_42))
  await remote.start({ ...STORY, base: 'origin/main' })
  assert.deepEqual(remote.codeHost.calls.at(-1), 'create main <- checkout (draft): Pay by card at checkout')

  const sha = scripted({ config: CONSENTED, git: gitWith({ mergeBases: { main: 'root-0', a1b2c3d4: 'root-0' } }) }, (it) => nominal(it))
  await sha.start({ base: 'a1b2c3d4' })
  assert.equal(eventsOf(sha, 'step.recorded').at(-1).reason, 'pull request not opened: the run\'s base names no branch (a sha or a revision): set baseBranch in skraft-config.json, or start the run with --base <branch>; pull-request.md holds its description, and skraft publish opens it once that is fixed')
})

test('a working copy in no Git repository has no base to open a pull request into', async () => {
  const onlyPublish = 'digraph p {\n  start [shape=Mdiamond]\n  publish [shape=parallelogram, publish="pull-request", phase="PUBLISH"]\n  exit [shape=Msquare]\n  start -> publish -> exit\n}'
  const host = scripted({ config: CONSENTED, workflow: onlyPublish, git: new InMemoryGit({ repositories: {} }) }, () => [])

  assert.equal((await host.start()).status, 'done')

  assert.match(eventsOf(host, 'step.recorded').at(-1).reason, /^pull request not opened: the run's base names no branch/)
  assert.deepEqual(host.codeHost.calls, [])
  const body = await host.tracking.read(SLUG, 'pull-request-body.md')
  assert.equal(section(body, 'RED evidence'), 'None recorded: no red commit was accepted in this run.')
  assert.equal(section(body, 'Quality gates'), 'None recorded: no gate ran in this run.')
  assert.equal(section(body, 'Review'), 'Every lens of the last pass of each review passed without a finding.')
  assert.ok(section(body, 'AI disclosure').startsWith('This pull request was prepared by skraft with AI agents (the host named no model). What changes'), body)
})

test('the AI disclosure names the models the host said each agent, lens and check ran on', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it).map((behaviour) => async (dispatch) => {
    await behaviour(dispatch)
    return { ok: true, text: 'done', model: 'claude-sonnet-5' }
  }))
  host.agentRunner.review = (dispatch) => ({ ok: true, text: passing(dispatch), model: 'claude-haiku-5' })

  await host.start()

  assert.ok(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'AI disclosure').startsWith('This pull request was prepared by skraft with AI agents on the model families economy, implementer, planner, researcher, reviewer (models the host named: claude-haiku-5, claude-sonnet-5). '))
})

test('a draft is asked only when publish.draft is not false', async () => {
  const ready = scripted({ config: { publish: { draft: false } }, answers: [{ answer: 'ACCEPTED' }] }, (it) => nominal(it))
  await ready.start()
  assert.deepEqual(ready.workspace.config().publish, { draft: false, pullRequest: true })
  assert.deepEqual(ready.codeHost.calls.at(-1), 'create main <- checkout: Pay by card at checkout')
  assert.equal(eventsOf(ready, 'step.recorded').at(-1).reason, 'pull request #42 opened: https://github.example.com/acme/shop/pull/42')
})

test('the review the description shows: what counts, what the refuter refuted and why, and what one lens alone found for the human, duplicates together', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it))
  host.agentRunner.review = lenses({
    consistency: [says('consistency', 'fail', [finding('F1', 'medium', 'the map names no currency', { location: 'details/x.md:3' })])],
    fitness: [says('fitness', 'fail', [finding('F1', 'high', 'speculative cache', { location: 'details/x.md:9' })])],
    'test-integrity': [says('test-integrity', 'pass', [finding('F1', 'low', 'long name')])],
    'cold-reader': [says('cold-reader', 'fail', [finding('F1', 'medium', 'pay names no currency', { location: 'src/Checkout.cs:3' }), finding('F2', 'low', 'long name too', { location: './src/Checkout.cs:12' })])],
    refuter: [refutes('refuted', 'details/x.md:3 names EUR'), refutes('refuted', 'nothing is cached'), refutes('refuted', 'context-map.md:12 fixes pay(amount)')],
  })

  assert.equal((await host.start()).status, 'done')

  assert.equal(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Review'), [
    'Findings that count:',
    '',
    '- deliver_review · test-integrity F1, cold-reader F2 (low) `src/Checkout.cs:12`: long name',
    '',
    'Refuted by the finding refuter:',
    '',
    '- design_review · consistency F1 (medium) `details/x.md:3`: the map names no currency — refuted: details/x.md:3 names EUR',
    '- design_review · fitness F1 (high) `details/x.md:9`: speculative cache — refuted: nothing is cached',
    '',
    'For the human: found by one lens alone, against the lenses that passed:',
    '',
    '- deliver_review · cold-reader F1 (medium) `src/Checkout.cs:3`: pay names no currency — refuted: context-map.md:12 fixes pay(amount)',
  ].join('\n'))

  const reworked = scripted({ config: CONSENTED }, (it) => [...nominal(it).slice(0, 2), agent()(it), ...nominal(it).slice(2)])
  reworked.agentRunner.review = lenses({
    consistency: [
      says('consistency', 'fail', [finding('F1', 'medium', 'the map names no currency', { location: 'details/x.md:3' }), finding('F2', 'blocker', 'no owner for refunds', { location: 'details/x.md:9' })]),
      says('consistency', 'pass', [finding('F1', 'low', 'a long heading', { location: 'details/x.md:3' })]),
    ],
    'cold-reader': [says('cold-reader', 'pass', [finding('F1', 'low', 'long name')])],
    refuter: [refutes('refuted', 'details/x.md:3 names EUR'), refutes('confirmed', 'nobody owns refunds')],
  })
  await reworked.start()
  assert.equal(section(await reworked.tracking.read(SLUG, 'pull-request-body.md'), 'Review'), [
    'Findings that count:',
    '',
    '- design_review · consistency F1 (low) `details/x.md:3`: a long heading',
    '- deliver_review · cold-reader F1 (low) `src/Checkout.cs:12`: long name',
  ].join('\n'))

  const minor = scripted({ config: CONSENTED }, (it) => nominal(it))
  minor.agentRunner.review = lenses({ 'cold-reader': [says('cold-reader', 'pass', [finding('F1', 'low', 'long name')])] })
  await minor.start()
  assert.equal(section(await minor.tracking.read(SLUG, 'pull-request-body.md'), 'Review'), 'Findings that count:\n\n- deliver_review · cold-reader F1 (low) `src/Checkout.cs:12`: long name')
})

test('a red commit the engine refused is not shown as evidence, only the one that replaced it', async () => {
  const host = scripted({ config: CONSENTED, replay: new ScriptedReplay({ exits: { 'root-3': 0 } }) }, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: ({ git }) => { git.commit('test(checkout): pay passes already', ['tests/PayTests.cs']) } })(it),
    agent({ work: ({ git }) => { git.reset('.', 'root-2'); git.commit('test(checkout): pay fails first | twice', ['tests/PayTests.cs']); git.commit('feat(checkout): pay', ['src/Pay.cs']) } })(it),
  ])

  assert.equal((await host.start()).status, 'done')

  const evidence = section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'RED evidence')
  assert.ok(!evidence.includes('pay passes already'), evidence)
  assert.ok(evidence.includes('| test(checkout): pay fails first \\| twice | 1 |'), evidence)
})

test('the decisions the description shows: each ADR ratified in the run with its title, each locked gate unlocked with its reason', async () => {
  const adr = '---\nadr: 1\ntitle: Card payment\nstatus: Proposed\nsupersedes: null\nratified_by: null\n---\n\n# ADR-001 — Card payment\n\n**Status:** Proposed\n'
  const untitled = '---\nadr: 3\nstatus: Proposed\nsupersedes: null\nratified_by: null\n---\n\n# ADR-003\n\n**Status:** Proposed\n'
  const dropped = adr.replace('adr: 1', 'adr: 2').replace('Card payment', 'Card tokens')
  const files = { 'docs/adr/adr-001-card-payment.md': adr, 'docs/adr/adr-002-card-tokens.md': dropped, 'docs/adr/adr-003-refunds.md': untitled }
  const host = scripted({ config: CONSENTED, files, answers: [{ answer: 'REJECTED', reason: 'drop the tokens' }, { answer: 'RATIFIED' }] }, (it) => [
    agent()(it), agent()(it),
    agent({ work: ({ workspace }) => { workspace.files.delete('docs/adr/adr-002-card-tokens.md') } })(it),
    agent()(it), agent({ work: ({ git }) => { git.commit('test(checkout): pay', ['tests/PayTests.cs']); git.commit('feat(checkout): pay', ['src/Pay.cs']) } })(it),
  ])

  await host.start()

  assert.equal(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Decisions applied'), [
    '- ADR-001 Card payment (`docs/adr/adr-001-card-payment.md`), ratified in this run',
    '- ADR-003 (`docs/adr/adr-003-refunds.md`), ratified in this run',
  ].join('\n'))

  const unlocked = edit(BUILT_IN_WORKFLOW, ['mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true]', 'mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true, unlock="no mutation tool for this stack yet"]'])
  const skipping = scripted({ config: CONSENTED, workflow: unlocked }, (it) => nominal(it))
  await skipping.start()
  assert.equal(section(await skipping.tracking.read(SLUG, 'pull-request-body.md'), 'Decisions applied'), '- Locked gate `mutation` skipped, unlocked: no mutation tool for this stack yet')
})

test('a red commit replayed only as the last of its story says so, and a component the machine could not gate shows only the gates that ran once fixed', async () => {
  const lastRed = scripted({ config: { ...CONSENTED, tdd: { replay: 'last-red' } } }, (it) => [...nominal(it).slice(0, 3), agent({ work: (h) => { tddCycle()(h); h.git.commit('test(checkout): Checkout refunds', ['tests/RefundTests.cs']); h.git.commit('feat(checkout): Checkout refunds', ['src/Refund.cs']) } })(it)])
  await lastRed.start()
  assert.ok(section(await lastRed.tracking.read(SLUG, 'pull-request-body.md'), 'RED evidence').includes('\n| `root-3` | test(checkout): Checkout pays by card | not replayed |\n'))

  const fixing = async (question) => {
    await ungated.workspace.write('skraft-config.json', JSON.stringify({ ...CONSENTED, components: [{ ...API, commands: { build: 'dotnet build', mutation: 'dotnet stryker' } }] }))
    return { answer: 'RETRY' }
  }
  const ungated = scripted({ config: CONSENTED, components: [{ ...API, commands: {} }], answers: [fixing] }, (it) => [
    agent()(it), agent()(it), agent()(it), agent({ work: ({ git }) => { git.commit('refactor(checkout): name the payment', ['src/Pay.cs']) } })(it),
  ])
  assert.equal((await ungated.start()).status, 'done')
  assert.deepEqual(section(await ungated.tracking.read(SLUG, 'pull-request-body.md'), 'Quality gates').split('\n').slice(2).map((row) => row.split(' | ')[1]), ['build', 'mutation'])
})

test('a pr-writer alone before the publish node needs no design record, and a publish the machine stopped resumes without opening its step twice', async () => {
  const alone = 'digraph p {\n  start [shape=Mdiamond]\n  pr_writer [shape=box, agent="pr-writer", phase="PUBLISH"]\n  publish [shape=parallelogram, publish="pull-request"]\n  exit [shape=Msquare]\n  start -> pr_writer -> publish -> exit\n}'
  const host = scripted({ config: CONSENTED, workflow: alone }, () => [])
  host.codeHost.push = async () => { throw new TypeError('the machine stopped') }

  await assert.rejects(host.start(), TypeError)
  host.codeHost.push = async () => ({ ok: true })
  assert.equal((await host.run()).status, 'done')

  assert.deepEqual(eventsOf(host, 'step.recorded').map(({ step, outcome }) => [step, outcome]), [['pr_writer', 'done'], ['publish', 'published']])
  assert.equal(eventsOf(host, 'step.started').filter(({ step }) => step === 'publish').length, 1)
})

test('the base of the pull request is the branch the run diffs against, whatever way its ref names it; a ref that names no branch opens none', async () => {
  for (const [ref, base] of [['origin/main', 'main'], ['refs/heads/main', 'main'], ['refs/remotes/origin/main', 'main'], ['team/origin/main', 'team/origin/main'], ['abcdef12-fix', 'abcdef12-fix'], ['fix-abcdef12', 'fix-abcdef12'], ['HEAD', null], ['main~1', null]]) {
    const host = scripted({ config: CONSENTED, git: gitWith({ mergeBases: { main: 'root-0', [ref]: 'root-0' } }) }, (it) => nominal(it))

    await host.start({ base: ref })

    const created = host.codeHost.calls.find((call) => call.startsWith('create '))
    assert.equal(created, base === null ? undefined : `create ${base} <- checkout (draft): Pay by card at checkout`, ref)
  }
})

/** The pr-writer's dispatches. */
const writes = (host) => host.agentRunner.dispatches.filter(({ agent: id }) => id === 'pr-writer')

/** A Git double whose working copy has these merge bases. */
const gitWith = (repository) => new InMemoryGit({ repositories: { '.': repository } })

test('a body past 60,000 characters is cut in its longest section with a fixed mark; the description in the tracking folder keeps it whole', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it, REFS_42))
  host.prWriters.push(prWriter({ why: `${'Customers asked to pay by card.\n'.repeat(2000)}End.`, what: `${'Checkout records it.\n'.repeat(400)}Done.` }))

  const outcome = await host.start(STORY)
  assert.equal(outcome.status, 'done', outcome.reason)

  const body = await host.tracking.read(SLUG, 'pull-request-body.md')
  assert.equal(body.length, 60_000)
  const why = section(body, 'Why')
  assert.match(why, /pay by c?a?r?d?\.?\n?\n\[cut: the description holds more than a pull request takes; read it whole in the tracking folder, pull-request\.md\]$/)
  assert.ok(section(body, 'What changes').endsWith('Checkout records it.\nDone.'))
  assert.ok((await host.tracking.read(SLUG, 'pull-request.md')).includes('pay by card.\nEnd.'))
  assert.equal(host.codeHost.pullRequests[0].body, body)
})
