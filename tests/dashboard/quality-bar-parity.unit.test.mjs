import { strictEqual } from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))
const barPath = join(repoRoot, 'plugins/skraft-framework/skills/skraft-quality-bar/SKILL.md')
const scriptsDir = join(repoRoot, 'plugins/skraft-framework/skills/quality-gates-dotnet/scripts')

// The repository owner chose to have each adapter script carry its own expected
// value, so the scripts stay executable on their own. That choice recreates the
// pattern which produced the defect this whole change removes: a threshold stated
// in more than one place, drifting silently until two of them disagree
// (software-engineer.agent.md once claimed 80/90/100 while the routing table said
// skip/100/100). The literals are therefore allowed, but only as CHECKED
// restatements: this test is what makes them checked.

function barRows(markdown) {
  const rows = new Map()
  for (const line of markdown.split(/\r?\n/)) {
    const cells = /^\|\s*Mutation score\s*\|\s*(\d+)%\s*\|\s*([^|]+?)\s*\|/.exec(line)
    if (cells) rows.set(cells[2].replace(/\s+/g, ''), Number(cells[1]))
  }
  return rows
}

function breakAtFlags(markdown) {
  const flags = new Map()
  for (const line of markdown.split(/\r?\n/)) {
    const cells = /^\|\s*([^|]+?)\s*\|\s*`--break-at\s+(\d+)`\s*\|/.exec(line)
    if (cells) flags.set(cells[1].replace(/\s+/g, ''), Number(cells[2]))
  }
  return flags
}

function scriptConstant(source, name) {
  const match = new RegExp(`^${name}=\\"?([^\\"\\n]+)\\"?$`, 'm').exec(source)
  return match?.[1]
}

const SCRIPTS = [
  { file: 'mutation-core.sh', scope: 'Domain,Application' },
  { file: 'mutation-boundary.sh', scope: 'API,Infrastructure' },
]

describe('quality bar parity', () => {
  it('states a mutation bar for both scopes', () => {
    const rows = barRows(readFileSync(barPath, 'utf8'))

    strictEqual(rows.size, SCRIPTS.length, `expected one bar row per scope, got ${[...rows.keys()].join(' / ')}`)
    for (const { scope } of SCRIPTS) {
      strictEqual(typeof rows.get(scope), 'number', `no mutation bar row for scope ${scope}`)
    }
  })

  for (const { file, scope } of SCRIPTS) {
    it(`keeps ${file} in step with the bar`, () => {
      const path = join(scriptsDir, file)
      strictEqual(existsSync(path), true, `${file} is missing; the bar names it as the runner for ${scope}`)

      const source = readFileSync(path, 'utf8')
      const expected = barRows(readFileSync(barPath, 'utf8')).get(scope)

      strictEqual(scriptConstant(source, 'SCOPE'), scope, `${file} declares a different scope than the bar row it implements`)
      strictEqual(
        Number(scriptConstant(source, 'EXPECTED')),
        expected,
        `${file} hardcodes a threshold the bar no longer states — one of the two moved without the other`,
      )
    })
  }

  it('keeps the documented --break-at flags equal to the bar', () => {
    const markdown = readFileSync(barPath, 'utf8')
    const rows = barRows(markdown)
    const flags = breakAtFlags(markdown)

    for (const { scope } of SCRIPTS) {
      strictEqual(flags.get(scope), rows.get(scope), `the --break-at flag documented for ${scope} disagrees with the bar row above it`)
    }
  })

  it('refuses a script that takes the threshold as an argument', () => {
    // --break-at is what makes the runner itself fail. A script that accepted an
    // --expected flag would let a caller pass a lower number and still produce a
    // green, fully self-consistent evidence record.
    for (const { file } of SCRIPTS) {
      const source = readFileSync(join(scriptsDir, file), 'utf8')
      strictEqual(/--expected\)/.test(source), true, `${file} must reject --expected explicitly`)
      strictEqual(/--break-at "\$EXPECTED"/.test(source), true, `${file} must pass its own constant to --break-at`)
    }
  })
})
