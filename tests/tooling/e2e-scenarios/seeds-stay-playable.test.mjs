import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readConfig } from '../../../plugins/skraft-framework/engine/domain/config/skraft-config.mjs'
import { parseCommand } from '../../../plugins/skraft-framework/engine/domain/gates/command-line.mjs'
import { branchOf, readIssue, renderConfig } from '../../../eng/e2e-scenarios/seed.mjs'

// A scenario seed outlives the engine changes made after it: its config must stay one the engine
// accepts and runs, every gate script it names must still ship in the plugin, and the clone must
// install from the committed lock.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCENARIOS = join(ROOT, 'eng', 'e2e-scenarios')
const PLUGIN = join(ROOT, 'plugins', 'skraft-framework')

const scenarios = readdirSync(SCENARIOS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)

const renderedConfig = (name) => renderConfig(readFileSync(join(SCENARIOS, name, 'seed', 'skraft-config.template.json'), 'utf8'), PLUGIN)

const componentsOf = (name) => JSON.parse(renderedConfig(name)).components

test('every scenario ships a seed, an issue, its sandbox repository and a slug', () => {
  assert.ok(scenarios.length > 0)
  for (const name of scenarios) {
    assert.ok(existsSync(join(SCENARIOS, name, 'seed', 'skraft-config.template.json')), `${name}: seed config template`)
    assert.ok(readIssue(readFileSync(join(SCENARIOS, name, 'issue.md'), 'utf8')).title.length > 0, `${name}: issue title`)
    const { repo, slug } = JSON.parse(readFileSync(join(SCENARIOS, name, 'scenario.json'), 'utf8'))
    assert.match(repo, /^[\w.-]+\/[\w.-]+$/, `${name}: sandbox repository owner/name`)
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name}: kebab-case slug`)
  }
})

test('the engine accepts the config each seed renders, and can start each of its commands', () => {
  for (const name of scenarios) {
    const reading = readConfig(renderedConfig(name))
    assert.ok(reading.ok, `${name}: ${(reading.errors ?? []).join('; ')}`)
    for (const { commands } of componentsOf(name)) {
      for (const [gate, line] of Object.entries(commands)) {
        const parsed = parseCommand(line, { baseSha: 'abc1234' })
        assert.ok(parsed.ok, `${name} ${gate}: ${parsed.reason}`)
      }
    }
  }
})

test('every gate script a seed names ships in the plugin', () => {
  for (const name of scenarios) {
    const text = renderedConfig(name)
    assert.doesNotMatch(text, /\{\{/, `${name}: unresolved placeholder`)
    const scripts = [...text.matchAll(/node \\"([^"\\]+)\\"/g)].map(([, path]) => path)
    assert.ok(scripts.length > 0, `${name}: names no gate script`)
    for (const script of scripts) assert.ok(existsSync(script), `${name}: ${script} does not exist`)
  }
})

test('the engine reads the mutation report where the TypeScript mutation gate writes it', () => {
  for (const name of scenarios) {
    for (const { commands, mutationReport } of componentsOf(name).filter(({ commands }) => /mutation-gate\.mjs/.test(commands.mutation ?? ''))) {
      const evidence = commands.mutation.match(/--evidence (\S+)/)[1]
      assert.equal(mutationReport, `${evidence}/qg-mutation/mutation-report.json`, name)
    }
  }
})

test('each seed lock file is one git keeps', () => {
  for (const name of scenarios) {
    const lock = join('eng', 'e2e-scenarios', name, 'seed', 'package-lock.json')
    assert.ok(existsSync(join(ROOT, lock)), `${name}: no package-lock.json`)
    // Reads only the .gitignore files; the file system monitor has nothing to add.
    const ignored = spawnSync('git', ['-c', 'core.fsmonitor=false', 'check-ignore', '--quiet', '--no-index', lock], { cwd: ROOT })
    assert.equal(ignored.status, 1, `${name}: ${lock} is ignored by git`)
  }
})

test('a scenario issue reads its title from the first heading, and the run branch carries the issue', () => {
  assert.deepEqual(readIssue('# Évaluer une proposition\n\nEn tant que joueur…\n'), { title: 'Évaluer une proposition', body: 'En tant que joueur…\n' })
  assert.throws(() => readIssue('Évaluer une proposition\n'), /must start with "# <title>"/)
  assert.equal(branchOf(7, 'evaluer-proposition'), 'feat/7-evaluer-proposition')
})
