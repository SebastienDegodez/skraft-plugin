import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import {
  RESEARCH_TEMPLATE, briefPaths, fillsItsOutputs, fillsThenHostDies, nodeModFs, scriptedModHost, until, writesNothing,
} from './support/scripted-mod-host.mjs'

const NO_ACTIVE =
  'no active pipeline in this working copy (.copilot-tracking/skraft-plans/.active-slug); start one with an explicit slug'

const withHost = (options, body) => async () => {
  const mod = await scriptedModHost(options)
  try {
    await body(mod)
  } finally {
    await mod.cleanup()
  }
}

test('/skraft on a new slug starts at once and spawns the researcher on its output pre-created from the template', withHost({}, async (mod) => {
  const seen = []
  mod.behaviours.push(async (spawn, control) => {
    seen.push(await nodeModFs.read(briefPaths(spawn.prompt).outputs[0]))
    return fillsItsOutputs()(spawn, control)
  })

  const text = await mod.command('checkout #42 Pay by card')
  await mod.settled()

  assert.equal(text, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(mod.spawns.length, 1)
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

test('a filled research document closes RESEARCH; the pane, the log and /skraft say so', withHost({ behaviours: [fillsItsOutputs()] }, async (mod) => {
  await mod.command('checkout')
  const outcome = await mod.settled()

  assert.deepEqual(outcome, { status: 'done', slug: 'checkout', phase: 'RESEARCH', code: null, reason: 'RESEARCH closed' })
  assert.deepEqual((await mod.journal('checkout')).map((event) => event.type), [
    'run.started', 'step.started', 'step.recorded', 'phase.closed', 'run.finished',
  ])
  assert.deepEqual(mod.notes, ['skraft checkout: done — RESEARCH closed'])
  assert.deepEqual(mod.statuses, ['skraft checkout · RESEARCH', undefined])
  const last = mod.published.at(-1)
  assert.equal(last.view.status, 'done')
  assert.deepEqual(last.view.phases, [{ phase: 'RESEARCH', state: 'closed' }])
  assert.deepEqual(last.log, [
    'checkout: solution-researcher, attempt 1', 'checkout: RESEARCH closed', 'skraft checkout: done — RESEARCH closed',
  ])
  assert.equal(await mod.command(''), 'skraft checkout — done\n✓ RESEARCH\nRESEARCH closed')
}))

test('an absent research document is asked again with its missing path, then the run is blocked at the ceiling', withHost({ behaviours: [writesNothing(), writesNothing()] }, async (mod) => {
  await mod.command('checkout')
  const outcome = await mod.settled()

  assert.equal(mod.spawns.length, 2)
  const [output] = briefPaths(mod.spawns[0].prompt).outputs
  assert.deepEqual(briefPaths(mod.spawns[0].prompt).missing, [])
  assert.deepEqual(briefPaths(mod.spawns[1].prompt).missing, [output])
  assert.ok(mod.spawns[1].prompt.includes('Missing outputs from attempt 1 of 2:'))
  assert.equal(mod.spawns[1].description, 'skraft checkout · research · attempt 2')
  assert.equal(outcome.status, 'blocked')
  assert.equal(outcome.code, 'missing-outputs')
  assert.equal(mod.notes.at(-1), `skraft checkout: blocked (missing-outputs) — solution-researcher left required outputs missing after 2 attempts: ${output}`)
  assert.match(await mod.command(''), /^skraft checkout — blocked\n▶ RESEARCH\n/)
}))

test('a journal edited by hand blocks the run as tampered and spawns nothing', withHost({ behaviours: [fillsItsOutputs()] }, async (mod) => {
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
  assert.equal(mod.spawns.length, 1)
  assert.match(await mod.command(''), /^skraft checkout — tampered\n· RESEARCH\njournal tampered: /)
}))

test('with no slug and no active pipeline, the tool is refused and /skraft shows the idle view', withHost({}, async (mod) => {
  const refused = await mod.tool({})
  const status = await mod.command('   ')

  assert.equal(refused, `skraft: refused (no-active-pipeline) — ${NO_ACTIVE}`)
  assert.equal(status, `skraft — idle\n· RESEARCH\n${NO_ACTIVE}`)
  assert.equal(mod.spawns.length, 0)
  await assert.rejects(access(mod.activeSlugPath))
}))

test('a run resumed after the host died once the researcher wrote its document closes RESEARCH without a second spawn', withHost({ behaviours: [fillsThenHostDies()] }, async (mod) => {
  await mod.command('checkout #42')
  await until(() => mod.started() === 1)
  const reloaded = await scriptedModHost({ cwd: mod.root })

  const text = await reloaded.command('checkout')
  const outcome = await reloaded.settled()

  assert.equal(text, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(outcome.status, 'done')
  assert.equal(reloaded.spawns.length, 0)
  assert.deepEqual((await reloaded.journal('checkout')).map((event) => event.type), [
    'run.started', 'step.started', 'step.recorded', 'phase.closed', 'run.finished',
  ])
}))

test('the tool starts a named slug with its story, like the command', withHost({ behaviours: [fillsItsOutputs()] }, async (mod) => {
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

test('/skraft decide answers that no question is pending', withHost({ behaviours: [fillsItsOutputs()] }, async (mod) => {
  assert.equal(await mod.command('decide checkout research yes'), 'skraft: no question is pending; nothing to decide.')
  await mod.command('checkout')
  await mod.settled()
  assert.equal(await mod.command('decide'), 'skraft: no question is pending for checkout; nothing to decide.')
}))

test('a spawn the host rejects blocks the run as agent-unavailable', withHost({ behaviours: [async () => { throw new Error('spawn rejected') }] }, async (mod) => {
  await mod.command('checkout')
  const outcome = await mod.settled()

  assert.equal(outcome.code, 'agent-unavailable')
  assert.equal(outcome.reason, 'skraft:solution-researcher could not be started: spawn rejected')
  assert.deepEqual((await mod.journal('checkout')).map((event) => event.type), ['run.started', 'step.started', 'run.stopped'])
}))

test('a run that throws is reported as an error and frees the driver for the next start', withHost({ behaviours: [fillsItsOutputs()] }, async (mod) => {
  mod.host.sessionCostUsd = async () => { throw new Error('usage unreadable') }
  await mod.command('checkout')
  assert.equal(await mod.settled(), null)
  assert.equal(mod.notes.at(-1), 'skraft checkout: error — usage unreadable')
  assert.equal(mod.published.at(-1).log.at(-1), 'skraft checkout: error — usage unreadable')
  assert.equal(mod.statuses.at(-1), undefined)

  mod.host.sessionCostUsd = async () => null
  mod.host.publish = async () => { throw new Error('pane gone') }
  assert.equal(await mod.command('checkout'), 'skraft checkout started — progress in the Skraft pane.')
  assert.equal((await mod.settled()).status, 'done')
  assert.equal(mod.notes.at(-1), 'skraft checkout: done — RESEARCH closed')
}))

test('the pane snapshot is published from session start on, as the working copy stands', withHost({}, async (mod) => {
  await mod.driver.refresh(mod.host)
  assert.equal(mod.published.length, 1)
  assert.equal(mod.published[0].view.status, 'idle')
  assert.deepEqual(mod.published[0].log, [])
}))

test('two starts at the same moment launch one run; a refused start leaves the driver free', withHost({ behaviours: [fillsItsOutputs()] }, async (mod) => {
  assert.equal(await mod.command('Bad_Slug'), 'skraft Bad_Slug: not started — slug must be kebab-case, got "Bad_Slug"')
  assert.equal(await mod.tool({}), `skraft: refused (no-active-pipeline) — ${NO_ACTIVE}`)

  const [first, second] = await Promise.all([mod.command('checkout'), mod.tool({ slug: 'refund' })])
  await mod.settled()

  assert.equal(first, 'skraft checkout started — progress in the Skraft pane.')
  assert.equal(second, 'skraft is already running checkout; see the Skraft pane.')
  assert.equal(mod.spawns.length, 1)
  assert.equal(await readFile(mod.activeSlugPath, 'utf8'), 'checkout\n')
}))
