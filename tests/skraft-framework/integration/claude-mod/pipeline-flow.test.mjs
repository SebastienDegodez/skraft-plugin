import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { actsAs, scriptedModHost } from './support/scripted-mod-host.mjs'
import {
  LENSES, NOMINAL, PAY, PAY_OR_NOTHING, REFUSED_WORKFLOWS, SECURITY_AGENT, SLOW_CHECK, SLUG, acceptanceWith, componentSkillsBriefed, designateWorkflow, twoRedsThenPay, WRONG_PAY, blocked, briefOf, commit, deliverWith, killsZero, fillOutputs, lensDispatches, lensLabels, pipelineRepository, reviewsOf,
  issueProgressKept, scriptedLlm, visualsKept, writeResult, writesOnly,
} from '../support/pipeline-repository.mjs'
import { git, journal } from '../support/workspace.mjs'
import { NO_PULL_REQUEST, issueForge } from '../support/issue-forge.mjs'

/** `/skraft <args>` on the repository, the scripted LLM answering every spawn, until the run stops. */
const runOn = async (cwd, { acts, reviews, args = SLUG } = {}) => {
  const llm = scriptedLlm({ cwd, acts, reviews })
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(llm) })
  const text = await mod.command(args)
  const outcome = await mod.settled()
  return { text, outcome, mod, spawns: mod.spawns, events: journal(cwd, SLUG) }
}

const recorded = (events, step) => events.filter((event) => event.type === 'step.recorded' && event.step === step)

/** Each checked attempt of a step with the exit code of each commit's replay, null for a commit not replayed. @param {object[]} events */
const replaysOf = (events) => events
  .filter((event) => event.type === 'commits.checked')
  .map(({ step, commits }) => [step, commits.map(({ replay }) => replay?.exitCode ?? null)])

test('/skraft on a repository with a front end leaves its light and dark screenshots committed on the working branch, and the pull request shows them', async (t) => {
  const { cwd } = pipelineRepository(t, { frontend: true, publish: { pullRequest: false, visuals: true } })
  issueForge(t, cwd)

  const { outcome, events } = await runOn(cwd, { args: `${SLUG} #42 Pay by card` })

  assert.equal(outcome.status, 'done', outcome.reason)
  visualsKept(cwd, events)
})

test('/skraft runs the four phases on a real repository: each subagent commits its part, the gates run the tests, DELIVER closes, then PUBLISH writes the pull request', async (t) => {
  const { cwd } = pipelineRepository(t, { publish: null })
  issueForge(t, cwd)

  const { text, outcome, mod, spawns, events } = await runOn(cwd, { args: `${SLUG} #42 Pay by card` })

  assert.equal(text, `skraft ${SLUG} started — progress in the Skraft pane.`)
  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.deepEqual(spawns.map(({ subagentType, description }) => `${subagentType} | ${description}`), [
    `skraft:solution-researcher | skraft ${SLUG} · research · attempt 1`,
    `skraft:solution-architect | skraft ${SLUG} · design · attempt 1`,
    ...lensDispatches('design_review'),
    `skraft:acceptance-designer | skraft ${SLUG} · distill · attempt 1`,
    ...lensDispatches('distill_review'),
    `skraft:software-engineer | skraft ${SLUG} · deliver · attempt 1`,
    ...lensDispatches('deliver_review'),
    `skraft:pr-writer | skraft ${SLUG} · pr_writer · attempt 1`,
  ])
  assert.deepEqual(spawns.filter((spawn) => !spawn.prompt.includes('- Story: #42 — Pay by card')).map(({ subagentType }) => subagentType), ['skraft:cold-reader-lens'])
  assert.deepEqual(reviewsOf(events), [['design_review', 1, 'approved', 'adr'], ['distill_review', 1, 'approved', 'deliver'], ['deliver_review', 1, 'approved', 'visuals']])
  assert.deepEqual(events.filter((event) => event.type === 'phase.closed').map((event) => event.phase), ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'])
  assert.deepEqual(mod.asked.map(({ options }) => [options.header, options.options]).slice(0, 2), [['Pull request', ['ACCEPTED', 'DECLINED']], ['ADR', ['RATIFIED', 'REJECTED']]])
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, 'skraft-config.json'), 'utf8')).publish, { pullRequest: true, questionVersions: { pullRequest: 2 } })
  assert.deepEqual(recorded(events, 'publish').map(({ outcome: result, reason }) => [result, reason]), [['local', `pull request not opened: ${NO_PULL_REQUEST}; pull-request.md holds its description, and skraft publish opens it once that is fixed`]])
  assert.ok(readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'pull-request.md'), 'utf8').startsWith('Pay by card at checkout\n\nRefs #42\n'))
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran').map(({ component, gate, status }) => `${component}/${gate} ${status}`), ['app/test pass', 'app/mutation pass'])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked').map(({ step, commits }) => [step, commits.map(({ kind, verdict, replay }) => `${kind} ${verdict} ${replay?.exitCode ?? '-'}`)]), [
    ['design', ['other ok -']],
    ['distill', ['red ok 1']],
    ['deliver', ['red ok 1', 'green ok -']],
  ])
  assert.deepEqual(events.filter((event) => event.type === 'run.finished').map(({ status }) => status), ['completed'])
  issueProgressKept(cwd, events)
  assert.deepEqual(mod.statuses, [`skraft ${SLUG} · RESEARCH`, `skraft ${SLUG} · DESIGN`, `skraft ${SLUG} · DISTILL`, `skraft ${SLUG} · DELIVER`, `skraft ${SLUG} · PUBLISH`, undefined])
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: gates (build, format, lint, test, architecture, coverage)`), mod.published.at(-1).log.join('\n'))
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: design_review (consistency, architecture-compliance, fitness) — reviewer · economy · haiku`), mod.published.at(-1).log.join('\n'))
  assert.equal(mod.notes.at(-1), `skraft ${SLUG}: done — PUBLISH closed`)
  assert.equal(await mod.command(''), [
    `skraft ${SLUG} — done`, '✓ RESEARCH', '✓ DESIGN', '✓ DISTILL', '✓ DELIVER', '✓ PUBLISH', 'PUBLISH closed',
    'review design_review: approved — consistency pass, architecture-compliance pass, fitness pass',
    'review distill_review: approved — coverage pass, business-alignment pass, testability pass, boundary-enforcement pass',
    'review deliver_review: approved — test-integrity pass, architecture-boundaries pass, cold-reader pass',
    'gates app: test pass, mutation pass',
  ].join('\n'))
})

