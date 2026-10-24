import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW, InMemoryCodeHost, InMemoryGit, ScriptedReplay } from '../support/in-memory-host.mjs'
import { edit } from '../workflow/support.mjs'
import { agent, API, finding, lenses, nominal, prWriter, refutes, REFS_42, says, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'
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
  assert.ok(body.startsWith('Closes #42\n\n## What changes\n\nCheckout takes a card payment and records it.\n\n## Why\n\nCustomers asked to pay by card instead of on delivery.\n\n## Decisions applied\n'), body)
  assert.equal(section(body, 'Decisions applied'), 'None recorded: no ADR was ratified and no locked gate was unlocked in this run.')
  assert.deepEqual(section(body, 'Tests'), 'Not recorded yet: this run journals no grid from acceptance criteria to tests.')
  const [distillRed, deliverRed] = eventsOf(host, 'commits.checked').flatMap(({ commits }) => commits).filter(({ kind }) => kind === 'red').map(({ sha }) => sha.slice(0, 7))
  assert.equal(section(body, 'RED evidence'), [
    '| Commit | Subject | Replay exit code |',
    '| --- | --- | ---: |',
    `| \`${distillRed}\` | test(checkout): acceptance of the card payment | 1 |`,
    `| \`${deliverRed}\` | test(checkout): Checkout pays by card | 1 |`,
    '',
    'Output excerpts of the replays are not recorded yet.',
  ].join('\n'))
  assert.equal(section(body, 'Quality gates'), [
    '| Component | Gate | Command | Result | Time | Evidence |',
    '| --- | --- | --- | --- | ---: | --- |',
    '| api | build | `dotnet build` | pass | 0 s | `gates/api/build-1.log` |',
    '| api | test | `dotnet test` | pass | 0 s | `gates/api/test-1.log` |',
    '| api | mutation | `dotnet stryker` | pass | 0 s | `gates/api/mutation-1.log` |',
    '',
    'Mutation survivors left on api: 0.',
  ].join('\n'))
  assert.equal(section(body, 'Review'), 'Every lens of the last pass of each review passed without a finding.')
  assert.equal(section(body, 'Screenshots'), 'Not recorded yet: this run publishes no screenshots.')
  assert.equal(section(body, 'Out of scope and limitations'), 'Refunds are out of scope.')
  assert.ok(section(body, 'Run summary').startsWith('running\n\n| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |\n'), body)
  assert.ok(section(body, 'Run summary').includes('\n| pr_writer | PUBLISH | 1 | 1 | 0 | 0 s | - | done |\n'), body)
  assert.equal(section(body, 'AI disclosure'), 'This pull request was prepared by skraft with AI agents on the model families implementer, planner, researcher, reviewer, standard (the host named no model). ' +
    'What changes, Why and Out of scope were written by the pr-writer agent; every other section is rendered by the engine from the run\'s journal. A human reviews it before it merges.')
  const [opened] = eventsOf(host, 'pull-request.opened')
  assert.deepEqual(opened, { ...opened, number: 42, url: 'https://github.example.com/acme/shop/pull/42', base: 'main', head: 'checkout', draft: true, bodyHash: await host.deps.hasher.sha256(body) })
  assert.deepEqual(eventsOf(host, 'step.recorded').slice(-2).map(({ step, outcome: result, next, reason }) => [step, result, next, reason]), [
    ['pr_writer', 'done', 'publish', undefined],
    ['publish', 'published', 'exit', 'pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42'],
  ])
  assert.ok(host.progress.lines.includes(`${SLUG}: publish: pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42`), host.progress.lines.join('\n'))
})

