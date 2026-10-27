import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  RESEARCH_TEMPLATE, briefPaths, fillsItsOutputs, fillsThenHostDies, nodeModFs, scriptedModHost, stops, until, writesNothing,
} from './support/scripted-mod-host.mjs'
import { leaseLeftToExpire } from '../support/lease.mjs'
import { ISSUE, issueFile } from '../support/issue-forge.mjs'
import { briefOf } from '../support/pipeline-repository.mjs'

const NO_ACTIVE =
  'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'
const PENDING_PHASES = '· RESEARCH\n· DESIGN\n· DISTILL\n· DELIVER\n· PUBLISH'
/** The journal of a run that closed RESEARCH and stopped at a blocked architect. */
const STOPPED_IN_DESIGN = ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'phase.closed', 'step.started', 'step.recorded', 'run.finished']
/** The same run from the issue #42, each transition told to it, skipped without consent to publish. */
const STOPPED_IN_DESIGN_FROM_ISSUE = STOPPED_IN_DESIGN.flatMap((type) => (type === 'phase.closed' || type === 'run.finished' ? [type, 'issue.comment-skipped'] : [type]))
const ARCHITECT_BLOCKED = 'solution-architect is blocked: needs a decision on the payment provider'

/** forge: the working copy has the story's issue on the forge of issueForge. */
const withHost = ({ forge = false, ...options }, body) => async (t) => {
  const mod = await scriptedModHost({ ...options, ...(forge ? { forge: t } : {}) })
  try {
    await body(mod)
  } finally {
    await mod.cleanup()
  }
}

/** A mod host whose environment names no home folder, and whose node names `nodeHome` (none when null). */
const withoutHomeVariable = (options, nodeHome) => scriptedModHost({ ...options, home: null, nodeHome })

test('the run reads the developer\'s ~/.skraft/config.json from the home folder $.env names, else the one node names; with neither, no new journal starts', async () => {
  const home = await scriptedModHost({ behaviours: [stops()] })
  const nodeHome = `${home.root}-node-home`
  const fromNode = await withoutHomeVariable({ behaviours: [stops()] }, nodeHome)
  const none = await withoutHomeVariable({ behaviours: [stops()] }, null)
  try {
    await nodeModFs.write(join(home.home, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { 'claude-code': { model: 'claude-home' } } } }))
    await nodeModFs.write(join(nodeHome, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { 'claude-code': { model: 'claude-node-home' } } } }))
    await home.command('checkout')
    await home.settled()
    await fromNode.command('checkout')
    await fromNode.settled()

    assert.equal(await none.command('checkout'), 'skraft checkout: not started — the environment names no home folder (HOME or USERPROFILE), where the key that signs the journal is kept; set it and start again')
    assert.deepEqual([home.spawns[0].model, fromNode.spawns[0].model, none.spawns.length], ['claude-home', 'claude-node-home', 0])
    const [{ keyId }] = await fromNode.journal('checkout')
    await access(join(nodeHome, '.skraft', 'journal-keys', `${keyId}.key`))
    await assert.rejects(access(none.journalPath('checkout')))
    const homeless = await withoutHomeVariable({ cwd: home.root }, null)
    assert.match(await homeless.command(''), /journal unverifiable: the environment names no home folder \(HOME or USERPROFILE\), where the key that signs events\.jsonl is kept; set it and run again/)
  } finally {
    await home.cleanup()
    await fromNode.cleanup()
    await none.cleanup()
    await rm(nodeHome, { recursive: true, force: true })
  }
})

test('the mod takes the home folder node names over the one the environment names, as a Node host does on Windows', async () => {
  const mod = await scriptedModHost({ behaviours: [stops()] })
  const nodeHome = `${mod.root}-node-home`
  const both = await scriptedModHost({ cwd: mod.root, behaviours: [stops()], nodeHome })
  try {
    await nodeModFs.write(join(nodeHome, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { 'claude-code': { model: 'claude-node-home' } } } }))
    await nodeModFs.write(join(mod.home, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { 'claude-code': { model: 'claude-env-home' } } } }))
    await both.command('checkout')
    await both.settled()

    assert.equal(both.spawns[0].model, 'claude-node-home')
    const [{ keyId }] = await both.journal('checkout')
    await access(join(nodeHome, '.skraft', 'journal-keys', `${keyId}.key`))
  } finally {
    await mod.cleanup()
    await rm(nodeHome, { recursive: true, force: true })
  }
})

