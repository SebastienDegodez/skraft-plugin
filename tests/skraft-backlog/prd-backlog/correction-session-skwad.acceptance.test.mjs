// The skwad correction sessions ef6d7314 and d25228e0, replayed on a copy of the real EP-001 files:
// S5 (refused, 6 criteria) and S9 (held) carry accepted non-structural corrections; the writer
// must be dispatched for both, whatever their state, in every new session of the same run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runPrdBacklogWorkflow } from '../../../plugins/skraft-backlog/prd-backlog/workflow.mjs'
import { attempt, simulatedContext } from './simulated-ctx.mjs'

const FIXTURE = fileURLToPath(new URL('./fixtures/skwad/session-d25228e0/', import.meta.url))
const ACCEPTED = ['EP-001-S5|size|custom', 'EP-001-S9|size|custom', 'EP-001-S9|lens:planning-dor:G8:ulb3bw|add-examples',
  'EP-001-S9|lens:planning-ac-quality:G4:1pzlza2|clarify-ac', 'EP-001-S9|lens:planning-ac-quality:G4:hgvif1|clarify-ac', 'EP-001-S9|lens:planning-dor:G8:6453kx|add-examples']

const copy = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skwad-d25228e0-'))
  const dir = join(cwd, '.copilot-tracking', 'skraft-plans', 'skwad-prd', 'backlog')
  await cp(join(FIXTURE, 'stories'), join(dir, 'stories'), { recursive: true })
  await cp(join(FIXTURE, 'story-map.json'), join(dir, 'story-map.json'))
  await cp(join(FIXTURE, 'skwad-prd-ep001.md'), join(cwd, 'docs', 'project-planning', 'skwad-prd.md'), { recursive: true }).catch(async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(cwd, 'docs', 'project-planning'), { recursive: true })
    await cp(join(FIXTURE, 'skwad-prd-ep001.md'), join(cwd, 'docs', 'project-planning', 'skwad-prd.md'))
  })
  return { cwd, dir }
}

/** Accept the decisions again as the human did: status edited in corrections.json, times unchanged. */
const reaccept = async (dir, source) => {
  const corrections = JSON.parse(await readFile(source, 'utf8'))
  for (const id of ACCEPTED) {
    corrections.decisions[id].status = 'accepted'
    delete corrections.decisions[id].error
  }
  await writeFile(join(dir, 'corrections.json'), JSON.stringify(corrections), 'utf8')
}

test('skwad d25228e0: S5 (refused) and S9 (held) are written by their corrections, in every new session of the same run journal', async (t) => {
  const { cwd, dir } = await copy()
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await reaccept(dir, join(FIXTURE, 'corrections.json'))
  const journal = new Map()
  const dispatched = []
  const idle = async (call) => {
    dispatched.push(call.label)
    return /planning-/.test(call.label) ? `lens: ${/· (planning-[a-z-]+) ·/.exec(call.label)[1]}\nverdict: pass\ndefects: []` : 'done'
  }
  const session = async () => {
    dispatched.length = 0
    const simulated = simulatedContext({ args: { prd: 'docs/project-planning/skwad-prd.md', repo: 'acme/skwad', corrections: true }, agents: idle, journal })
    await attempt((ctx) => runPrdBacklogWorkflow(ctx, { cwd, now: () => '2026-10-21T15:20:00Z', gh: () => ({ status: 1, stdout: '' }) }), simulated)
    return [...dispatched]
  }

  const first = await session()
  assert.ok(first.includes('write EP-001-S5 · attempt 1') && first.includes('write EP-001-S9 · attempt 1'), first.join('\n'))
  let corrections = JSON.parse(await readFile(join(dir, 'corrections.json'), 'utf8'))
  assert.deepEqual(ACCEPTED.map((id) => corrections.decisions[id].status), ACCEPTED.map(() => 'failed'), 'a writer that changes nothing fails the corrections')
  assert.equal(corrections.decisions['EP-001-S5|size|custom'].error, 'the story file was not rewritten: the correction was not applied')

  await reaccept(dir, join(dir, 'corrections.json'))
  const second = await session()
  assert.ok(second.includes('write EP-001-S5 · attempt 1') && second.includes('write EP-001-S9 · attempt 1'),
    `same run journal, decisions re-accepted with their old times: the writers still run\n${second.join('\n')}`)
  corrections = JSON.parse(await readFile(join(dir, 'corrections.json'), 'utf8'))
  assert.equal(corrections.session.round, 2)
})

test('skwad d25228e0, the real cause: story-writer is not registered — the run is refused at once, or stops at the first empty answer with the decisions still accepted', async (t) => {
  const { cwd, dir } = await copy()
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await reaccept(dir, join(FIXTURE, 'corrections.json'))
  const args = { prd: 'docs/project-planning/skwad-prd.md', repo: 'acme/skwad', corrections: true }
  const host = { cwd, now: () => '2026-10-21T15:20:00Z', gh: () => ({ status: 1, stdout: '' }) }
  const dispatched = []
  const noWriter = async (call) => {
    dispatched.push(call.label)
    if (/story-writer/.test(call.agent)) return null
    return /planning-/.test(call.label) ? `lens: ${/· (planning-[a-z-]+) ·/.exec(call.label)[1]}\nverdict: pass\ndefects: []` : 'done'
  }

  const listed = simulatedContext({ args, agents: noWriter })
  listed.ctx.session = { rpc: { agent: { list: async () => ({ agents: ['backlog-slicer', 'planning-invest-lens', 'planning-ac-quality-lens', 'planning-coherence-lens', 'planning-dor-lens']
    .map((id) => ({ name: `skraft-backlog:${id}` })) }) } } }
  const refused = await attempt((ctx) => runPrdBacklogWorkflow(ctx, host), listed)
  assert.equal(refused.status, 'refused')
  assert.deepEqual(refused.missing, ['story-writer'])
  assert.match(refused.reason, /agents not registered in this session: story-writer — restart the Copilot session, or reinstall the skraft-backlog plugin/)
  assert.deepEqual(dispatched, [], 'no agent is paid for')

  const unlisted = simulatedContext({ args, agents: noWriter })
  const stopped = await attempt((ctx) => runPrdBacklogWorkflow(ctx, host), unlisted)
  assert.equal(stopped.status, 'blocked')
  assert.equal(stopped.phase, 'ELABORATE')
  assert.equal(stopped.cause, 'infrastructure')
  assert.match(stopped.reason, /agent story-writer unavailable: skraft-backlog:story-writer returned nothing/)
  assert.deepEqual(dispatched.filter((l) => /planning-/.test(l)), [], 'no lens runs after the writer is found missing')
  assert.ok(dispatched.filter((l) => l.startsWith('write')).length <= 2, 'at most the writers already started in parallel')
  const corrections = JSON.parse(await readFile(join(dir, 'corrections.json'), 'utf8'))
  assert.deepEqual(ACCEPTED.map((id) => corrections.decisions[id].status), ACCEPTED.map(() => 'accepted'), 'nothing is marked failed: the session can be replayed')
  const progress = JSON.parse(await readFile(join(dir, 'progress.json'), 'utf8'))
  assert.equal(progress.run.status, 'blocked')
})