test('the pr-writer is told where to write its prose and what to read; a summary over 72 characters or an empty section sends it back with what to fix', async () => {
  const host = scripted({ config: CONSENTED }, (it) => nominal(it))
  host.prWriters.push(prWriter({ summary: 'Pay by card at checkout, keeping the card token for the next payments of the customer', why: '' }), prWriter({ summary: 'Pay by card\nat checkout' }))

  await host.start()

  const writes = host.agentRunner.dispatches.filter(({ agent: id }) => id === 'pr-writer')
  assert.deepEqual(writes.map(({ label }) => label), [`skraft ${SLUG} · pr_writer · attempt 1`, `skraft ${SLUG} · pr_writer · attempt 2`, `skraft ${SLUG} · pr_writer · attempt 3`])
  assert.ok(writes[0].prompt.includes(`- Fill each output in place; keep the path, create no other copy:\n- ${TRACKING}/details/2026-10-11/pull-request-prose-${SLUG}.md\n`), writes[0].prompt)
  assert.ok(writes[0].prompt.includes(`- ${TRACKING}/changes/2026-10-11/change-log.md\n`), writes[0].prompt)
  const refused = eventsOf(host, 'step.recorded').find(({ step }) => step === 'pr_writer')
  assert.deepEqual([refused.outcome, refused.code, refused.failures], ['failed', 'pull-request-prose', [
    'pull request prose: Summary is 85 characters; at most 72',
    'pull request prose: Why is empty',
  ]])
  assert.ok(writes[1].prompt.includes('Refused in attempt 1 of 3:\n- pull request prose: Summary is 85 characters; at most 72\n- pull request prose: Why is empty'), writes[1].prompt)
  assert.deepEqual(eventsOf(host, 'step.recorded').filter(({ step }) => step === 'pr_writer').map(({ failures }) => failures)[1], ['pull request prose: Summary must be one line'])
  assert.deepEqual(host.codeHost.calls.at(-1), 'create main <- checkout (draft): Pay by card at checkout')

  const silent = scripted({ config: CONSENTED }, (it) => nominal(it))
  silent.prWriters.push((it) => async () => { it.tracking.files.delete(`${SLUG}/details/2026-10-11/pull-request-prose-${SLUG}.md`) })
  await silent.start()
  const missing = eventsOf(silent, 'step.recorded').find(({ step }) => step === 'pr_writer')
  assert.deepEqual([missing.code, missing.missing, missing.failures], ['missing-outputs', [`details/2026-10-11/pull-request-prose-${SLUG}.md`], ['result is missing']])
})

