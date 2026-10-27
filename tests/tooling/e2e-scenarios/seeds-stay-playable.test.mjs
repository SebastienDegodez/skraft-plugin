import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readConfig } from '../../../plugins/skraft-framework/engine/domain/config/skraft-config.mjs'
import { parseCommand } from '../../../plugins/skraft-framework/engine/domain/gates/command-line.mjs'
import { inventoryOf } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { branchOf, readIssue, renderConfig } from '../../../eng/e2e-scenarios/seed.mjs'

// A scenario seed outlives the engine changes made after it: its config must stay one the engine
// accepts and runs, every gate script it names must still ship in the plugin, and the clone must
// install from the committed lock.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCENARIOS = join(ROOT, 'eng', 'e2e-scenarios')
const PLUGIN = join(ROOT, 'plugins', 'skraft-framework')

const scenarios = readdirSync(SCENARIOS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
// A scenario may replay another one's seed; each seed is checked once.
const seeds = scenarios.filter((name) => existsSync(join(SCENARIOS, name, 'seed')))
const scenarioOf = (name) => JSON.parse(readFileSync(join(SCENARIOS, name, 'scenario.json'), 'utf8'))

const renderedConfig = (name) => renderConfig(readFileSync(join(SCENARIOS, name, 'seed', 'skraft-config.template.json'), 'utf8'), PLUGIN)

const componentsOf = (name) => JSON.parse(renderedConfig(name)).components

const option = (line, key) => line.match(new RegExp(`--${key} (\\S+)`))?.[1]

test('every scenario names a seed, its sandbox repository and a slug', () => {
  assert.ok(scenarios.length > 0)
  for (const name of scenarios) {
    const { repo, slug, seed = name } = scenarioOf(name)
    assert.ok(seeds.includes(seed), `${name}: no seed named ${seed}`)
    assert.ok(existsSync(join(SCENARIOS, seed, 'seed', 'skraft-config.template.json')), `${name}: seed config template`)
    assert.match(repo, /^[\w.-]+\/[\w.-]+$/, `${name}: sandbox repository owner/name`)
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name}: kebab-case slug`)
  }
})

test('a pipeline scenario opens an issue with a title; a backlog scenario ships the PRD its workflow reads', () => {
  for (const name of scenarios) {
    const { workflow = 'skraft-pipeline', prd } = scenarioOf(name)
    if (workflow === 'skraft-pipeline') {
      assert.ok(readIssue(readFileSync(join(SCENARIOS, name, 'issue.md'), 'utf8')).title.length > 0, `${name}: issue title`)
      continue
    }
    assert.equal(workflow, 'skraft-prd-backlog', name)
    assert.ok(!existsSync(join(SCENARIOS, name, 'issue.md')), `${name}: a backlog scenario opens no issue`)
    // The workflow cuts epics from the FRs it reads: an FR outside every epic would be lost.
    const { epics, requirements } = inventoryOf(readFileSync(join(SCENARIOS, name, 'files', prd), 'utf8'))
    const frs = requirements.filter(({ kind }) => kind === 'FR')
    assert.ok(epics.length > 1 && frs.length > 0, `${name}: ${prd} holds no epics or no FR`)
    assert.deepEqual(frs.filter(({ epic }) => epic === null).map(({ id }) => id), [], `${name}: FR outside an epic`)
  }
})

test('the engine accepts the config each seed renders, and can start each of its commands', () => {
  for (const name of seeds) {
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
  for (const name of seeds) {
    const text = renderedConfig(name)
    assert.doesNotMatch(text, /\{\{/, `${name}: unresolved placeholder`)
    const scripts = [...text.matchAll(/node \\"([^"\\]+)\\"/g)].map(([, path]) => path)
    assert.ok(scripts.length > 0, `${name}: names no gate script`)
    for (const script of scripts) assert.ok(existsSync(script), `${name}: ${script} does not exist`)
  }
})

test('every component a seed configures is a package of the seed, and its gates name it from the repository root', () => {
  for (const name of seeds) {
    for (const { name: component, root, commands } of componentsOf(name)) {
      assert.ok(existsSync(join(SCENARIOS, name, 'seed', root, 'package.json')), `${name} ${component}: no package.json in ${root}`)
      for (const [gate, line] of Object.entries(commands).filter(([, line]) => line.includes('--root '))) {
        assert.equal(posix.join(root, option(line, 'root')), '.', `${name} ${component} ${gate}: --root is not the repository root`)
        assert.equal(posix.normalize(option(line, 'package') ?? '.'), root, `${name} ${component} ${gate}: --package is not the component`)
      }
    }
  }
})

test('a front end of a seed guards its layers with the rules clean-architecture-react ships today', () => {
  const shipped = readFileSync(join(PLUGIN, 'skills', 'clean-architecture-react', 'eslint', 'clean-architecture.js'), 'utf8')
  for (const name of seeds) {
    for (const { root } of componentsOf(name).filter(({ stack }) => stack === 'react')) {
      assert.equal(readFileSync(join(SCENARIOS, name, 'seed', root, 'eslint', 'clean-architecture.js'), 'utf8'), shipped, `${name} ${root}`)
    }
  }
})

test('the engine reads the mutation report where the TypeScript mutation gate writes it', () => {
  for (const name of seeds) {
    for (const { root, commands, mutationReport } of componentsOf(name).filter(({ commands }) => /mutation-gate\.mjs/.test(commands.mutation ?? ''))) {
      // --evidence is read from the repository root, mutationReport from the component root.
      assert.equal(posix.join(root, mutationReport), `${option(commands.mutation, 'evidence')}/qg-mutation/mutation-report.json`, name)
    }
  }
})

test('the lock file of each component of a seed is one git keeps', () => {
  for (const name of seeds) {
    for (const { root } of componentsOf(name)) {
      const lock = posix.join('eng', 'e2e-scenarios', name, 'seed', root, 'package-lock.json')
      assert.ok(existsSync(join(ROOT, lock)), `${name}: no package-lock.json in ${root}`)
      // Reads only the .gitignore files; the file system monitor has nothing to add.
      const ignored = spawnSync('git', ['-c', 'core.fsmonitor=false', 'check-ignore', '--quiet', '--no-index', lock], { cwd: ROOT })
      assert.equal(ignored.status, 1, `${name}: ${lock} is ignored by git`)
    }
  }
})

test('a scenario issue reads its title from the first heading, and the run branch carries the issue', () => {
  assert.deepEqual(readIssue('# Évaluer une proposition\n\nEn tant que joueur…\n'), { title: 'Évaluer une proposition', body: 'En tant que joueur…\n' })
  assert.throws(() => readIssue('Évaluer une proposition\n'), /must start with "# <title>"/)
  assert.equal(branchOf(7, 'evaluer-proposition'), 'feat/7-evaluer-proposition')
})
