import { strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { MUTATION_BAR } from '../../plugins/skraft-framework/src/domain/mutation-gate-policy.mjs'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const barPath = join(repoRoot, 'plugins/skraft-framework/skills/skraft-quality-bar/SKILL.md')

// The mutation gate carries its bar as a constant so it runs without model judgement. That
// recreates the pattern this check exists for: a threshold stated in two places, drifting
// silently until they disagree. The constant is allowed only as a CHECKED restatement.
function mutationRows(markdown) {
  const rows = []
  for (const line of markdown.split(/\r?\n/)) {
    const cells = /^\|\s*Mutation score\s*\|\s*(\d+)%\s*\|\s*([^|]+?)\s*\|/.exec(line)
    if (cells) rows.push({ bar: Number(cells[1]), scope: cells[2] })
  }
  return rows
}

describe('quality bar parity', () => {
  it('states one global mutation bar, the one the mutation gate applies', () => {
    const rows = mutationRows(readFileSync(barPath, 'utf8'))
    strictEqual(rows.length, 1, `expected one global mutation bar row, got ${rows.map(({ scope }) => scope).join(' / ')}`)
    strictEqual(rows[0].bar, MUTATION_BAR, 'the bar and src/domain/mutation-gate-policy.mjs disagree — one moved without the other')
  })
})