test('/skraft on a new slug starts at once and spawns the researcher on its output pre-created from the template', withHost({ forge: true }, async (mod) => {
  const seen = []
  mod.behaviours.push(async (spawn, control) => {
    seen.push(await nodeModFs.read(briefPaths(spawn.prompt).outputs[0]))
    return fillsItsOutputs()(spawn, control)
  }, stops())

  const text = await mod.command('checkout #42 Pay by card')
  await mod.settled()

  assert.equal(text, 'skraft checkout started — progress in the Skraft pane.')
  assert.deepEqual(mod.spawns.map((spawn) => spawn.subagentType), ['skraft:solution-researcher', 'skraft:solution-architect'])
  const [spawn] = mod.spawns
  assert.equal(spawn.subagentType, 'skraft:solution-researcher')
  assert.equal(spawn.description, 'skraft checkout · research · attempt 1')
  assert.ok(spawn.prompt.includes('- Story: #42 — Pay by card'), spawn.prompt)
  const [output] = briefPaths(spawn.prompt).outputs
  assert.ok(output.startsWith(mod.root), output)
  assert.match(output, /[\\/]\.copilot-tracking\/skraft-plans\/checkout\/research\/\d{4}-\d{2}-\d{2}\/checkout-research\.md$/)
  assert.deepEqual(seen, [RESEARCH_TEMPLATE])
  assert.equal(await readFile(mod.activeSlugPath, 'utf8'), 'checkout\n')
  const [started] = await mod.journal('checkout')
  assert.deepEqual(started.story, { issue: 42, title: 'Pay by card' })
  assert.deepEqual(started.artifacts, [issueFile(started.at.slice(0, 10))])
  assert.deepEqual(briefOf(spawn.prompt).inputs.map((path) => [path.startsWith(mod.root), path.endsWith(`.copilot-tracking/skraft-plans/checkout/${started.artifacts[0]}`)]), [[true, true]])
  assert.equal(await readFile(join(mod.root, '.copilot-tracking', 'skraft-plans', 'checkout', ...started.artifacts[0].split('/')), 'utf8'), `# Issue #42: ${ISSUE.title}\n\n${ISSUE.url}\n\n${ISSUE.body}\n`)
}))

test('a filled research document closes RESEARCH, a blocked architect stops the run in DESIGN; the pane, the log and /skraft say so', withHost({ behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  await mod.command('checkout')
  const outcome = await mod.settled()

  assert.deepEqual(outcome, { status: 'blocked', slug: 'checkout', phase: 'DESIGN', code: 'agent-blocked', reason: ARCHITECT_BLOCKED })
  assert.deepEqual((await mod.journal('checkout')).map((event) => event.type), STOPPED_IN_DESIGN)
  assert.deepEqual(mod.notes, [`skraft checkout: blocked (agent-blocked) — ${ARCHITECT_BLOCKED}`])
  assert.deepEqual(mod.statuses, ['skraft checkout · RESEARCH', 'skraft checkout · DESIGN', undefined])
  const last = mod.published.at(-1)
  assert.equal(last.view.status, 'blocked')
  assert.deepEqual(last.view.phases, [
    { phase: 'RESEARCH', state: 'closed' }, { phase: 'DESIGN', state: 'open' }, { phase: 'DISTILL', state: 'pending' }, { phase: 'DELIVER', state: 'pending' }, { phase: 'PUBLISH', state: 'pending' },
  ])
  assert.deepEqual(last.log, [
    'checkout: publish_consent DECLINED (skraft-config.json sets publish.pullRequest to false)', 'checkout: visuals_consent DECLINED (no component of skraft-config.json is a front end (stack react, or an e2e command), so no screenshot is taken)', 'checkout: solution-researcher, attempt 1', 'checkout: RESEARCH closed', 'checkout: solution-architect, attempt 1',
    `skraft checkout: blocked (agent-blocked) — ${ARCHITECT_BLOCKED}`,
  ])
  assert.equal(await mod.command(''), `skraft checkout — blocked\n✓ RESEARCH\n▶ DESIGN\n· DISTILL\n· DELIVER\n· PUBLISH\n${ARCHITECT_BLOCKED}`)
}))