test('an architect that writes outside its write scope is refused, and its next brief names the file', async (t) => {
  const { cwd } = pipelineRepository(t)
  const hacks = (brief, repository) => {
    NOMINAL['solution-architect'](brief, repository)
    mkdirSync(join(cwd, 'src'))
    writeFileSync(join(cwd, 'src', 'hack.mjs'), 'export const hack = true\n')
  }
  const cleans = (brief) => {
    rmSync(join(cwd, 'src', 'hack.mjs'))
    writeResult(brief, { status: 'done', summary: 'hack removed' })
  }

  const { outcome, spawns, events } = await runOn(cwd, { acts: { 'solution-architect': [hacks, cleans], 'acceptance-designer': [blocked('stop after the design')] } })

  assert.deepEqual(spawns.map((spawn) => spawn.description), [
    `skraft ${SLUG} · research · attempt 1`, `skraft ${SLUG} · design · attempt 1`, `skraft ${SLUG} · design · attempt 2`, ...lensLabels('design_review'),
    `skraft ${SLUG} · distill · attempt 1`,
  ])
  assert.deepEqual(recorded(events, 'design').map(({ attempt, outcome: result, code, failures }) => [attempt, result, code, failures]), [
    [1, 'failed', 'write-scope', ['out of write scope: src/hack.mjs']],
    [2, 'done', null, []],
  ])
  assert.ok(spawns[2].prompt.includes('Refused in attempt 1 of 3:\n- out of write scope: src/hack.mjs'), spawns[2].prompt)
  assert.deepEqual([outcome.phase, outcome.code, outcome.reason], ['DISTILL', 'agent-blocked', 'acceptance-designer is blocked: stop after the design'])
})

test('a researcher that writes the same invalid result twice is blocked without a third spawn', async (t) => {
  const { cwd } = pipelineRepository(t)
  const invalid = writesOnly('{"status": "finished", "summary": "all good"}')

  const { outcome, spawns, mod } = await runOn(cwd, { acts: { 'solution-researcher': [invalid, invalid, NOMINAL['solution-researcher']] } })

  const { result } = briefOf(spawns[0].prompt)
  assert.equal(spawns.length, 2)
  assert.ok(spawns[1].prompt.includes(`Refused in attempt 1 of 3:\n- result status must be "done" or "blocked"`), spawns[1].prompt)
  assert.deepEqual([result, briefOf(spawns[1].prompt).result].map((path) => path.split(/[\\/]/).at(-1)), ['research-1-1.json', 'research-1-2.json'])
  assert.deepEqual(outcome, {
    status: 'blocked', slug: SLUG, phase: 'RESEARCH', code: 'invalid-result',
    reason: `solution-researcher failed the same way on attempts 1 and 2: result status must be "done" or "blocked"`,
  })
  assert.equal(mod.notes.at(-1), `skraft ${SLUG}: blocked (invalid-result) — ${outcome.reason}`)
})

