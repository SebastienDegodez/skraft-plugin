import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import {
  RESEARCH_TEMPLATE, briefPaths, fillsItsOutputs, fillsThenHostDies, nodeModFs, scriptedModHost, stops, until, writesNothing,
} from './support/scripted-mod-host.mjs'

const NO_ACTIVE =
  'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'
const PENDING_PHASES = '· RESEARCH\n· DESIGN\n· DISTILL\n· DELIVER\n· PUBLISH'
/** The journal of a run that closed RESEARCH and stopped at a blocked architect. */
const STOPPED_IN_DESIGN = ['run.started', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'step.started', 'step.recorded', 'phase.closed', 'step.started', 'step.recorded', 'run.finished']
const ARCHITECT_BLOCKED = 'solution-architect is blocked: needs a decision on the payment provider'

const withHost = (options, body) => async () => {
  const mod = await scriptedModHost(options)
  try {
    await body(mod)
  } finally {
    await mod.cleanup()
  }
}

test('the run reads the developer\'s ~/.skraft/config.json from the home folder $.env names; without one it reads none', async () => {
  const home = await scriptedModHost({ behaviours: [stops()] })
  const none = await scriptedModHost({ behaviours: [stops()], home: null })
  try {
    await nodeModFs.write(join(home.home, '.skraft', 'config.json'), JSON.stringify({ models: { standard: { 'claude-code': { model: 'claude-home' } } } }))
    await home.command('checkout')
    await home.settled()
    await none.command('checkout')
    await none.settled()

    assert.deepEqual([home.spawns[0].model, none.spawns[0].model], ['claude-home', 'sonnet'])
  } finally {
    await home.cleanup()
    await none.cleanup()
  }
})

test('/skraft on a new slug starts at once and spawns the researcher on its output pre-created from the template', withHost({}, async (mod) => {
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
  assert.deepEqual((await mod.journal('checkout'))[0].story, { issue: 42, title: 'Pay by card' })
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

test('a run resumed after the host died once the researcher wrote its document closes RESEARCH without a second spawn', withHost({ behaviours: [fillsThenHostDies()] }, async (mod) => {
  await mod.command('checkout #42')
  await until(() => mod.started() === 1)
  const reloaded = await scriptedModHost({ cwd: mod.root, behaviours: [stops()] })

  const text = await reloaded.command('checkout')
  const outcome = await reloaded.settled()

  assert.equal(text, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(outcome.reason, ARCHITECT_BLOCKED)
  assert.deepEqual(reloaded.spawns.map((spawn) => spawn.description), ['skraft checkout · design · attempt 1'])
  assert.deepEqual((await reloaded.journal('checkout')).map((event) => event.type), STOPPED_IN_DESIGN)
}))

test('the tool starts a named slug with its story, like the command', withHost({ behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  const text = await mod.tool({ slug: 'refund', issue: 7, title: 'Refund a card payment' })
  await mod.settled()

  assert.equal(text, 'skraft refund started — progress in the Skraft pane.')
  assert.ok(mod.spawns[0].prompt.includes('- Story: #7 — Refund a card payment'))
  assert.deepEqual((await mod.journal('refund'))[0].story, { issue: 7, title: 'Refund a card payment' })
}))

test('a second start while a run goes on is refused, and the active pipeline stays', withHost({ behaviours: [fillsThenHostDies()] }, async (mod) => {
  await mod.command('checkout')
  await until(() => mod.started() === 1)

  assert.equal(await mod.command('refund'), 'skraft is already running checkout; see the Skraft pane.')
  assert.equal(await mod.tool({}), 'skraft is already running checkout; see the Skraft pane.')
  assert.equal(await readFile(mod.activeSlugPath, 'utf8'), 'checkout\n')
}))

test('a slug that is not kebab-case is refused by Init and nothing starts', withHost({}, async (mod) => {
  assert.equal(await mod.command('Checkout'), 'skraft Checkout: not started — slug must be kebab-case, got "Checkout"')
  await assert.rejects(access(mod.activeSlugPath))
  assert.deepEqual(mod.published, [])
}))

test('/skraft decide records nothing without an active pipeline or a question it waits on', withHost({ behaviours: [fillsItsOutputs(), stops()] }, async (mod) => {
  assert.match(await mod.command('decide RATIFIED'), /^skraft: not recorded — no active pipeline in this working copy/)
  await mod.command('checkout')
  await mod.settled()
  assert.equal(await mod.command('decide adr-1 RATIFIED'), 'skraft: not recorded — no question adr-1; no question is waiting')
}))

test('a spawn the host rejects blocks the run as agent-unavailable', withHost({ behaviours: [async () => { throw new Error('spawn rejected') }] }, async (mod) => {
  await mod.command('checkout')
  const outcome = await mod.settled()

  assert.equal(outcome.code, 'agent-unavailable')
  assert.equal(outcome.reason, 'skraft:solution-researcher could not be started: spawn rejected')
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
  assert.equal(await mod.command('Bad_Slug'), 'skraft Bad_Slug: not started — slug must be kebab-case, got "Bad_Slug"')
  assert.equal(await mod.tool({}), `skraft: refused (no-active-pipeline) — ${NO_ACTIVE}`)

  const [first, second] = await Promise.all([mod.command('checkout'), mod.tool({ slug: 'refund' })])
  await mod.settled()

  assert.equal(first, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(second, 'skraft is already running checkout; see the Skraft pane.')
  assert.deepEqual(mod.spawns.map((spawn) => spawn.description), ['skraft checkout · research · attempt 1', 'skraft checkout · design · attempt 1'])
  assert.equal(await readFile(mod.activeSlugPath, 'utf8'), 'checkout\n')
}))