test('an absent research document is asked again with its missing path; the same failure twice blocks the run', withHost({ behaviours: [writesNothing(), writesNothing()] }, async (mod) => {
  await mod.command('checkout')
  const outcome = await mod.settled()

  assert.equal(mod.spawns.length, 2)
  const { outputs: [output], result } = briefPaths(mod.spawns[0].prompt)
  assert.deepEqual(briefPaths(mod.spawns[0].prompt).missing, [])
  assert.deepEqual(briefPaths(mod.spawns[1].prompt).missing, [output])
  assert.ok(mod.spawns[1].prompt.includes('Missing outputs from attempt 1 of 3:'))
  assert.ok(mod.spawns[1].prompt.includes(`Refused in attempt 1 of 3:\n- result is missing`), mod.spawns[1].prompt)
  assert.deepEqual([result, briefPaths(mod.spawns[1].prompt).result].map((path) => path.split(/[\\/]/).at(-1)), ['research-1-1.json', 'research-1-2.json'])
  assert.equal(mod.spawns[1].description, 'skraft checkout · research · attempt 2')
  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.code, 'missing-outputs')
  assert.equal(mod.notes.at(-1), `skraft checkout: blocked (missing-outputs) — solution-researcher failed the same way on attempts 1 and 2: missing outputs: ${output}; result is missing`)
  assert.match(await mod.command(''), /^skraft checkout — blocked\n▶ RESEARCH\n· DESIGN\n/)
}))

test('a journal edited by hand blocks the run as tampered and spawns nothing', withHost({ behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  await mod.command('checkout')
  await mod.settled()
  const lines = (await readFile(mod.journalPath('checkout'), 'utf8')).split('\n')
  lines[1] = lines[1].replace('"attempt":1', '"attempt":7')
  await writeFile(mod.journalPath('checkout'), lines.join('\n'), 'utf8')

  const restarted = await mod.command('checkout')
  const resumed = await mod.tool({})
  const outcome = await mod.settled()

  assert.equal(restarted, 'skraft checkout: not started — journal tampered: events.jsonl line 3 does not chain to line 2; restore the file or start a new slug')
  assert.equal(resumed, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.code, 'journal-tampered')
  assert.equal(mod.notes.at(-1), `skraft checkout: blocked (journal-tampered) — ${outcome.reason}`)
  assert.equal(mod.spawns.length, 2)
  assert.ok((await mod.command('')).startsWith(`skraft checkout — tampered\n${PENDING_PHASES}\njournal tampered: `))
}))

test('with no slug and no active pipeline, the tool is refused and /skraft shows the idle view', withHost({}, async (mod) => {
  const refused = await mod.tool({})
  const status = await mod.command('   ')

  assert.equal(refused, `skraft: refused (no-active-pipeline) — ${NO_ACTIVE}`)
  assert.equal(status, `skraft — idle\n${PENDING_PHASES}\n${NO_ACTIVE}`)
  assert.equal(mod.spawns.length, 0)
  await assert.rejects(access(mod.activeSlugPath))
}))