test('gates that fail send DELIVER back as pass 2 with the failing gate in its brief, then the run completes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, spawns, events, mod } = await runOn(cwd, { acts: { 'software-engineer': [deliverWith(WRONG_PAY)] } })

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  const delivering = spawns.slice(3 + LENSES.design_review.length + LENSES.distill_review.length)
  assert.deepEqual(delivering.map((spawn) => spawn.description), [`skraft ${SLUG} · deliver · attempt 1`, `skraft ${SLUG} · deliver · pass 2 · attempt 1`, ...lensLabels('deliver_review'), `skraft ${SLUG} · pr_writer · attempt 1`])
  assert.ok(delivering[1].prompt.includes('- Pass: 2, after the gates sent the work back'), delivering[1].prompt)
  assert.match(delivering[1].prompt, /\nThe gates failed on pass 1:\n- app\/test: exited 1 \(evidence: .+test-1\.log\)/)
  assert.deepEqual(recorded(events, 'gates').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'fail', 'deliver'], [2, 'pass', 'mutation']])
  assert.deepEqual(recorded(events, 'mutation').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'pass', 'deliver_review']])
  assert.deepEqual(recorded(events, 'deliver_review').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'approved', 'visuals']])
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: software-engineer, pass 2, attempt 1 — implementer · standard · sonnet`), mod.published.at(-1).log.join('\n'))
  assert.equal(git(cwd, 'show', 'HEAD:src/pay.mjs'), 'export const pay = (amount) => `paid ${amount}`')
})

test('mutants that survive send the run to one spawn per file, test-integrity on its tests, then the gates again until mutation passes', async (t) => {
  const { cwd } = pipelineRepository(t)

  const { outcome, spawns, events, mod } = await runOn(cwd, { acts: { 'software-engineer': [deliverWith(PAY_OR_NOTHING), killsZero] } })

  const kills = spawns.filter(({ description }) => description.includes(' · kill_mutants · '))
  assert.ok(spawns.some(({ subagentType, description }) => subagentType === 'skraft:test-integrity-lens' && description === `skraft ${SLUG} · mutation_review · test-integrity · attempt 1`))
  assert.equal(kills[0].subagentType, 'skraft:software-engineer')
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: mutation (mutation)`), mod.published.at(-1).log.join('\n'))
  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'PUBLISH', code: null, reason: 'PUBLISH closed' })
  assert.deepEqual(kills.map(({ description }) => description), [`skraft ${SLUG} · kill_mutants · group 1 of 1 · attempt 1`])
  assert.ok(kills[0].prompt.includes('Kill the surviving mutants of src/pay.mjs (group 1 of 1):\n- src/pay.mjs:1 EqualityOperator (>=) survived'), kills[0].prompt)
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran').map(({ gate, status, survivors }) => `${gate} ${status}${survivors ? ` ${survivors}` : ''}`), ['test pass', 'mutation fail 1', 'test pass', 'mutation pass'])
  assert.deepEqual(recorded(events, 'mutation').map(({ visit, outcome: result, next }) => [visit, result, next]), [[1, 'fail', 'kill_mutants'], [2, 'pass', 'deliver_review']])
  assert.deepEqual(reviewsOf(events).filter(([step]) => step === 'mutation_review'), [['mutation_review', 1, 'approved', 'gates']])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'kill_mutants').flatMap(({ commits }) => commits.map(({ subject, kind, verdict, replay }) => [subject, kind, verdict, replay])), [
    [`test(${SLUG}): pay nothing for zero`, 'red', 'ok', null],
  ])
})