test('a repository workflow with no consent question and no pr-writer: nothing is pushed, the description says what nobody wrote, and its title is the story\'s, cut to 72 characters', async () => {
  const bare = edit(BUILT_IN_WORKFLOW,
    ['  publish_consent [shape=hexagon, question="publish-consent", phase="RESEARCH"]\n', ''],
    ['start -> publish_consent -> research', 'start -> research'],
    ['  pr_writer [shape=box, agent="pr-writer", phase="PUBLISH"]\n', ''],
    ['  publish  [shape=parallelogram, publish="pull-request"]', '  publish  [shape=parallelogram, publish="pull-request", phase="PUBLISH"]'],
    ['deliver_review -> pr_writer [label="APPROVED"]\n  pr_writer -> publish -> exit', 'deliver_review -> publish [label="APPROVED"]\n  publish -> exit'])
  const title = 'Pay by card at checkout with a saved token, and refund it from the back office'
  const host = scripted({ workflow: bare }, (it) => nominal(it, REFS_42))

  await host.start({ story: { issue: 42, title } })

  assert.deepEqual(host.codeHost.calls, [])
  assert.equal(eventsOf(host, 'step.recorded').at(-1).reason, 'pull request not opened: nobody answered the publish-consent question yet (publish.pullRequest in skraft-config.json); pull-request.md holds its description, and skraft publish opens it once that is fixed')
  const description = await host.tracking.read(SLUG, 'pull-request.md')
  assert.ok(description.startsWith(`${title.slice(0, 71)}…\n\nRefs #42\n\n## What changes\n\nNot written: the run has no pr-writer step that wrote what changes.\n\n## Why\n\nNot written: the run has no pr-writer step that wrote why.\n`), description)
  assert.equal(section(description, 'Out of scope and limitations'), 'Not written: the run has no pr-writer step that wrote what is out of scope.')
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
    [{ config: CONSENTED, codeHost: new InMemoryCodeHost({ open: [{ number: 7, head: 'checkout' }], fails: { edit: 'gh could not update pull request #7' } }) }, 'gh could not update pull request #7', 'Closes'],
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

test('an open pull request of the branch is updated, never opened twice; a draft is asked only when publish.draft is not false', async () => {
  const host = scripted({ config: { publish: { pullRequest: true, draft: false } }, codeHost: new InMemoryCodeHost({ open: [{ number: 7, head: 'checkout' }] }) }, (it) => nominal(it))

  await host.start()

  assert.deepEqual(host.codeHost.calls, ['push checkout', 'find checkout', `edit #7 ${BODY_FILE}`])
  assert.deepEqual(eventsOf(host, 'pull-request.updated').map(({ number, url }) => [number, url]), [[7, 'https://github.example.com/acme/shop/pull/7']])
  assert.equal(eventsOf(host, 'step.recorded').at(-1).reason, 'pull request #7 updated: https://github.example.com/acme/shop/pull/7')

  const ready = scripted({ config: { publish: { draft: false } }, answers: [{ answer: 'ACCEPTED' }] }, (it) => nominal(it))
  await ready.start()
  assert.deepEqual(ready.workspace.config().publish, { draft: false, pullRequest: true })
  assert.deepEqual(ready.codeHost.calls.at(-1), 'create main <- checkout: Pay by card at checkout')
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
})

test('a red commit the engine refused is not shown as evidence, only the one that replaced it', async () => {
  const host = scripted({ config: CONSENTED, replay: new ScriptedReplay({ exits: { 'root-3': 0 } }) }, (it) => [
    ...nominal(it).slice(0, 3),
    agent({ work: ({ git }) => { git.commit('test(checkout): pay passes already', ['tests/PayTests.cs']) } })(it),
    agent({ work: ({ git }) => { git.reset('.', 'root-2'); git.commit('test(checkout): pay fails first', ['tests/PayTests.cs']); git.commit('feat(checkout): pay', ['src/Pay.cs']) } })(it),
  ])

  assert.equal((await host.start()).status, 'done')

  const evidence = section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'RED evidence')
  assert.ok(!evidence.includes('pay passes already'), evidence)
  assert.ok(evidence.includes('| test(checkout): pay fails first | 1 |'), evidence)
})

test('the decisions the description shows: each ADR ratified in the run with its title, each locked gate unlocked with its reason', async () => {
  const adr = '---\nadr: 1\ntitle: Card payment\nstatus: Proposed\nsupersedes: null\nratified_by: null\n---\n\n# ADR-001 — Card payment\n\n**Status:** Proposed\n'
  const host = scripted({ config: CONSENTED, files: { 'docs/adr/adr-001-card-payment.md': adr }, answers: [{ answer: 'RATIFIED' }] }, (it) => [agent()(it), agent()(it), agent()(it), agent({ work: ({ git }) => { git.commit('test(checkout): pay', ['tests/PayTests.cs']); git.commit('feat(checkout): pay', ['src/Pay.cs']) } })(it)])

  await host.start()

  assert.equal(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Decisions applied'), '- ADR-001 Card payment (`docs/adr/adr-001-card-payment.md`), ratified in this run')

  const unlocked = edit(BUILT_IN_WORKFLOW, ['mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true]', 'mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true, unlock="no mutation tool for this stack yet"]'])
  const skipping = scripted({ config: CONSENTED, workflow: unlocked }, (it) => nominal(it))
  await skipping.start()
  assert.equal(section(await skipping.tracking.read(SLUG, 'pull-request-body.md'), 'Decisions applied'), '- Locked gate `mutation` skipped, unlocked: no mutation tool for this stack yet')
})

/** A Git double whose working copy has these merge bases. */
const gitWith = (repository) => new InMemoryGit({ repositories: { '.': repository } })