test('a run resumed after the host died once the researcher wrote its document closes RESEARCH without a second spawn', withHost({ forge: true, behaviours: [fillsThenHostDies()] }, async (mod) => {
  await mod.command('checkout #42')
  await until(() => mod.started() === 1)
  await leaseLeftToExpire(mod.root, 'checkout')
  const reloaded = await scriptedModHost({ cwd: mod.root, behaviours: [stops()] })

  const text = await reloaded.command('checkout')
  const outcome = await reloaded.settled()

  assert.equal(text, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(outcome.reason, ARCHITECT_BLOCKED)
  assert.deepEqual(reloaded.spawns.map((spawn) => spawn.description), ['skraft checkout · design · attempt 1'])
  assert.deepEqual((await reloaded.journal('checkout')).map((event) => event.type), STOPPED_IN_DESIGN_FROM_ISSUE)
}))

test('the tool starts a named slug with its story, like the command', withHost({ forge: true, behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  const text = await mod.tool({ slug: 'refund', issue: 42, title: 'Refund a card payment' })
  await mod.settled()

  assert.equal(text, 'skraft refund started — progress in the Skraft pane.')
  assert.ok(mod.spawns[0].prompt.includes('- Story: #42 — Refund a card payment'))
  assert.deepEqual((await mod.journal('refund'))[0].story, { issue: 42, title: 'Refund a card payment' })
}))

test('a second start while a run goes on is refused, and the active pipeline stays', withHost({ behaviours: [fillsThenHostDies()] }, async (mod) => {
  await mod.command('checkout')
  await until(() => mod.started() === 1)

  assert.equal(await mod.command('refund'), 'skraft is already running checkout; see the Skraft pane.')
  assert.equal(await mod.tool({}), 'skraft is already running checkout; see the Skraft pane.')
  assert.equal(await readFile(mod.activeSlugPath, 'utf8'), 'checkout\n')
}))

test('a slug that is not kebab-case is refused by Init and nothing starts', withHost({}, async (mod) => {
  assert.equal(await mod.command('Checkout'), 'skraft Checkout: not started — slug must be kebab-case: lowercase letters and digits, joined by single hyphens')
  await assert.rejects(access(mod.activeSlugPath))
  assert.deepEqual(mod.published, [])
}))

test('/skraft decide records nothing without an active pipeline or a question it waits on', withHost({ behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  assert.match(await mod.command('decide RATIFIED'), /^skraft: not recorded — no active pipeline in this working copy/)
  await mod.command('checkout')
  await mod.settled()
  assert.equal(await mod.command('decide adr-1 RATIFIED'), 'skraft: not recorded — no question has that key; no question is waiting')
}))

test('a spawn the host rejects blocks the run as agent-unavailable', withHost({ behaviours: [async () => { throw new Error('spawn rejected') }] }, async (mod) => {
  await mod.command('checkout')
  const outcome = await mod.settled()

  assert.equal(outcome.code, 'agent-unavailable')
  assert.equal(outcome.reason, 'skraft:solution-researcher could not be started')
  assert.deepEqual((await mod.journal('checkout')).map((event) => event.type), ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'run.stopped'])
}))

test('a run that throws is reported as an error and frees the driver for the next start', withHost({ behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  mod.host.sessionCostUsd = async () => { throw new Error('usage unreadable') }
  await mod.command('checkout')
  assert.equal(await mod.settled(), null)
  assert.equal(mod.notes.at(-1), 'skraft checkout: error — usage unreadable')
  assert.equal(mod.published.at(-1).log.at(-1), 'skraft checkout: error — usage unreadable')
  assert.equal(mod.statuses.at(-1), undefined)

  mod.host.sessionCostUsd = async () => null
  mod.host.publish = async () => { throw new Error('pane gone') }
  assert.equal(await mod.command('checkout'), 'skraft checkout started — progress in the Skraft pane.')
  assert.equal((await mod.settled()).reason, ARCHITECT_BLOCKED)
  assert.equal(mod.notes.at(-1), `skraft checkout: blocked (agent-blocked) — ${ARCHITECT_BLOCKED}`)
}))

test('the pane snapshot is published from session start on, as the working copy stands', withHost({}, async (mod) => {
  await mod.driver.refresh(mod.host)
  assert.equal(mod.published.length, 1)
  assert.equal(mod.published[0].view.status, 'idle')
  assert.deepEqual(mod.published[0].log, [])
}))

test('two starts at the same moment launch one run; a refused start leaves the driver free', withHost({ behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  assert.equal(await mod.command('Bad_Slug'), 'skraft Bad_Slug: not started — slug must be kebab-case: lowercase letters and digits, joined by single hyphens')
  assert.equal(await mod.tool({}), `skraft: refused (no-active-pipeline) — ${NO_ACTIVE}`)

  const [first, second] = await Promise.all([mod.command('checkout'), mod.tool({ slug: 'refund' })])
  await mod.settled()

  assert.equal(first, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(second, 'skraft is already running checkout; see the Skraft pane.')
  assert.deepEqual(mod.spawns.map((spawn) => spawn.description), ['skraft checkout · research · attempt 1', 'skraft checkout · design · attempt 1'])
  assert.equal(await readFile(mod.activeSlugPath, 'utf8'), 'checkout\n')
}))