test('a test commit whose tests pass is refused as not red', async (t) => {
  const { cwd } = pipelineRepository(t)
  const green = (brief) => {
    fillOutputs(brief)
    commit(cwd, `test(${SLUG}): pay by card`, { 'tests/unit/check.mjs': "console.log('nothing checked')\n" })
    writeResult(brief, { status: 'done', summary: 'acceptance test committed' })
  }

  const { outcome, spawns, events } = await runOn(cwd, { acts: { 'acceptance-designer': [green, blocked('cannot make it fail')] } })

  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const refusal = `commit ${sha} "test(${SLUG}): pay by card" is not red: the tests of app pass at it; a test commit must fail before the code that makes it pass`
  assert.deepEqual(recorded(events, 'distill').map(({ code, failures }) => [code, failures]), [['tdd', [refusal]], ['agent-blocked', ['cannot make it fail']]])
  const retried = spawns.find((spawn) => spawn.description === `skraft ${SLUG} · distill · attempt 2`)
  assert.ok(retried.prompt.includes(`Refused in attempt 1 of 3:\n- ${refusal}`), retried.prompt)
  assert.deepEqual([outcome.code, outcome.reason], ['agent-blocked', 'acceptance-designer is blocked: cannot make it fail'])
})

test('replaying red commits for more than a fifth of a phase warns the developer of each phase it happens in, in the pane, with the way to replay less; with last-red only the last red commit of the story is replayed, and nothing is said', async (t) => {
  const acts = { 'acceptance-designer': [acceptanceWith(SLOW_CHECK)], 'software-engineer': [twoRedsThenPay] }
  const every = pipelineRepository(t)
  const lastRed = pipelineRepository(t, { tdd: { replay: 'last-red' } })

  const all = await runOn(every.cwd, { acts })
  const last = await runOn(lastRed.cwd, { acts })

  assert.deepEqual([all.outcome.status, last.outcome.status], ['done', 'done'], `${all.outcome.reason} / ${last.outcome.reason}`)
  assert.deepEqual(replaysOf(all.events), [['design', [null]], ['distill', [1]], ['deliver', [1, 1, null]]])
  const slow = all.events.filter((event) => event.type === 'tdd.replay-slow')
  assert.deepEqual(slow.map(({ phase }) => phase), ['DISTILL', 'DELIVER'])
  assert.ok(slow.every(({ replayMs, phaseMs }) => replayMs >= 1000 && replayMs > 0.2 * phaseMs), JSON.stringify(slow))
  const warnings = (mod) => mod.published.at(-1).log.filter((line) => line.includes('replaying test commits took'))
  assert.deepEqual(warnings(all.mod).map((line) => line.replace(/took \d+%/, 'took N%')), ['DISTILL', 'DELIVER'].map((phase) => `${SLUG}: replaying test commits took N% of ${phase}; set "tdd": { "replay": "last-red" } in skraft-config.json to replay only the last test commit of each story`))
  assert.deepEqual(replaysOf(last.events), [['design', [null]], ['distill', [1]], ['deliver', [null, 1, null]]])
  assert.deepEqual(last.events.filter((event) => event.type === 'tdd.replay-slow'), [])
  assert.deepEqual(warnings(last.mod), [])
})

test('the software engineer\'s spawn opens with the SKILL.md of each skill its components ask for, from .claude/skills/ or the plugin, and names the one found nowhere', async (t) => {
  const skillFolder = '.claude/skills/mocking-inprocess-javascript'
  const { cwd } = pipelineRepository(t, { contractTesting: true, skills: [skillFolder] })

  const { outcome, spawns } = await runOn(cwd, { acts: { 'software-engineer': [blocked('stop after reading the brief')] } })

  assert.equal(outcome.reason, 'software-engineer is blocked: stop after reading the brief')
  componentSkillsBriefed(cwd, skillFolder, spawns.map(({ prompt }) => prompt))
})

