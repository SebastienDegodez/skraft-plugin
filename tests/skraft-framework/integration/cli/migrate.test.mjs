import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pipelineRepository } from '../support/pipeline-repository.mjs'
import { journal, readJson, skraft } from '../support/workspace.mjs'

const tracking = (cwd, ...parts) => join(cwd, '.copilot-tracking', 'skraft-plans', ...parts)

/** A repository left by skraft v1: a run in DISTILL, a finished one, and the v1 key in its configuration. */
const leftByV1 = (t) => {
  const { cwd } = pipelineRepository(t)
  const config = readJson(join(cwd, 'skraft-config.json'))
  writeFileSync(join(cwd, 'skraft-config.json'), `${JSON.stringify({ trackingLayout: 'namespaced', ...config }, null, 2)}\n`)
  const state = JSON.stringify({ projectSlug: 'checkout-flow', currentPhase: 'DISTILL', phasesCompleted: ['RESEARCH', 'DESIGN'], verdicts: { DESIGN: 'APPROVED' }, phaseArtifacts: { DESIGN: ['../elsewhere/adr.md'] } })
  for (const [slug, text] of [['checkout-flow', state], ['shipped', JSON.stringify({ currentPhase: 'DONE' })]]) {
    mkdirSync(tracking(cwd, slug), { recursive: true })
    writeFileSync(tracking(cwd, slug, 'state.json'), text)
  }
  return { cwd, config, state }
}

test('skraft migrate --dry-run shows what it would write and writes nothing', async (t) => {
  const { cwd, config } = leftByV1(t)

  const shown = await skraft(cwd, ['migrate', '--dry-run'])

  assert.equal(shown.status, 0, shown.stderr)
  const lines = shown.stdout.split('\n')
  assert.equal(lines[0], 'skraft-config.json: dropped trackingLayout; skraft init would then list the components it finds; their bases are not shown')
  assert.equal(lines[1], 'would write skraft-config.json:')
  assert.ok(lines.includes('would-migrate  checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; 1 artefact path of the completed phases dropped (outside-run 1); resume it with skraft init checkout-flow'), shown.stdout)
  assert.ok(lines.some((line) => line.startsWith('  would append: {"type":"run.started","slug":"checkout-flow"')), shown.stdout)
  assert.ok(lines.includes('  would append: {"type":"phase.closed","phase":"DESIGN"}'), shown.stdout)
  assert.ok(lines.includes('skipped  shipped: the v1 run is DONE; nothing to migrate'), shown.stdout)
  assert.equal(lines.at(-2), 'skraft migrate: 1 to migrate (dry run: nothing written), 1 skipped, 0 refused')
  assert.equal(existsSync(tracking(cwd, 'checkout-flow', 'events.jsonl')), false)
  assert.equal(readJson(join(cwd, 'skraft-config.json')).trackingLayout, 'namespaced')
  assert.deepEqual(readJson(join(cwd, 'skraft-config.json')).components, config.components)
})

test('skraft migrate writes the journal of the v1 run in progress, keeps state.json, and the run resumes with skraft init', async (t) => {
  const { cwd, config, state } = leftByV1(t)

  const migrated = await skraft(cwd, ['migrate'])

  assert.equal(migrated.status, 0, migrated.stderr)
  assert.equal(migrated.stdout.split('\n').at(-2), 'skraft migrate: 1 migrated, 1 skipped, 0 refused')
  assert.deepEqual(readJson(join(cwd, 'skraft-config.json')), config)
  assert.equal(readFileSync(tracking(cwd, 'checkout-flow', 'state.json'), 'utf8'), state)
  assert.deepEqual(journal(cwd, 'checkout-flow').map(({ type, start, phase, migratedFrom }) => [type, start ?? phase, migratedFrom]), [
    ['run.started', 'distill', 'v1'],
    ['phase.closed', 'RESEARCH', undefined],
    ['phase.closed', 'DESIGN', undefined],
  ])
  assert.equal(existsSync(tracking(cwd, 'shipped', 'events.jsonl')), false)

  const again = await skraft(cwd, ['migrate', '--json'])
  assert.equal(again.status, 0, again.stderr)
  assert.deepEqual(JSON.parse(again.stdout).pipelines.map(({ slug, code }) => [slug, code]), [['checkout-flow', 'already-migrated'], ['shipped', 'done']])
  assert.equal(journal(cwd, 'checkout-flow').length, 3)

  assert.equal((await skraft(cwd, ['init', 'checkout-flow'])).status, 0)
  const status = await skraft(cwd, ['status'])
  assert.deepEqual(status.stdout.split('\n').slice(0, 4), ['skraft checkout-flow: running', 'RESEARCH  closed', 'DESIGN  closed', 'DISTILL  pending'])
})

test('skraft migrate refuses a state.json outside the v1 schema and exits 1', async (t) => {
  const { cwd } = leftByV1(t)
  writeFileSync(tracking(cwd, 'checkout-flow', 'state.json'), JSON.stringify({ currentPhase: 'DESIGN', version: 2 }))

  const refused = await skraft(cwd, ['migrate'])

  assert.equal(refused.status, 1)
  assert.ok(refused.stdout.includes('refused  checkout-flow: state.json holds a field the v1 state schema does not declare; nothing was migrated\n'), refused.stdout)
  assert.equal(existsSync(tracking(cwd, 'checkout-flow', 'events.jsonl')), false)
})

test('skraft migrate takes no argument but --dry-run and --json', async (t) => {
  const { cwd } = leftByV1(t)

  assert.equal((await skraft(cwd, ['migrate', 'checkout-flow'])).status, 2)
  assert.equal((await skraft(cwd, ['migrate', '--force'])).status, 2)
})
