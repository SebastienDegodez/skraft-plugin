import { strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { MUTATION_BARS } from '../../plugins/skraft-framework/engine/domain/config/quality-bar.mjs'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const barPath = join(repoRoot, 'plugins/skraft-framework/skills/skraft-quality-bar/SKILL.md')

// The engine carries the bar as constants so it judges a mutation report without model
// judgement. That recreates the pattern this check exists for: a threshold stated in two
// places, drifting silently until they disagree. The constants are allowed only as CHECKED
// restatements of the skill's table.
function barRows(markdown) {
  const rows = new Map()
  for (const line of markdown.split(/\r?\n/)) {
    const cells = /^\|\s*Mutation score\s*\|\s*(\d+)%\s*\|\s*([^|]+?)\s*\|/.exec(line)
    if (cells) rows.set(cells[2].replace(/\s+/g, ''), Number(cells[1]))
  }
  return rows
}

const SCOPES = [
  { scope: 'core', rows: 'Domain,Application' },
  { scope: 'boundary', rows: 'API,Infrastructure' },
]

describe('quality bar parity', () => {
  it('states one mutation bar per scope, the one the engine judges a report against', () => {
    const rows = barRows(readFileSync(barPath, 'utf8'))
    strictEqual(rows.size, SCOPES.length, `expected one bar row per scope, got ${[...rows.keys()].join(' / ')}`)
    for (const { scope, rows: name } of SCOPES) {
      strictEqual(rows.get(name), MUTATION_BARS[scope], `the ${name} bar and the engine's ${scope} bar disagree — one moved without the other`)
    }
  })
})