test('a feat commit with no test commit before it in the pass is refused, the acceptance test of DISTILL notwithstanding', async (t) => {
  const { cwd } = pipelineRepository(t)
  const greenFirst = (brief) => {
    fillOutputs(brief, 'Paid by card.\n')
    commit(cwd, `feat(${SLUG}): pay by card`, { 'src/pay.mjs': PAY }, brief)
    writeResult(brief, { status: 'done', summary: 'delivered' })
  }

  const { outcome, spawns, events } = await runOn(cwd, { acts: { 'software-engineer': [greenFirst, blocked('cannot rewrite the history')] } })

  const sha = git(cwd, 'rev-parse', '--short=7', 'HEAD')
  const refusal = `commit ${sha} "feat(${SLUG}): pay by card" makes code pass with no test commit since the last feat or fix; rewrite it after a failing test commit`
  assert.deepEqual(recorded(events, 'deliver').map(({ outcome: result, code, failures }) => [result, code, failures]), [['failed', 'tdd', [refusal]], ['failed', 'agent-blocked', ['cannot rewrite the history']]])
  assert.deepEqual(events.filter((event) => event.type === 'commits.checked' && event.step === 'deliver').map(({ commits }) => commits.map(({ kind, verdict, replay }) => [kind, verdict, replay])), [[['green', 'green-without-red', null]]])
  const retried = spawns.find((spawn) => spawn.description === `skraft ${SLUG} · deliver · attempt 2`)
  assert.ok(retried.prompt.includes(`Refused in attempt 1 of 3:\n- ${refusal}`), retried.prompt)
  assert.deepEqual(events.filter((event) => event.type === 'gate.ran'), [])
  assert.deepEqual([outcome.status, outcome.phase, outcome.code, outcome.reason], ['blocked', 'DELIVER', 'agent-blocked', 'software-engineer is blocked: cannot rewrite the history'])
})

test('a repository workflow spawns its own agent between the architect and the acceptance designer, under its bare id', async (t) => {
  const { cwd } = pipelineRepository(t, { security: true })

  const { outcome, spawns, mod } = await runOn(cwd)

  assert.deepEqual(outcome, { status: 'done', slug: SLUG, phase: 'DELIVER', code: null, reason: 'DELIVER closed' })
  const agents = spawns.filter(({ subagentType }) => !subagentType.endsWith('-lens') && !subagentType.endsWith('finding-refuter'))
  assert.deepEqual(agents.map(({ subagentType }) => subagentType), [
    'skraft:solution-researcher', 'skraft:solution-architect', SECURITY_AGENT, 'skraft:acceptance-designer', 'skraft:software-engineer',
  ])
  assert.equal(agents[2].description, `skraft ${SLUG} · security · attempt 1`)
  assert.ok(mod.published.at(-1).log.includes(`${SLUG}: ${SECURITY_AGENT}, attempt 1 — implementer · standard · sonnet`))
})

test('a repository workflow that drops a locked gate without unlock, loops without max_visits, holds a node the start cannot reach or names an agent nobody provides is refused before any spawn, with its reason', async (t) => {
  const { cwd } = pipelineRepository(t, { security: true })
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(scriptedLlm({ cwd })) })

  const texts = []
  for (const { workflow } of REFUSED_WORKFLOWS) {
    designateWorkflow(cwd, workflow)
    texts.push(await mod.command(SLUG))
  }

  assert.deepEqual(texts, REFUSED_WORKFLOWS.map(({ reason }) => `skraft ${SLUG}: not started — ${reason}`))
  assert.deepEqual(mod.spawns, [])
  assert.equal(existsSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'events.jsonl')), false)
})

test('/skraft <slug> --from-artifacts starts in DESIGN from the stories the mod finds through Git, and is refused without them', async (t) => {
  const { cwd } = pipelineRepository(t)
  const refused = await scriptedModHost({ cwd })
  assert.equal(await refused.command(`${SLUG} --from-artifacts`), `skraft ${SLUG}: not started — ${SLUG} has no DISCUSS stories (plans/<date>/stories-<milestone>.md) to start from`)
  assert.deepEqual(refused.spawns, [])

  const stories = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'plans', '2026-10-01', 'stories-v1.md')
  mkdirSync(join(stories, '..'), { recursive: true })
  writeFileSync(stories, '# Stories\n\n- Pay by card\n')
  const { outcome, spawns, events } = await runOn(cwd, { args: `${SLUG} --from-artifacts`, acts: { 'solution-architect': [blocked('stop after reading the stories')] } })

  assert.deepEqual(events.slice(0, 2).map(({ type, phase, skipped }) => [type, phase ?? null, skipped ?? null]), [['run.started', null, null], ['phase.closed', 'RESEARCH', 'from-artifacts']])
  assert.deepEqual(events[0].artifacts, ['plans/2026-10-01/stories-v1.md'])
  assert.deepEqual(spawns.map((spawn) => spawn.subagentType), ['skraft:solution-architect'])
  const scan = join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'details', new Date().toISOString().slice(0, 10), 'structural-scan.json')
  assert.deepEqual(briefOf(spawns[0].prompt).inputs.map((path) => path.replace(/\\/g, '/')), [stories, scan].map((path) => path.replace(/\\/g, '/')))
  assert.equal(outcome.reason, 'solution-architect is blocked: stop after reading the stories')
})
