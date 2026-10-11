import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTrackingFolder } from '../../eng/regression/tracking-folder.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const cli = join(repoRoot, 'eng', 'regression', 'cli.mjs')
const v1Dir = join(here, 'fixtures', 'v1-tracking')
const v2Dir = join(here, 'fixtures', 'v2-tracking')

const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: repoRoot })

test('reader detects the format from the folder content', () => {
  assert.equal(readTrackingFolder(v1Dir).format, 'v1')
  assert.equal(readTrackingFolder(v2Dir).format, 'v2')
  assert.deepEqual(readTrackingFolder(v1Dir).summary.verdicts.DESIGN, ['NEEDS_REWORK', 'APPROVED'])
})

test('compare on a v1 and a v2 tracking folder writes the report and fails on regressions', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'skraft-regression-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const out = join(tmp, 'report.md')

  const res = run(['compare', '--v1', v1Dir, '--v2', v2Dir, '--fixture', 'payment', '--out', out])

  assert.equal(res.status, 1, res.stderr)
  const md = readFileSync(out, 'utf8')
  assert.match(md, /regression check — `payment`/)
  assert.match(md, /\| phases \| RESEARCH, DESIGN, DISTILL, DELIVER \| RESEARCH \| regression \|/)
  assert.match(md, /\| gate refund\/G1 \| pass \| fail \| regression \|/)
  assert.match(md, /\| artefact design\/architecture\.md \| present \| missing \| regression \|/)
  assert.match(md, /\| artefact research\/report\.md \| present \| present \| same \|/)
  assert.doesNotMatch(md, /execution-log|state\.json|events\.jsonl/)
})

test('compare prints to stdout without --out and exits 0 when every regression is waived', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'skraft-regression-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const first = run(['compare', '--v1', v1Dir, '--v2', v2Dir, '--fixture', 'payment', '--json'])
  const regressions = JSON.parse(first.stdout).filter((f) => f.severity === 'regression')
  assert.ok(regressions.length > 0)
  const waivers = join(tmp, 'regression-waivers.json')
  writeFileSync(waivers, JSON.stringify(regressions.map((f) => ({ criterion: f.criterion, fixture: 'payment', reason: 'lot 1 covers RESEARCH only' }))))

  const res = run(['compare', '--v1', v1Dir, '--v2', v2Dir, '--fixture', 'payment', '--waivers', waivers])

  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /No unwaived regression/)
})

test('usage errors exit 2 with a message', () => {
  const res = run(['compare', '--v1', v1Dir])
  assert.equal(res.status, 2)
  assert.match(res.stderr, /--v2/)
  assert.equal(run(['bogus']).status, 2)
  assert.equal(run(['compare', '--v1', v1Dir, '--v2', join(here, 'fixtures', 'nope')]).status, 2)
})

test('prepare-v1 refuses a missing --dir without touching git', () => {
  const res = run(['prepare-v1', '--ref', 'main'])
  assert.equal(res.status, 2)
  assert.match(res.stderr, /--dir/)
})
