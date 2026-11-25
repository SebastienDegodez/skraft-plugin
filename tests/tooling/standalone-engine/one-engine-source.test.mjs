import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { compareEngines, translate } from '../../../scripts/standalone-engine.mjs'

const write = (root, files) => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

test('a source file reads in the copy with the delivery plugin\'s names, the DESIGN phase\'s records check kept as it is', () => {
  const source = "import { x } from './design-records.mjs'\n// skraft_design_next, SKRAFT_DESIGN_JOURNAL_KEY, Skraft Design - Orchestrator, design-finding-refuter in skraft-design\n"
  assert.equal(translate(source), "import { x } from './design-records.mjs'\n// skraft_deliver_next, SKRAFT_DELIVER_JOURNAL_KEY, Skraft Deliver - Orchestrator, deliver-finding-refuter in skraft-deliver\n")
})

test('the comparison names a copy that drifted, one missing, and one only the copy holds; owned and pending files are left alone', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'standalone engine '))
  t.after(() => rm(root, { recursive: true, force: true }))
  write(root, {
    'design/a.mjs': "export const tool = 'skraft_design_start'\n",
    'design/b.mjs': 'export const b = 1\n',
    'design/c.mjs': 'export const c = 1\n',
    'design/own.mjs': 'design only\n',
    'design/later.mjs': 'one way\n',
    'design/node_modules/x.mjs': 'ignored\n',
    'deliver/a.mjs': "export const tool = 'skraft_deliver_start'\n",
    'deliver/b.mjs': 'export const b = 2\n',
    'deliver/stray.mjs': 'nobody owns it\n',
    'deliver/mine.mjs': 'delivery only\n',
    'deliver/later.mjs': 'another way\n',
  })
  const compared = compareEngines({ source: 'design', copy: 'deliver', ownedBySource: ['own.mjs'], ownedByCopy: ['mine.mjs'], pending: ['later.mjs'] }, root)
  assert.deepEqual(compared.differing, ['b.mjs'])
  assert.deepEqual(compared.missing, ['c.mjs'])
  assert.deepEqual(compared.unowned, ['stray.mjs'])
  assert.deepEqual([...compared.expected.keys()], ['a.mjs', 'b.mjs', 'c.mjs'])
})
