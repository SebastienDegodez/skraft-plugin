import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readConfig } from '../../../plugins/skraft-framework/engine/domain/config/skraft-config.mjs'
import { parseCommand } from '../../../plugins/skraft-framework/engine/domain/gates/command-line.mjs'
import { inventoryOf } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'
import { branchOf, plantTree, readIssue } from '../../../eng/e2e-scenarios/seed.mjs'

// A scenario outlives the engine changes made after it. The tree reset.mjs plants for it (its
// seed, less what it drops, with its own files on top) must keep a config the engine accepts and
// runs, every gate script it names must still ship in the plugin, and the clone must install
// from the committed locks.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCENARIOS = join(ROOT, 'eng', 'e2e-scenarios')
const PLUGIN = join(ROOT, 'plugins', 'skraft-framework')

const scenarios = readdirSync(SCENARIOS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
const seeds = scenarios.filter((name) => existsSync(join(SCENARIOS, name, 'seed')))
const scenarioOf = (name) => JSON.parse(readFileSync(join(SCENARIOS, name, 'scenario.json'), 'utf8'))

// Each scenario's tree, planted once as reset.mjs plants it, in a git repository of its own.
const PLANTED = mkdtempSync(join(tmpdir(), 'skraft-e2e-trees-'))
after(() => rmSync(PLANTED, { recursive: true, force: true }))
const git = (args, cwd) => spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd, encoding: 'utf8' })
const trees = new Map()
const treeOf = (name) => {
  if (!trees.has(name)) {
    const { seed = name, without = [] } = scenarioOf(name)
    const target = join(PLANTED, name)
    plantTree({ seed: join(SCENARIOS, seed, 'seed'), files: join(SCENARIOS, name, 'files'), without, target, plugin: PLUGIN })
    git(['init', '--quiet'], target)
    trees.set(name, target)
  }
  return trees.get(name)
}

const configText = (name) => readFileSync(join(treeOf(name), 'skraft-config.json'), 'utf8')
const componentsOf = (name) => JSON.parse(configText(name)).components

const option = (line, key) => line.match(new RegExp(`--${key} (\\S+)`))?.[1]

const NPM = (names) => names.includes('package.json')
const DOTNET = (names) => names.some((file) => /\.(sln|slnx|csproj)$/.test(file))
/** What makes a folder a component of each stack: the file its build starts from. */
const PROJECT = Object.freeze({ typescript: NPM, javascript: NPM, react: NPM, dotnet: DOTNET })

/** The projects a .sln or .slnx file lists, relative to its folder. @param {string} text */
const solutionProjects = (text) => [...text.matchAll(/"([^"]+\.csproj)"/g)].map(([, path]) => path.replaceAll('\\', '/'))

/** The folders under a component, relative to it, each holding a .NET project; bin and obj left out. */
const projectFolders = (folder, inner = '.') => {
  const entries = readdirSync(join(folder, inner), { withFileTypes: true })
  const here = entries.some((entry) => entry.isFile() && entry.name.endsWith('.csproj')) ? [inner] : []
  const below = entries.filter((entry) => entry.isDirectory() && !['bin', 'obj', 'node_modules', '.git'].includes(entry.name))
  return [...here, ...below.flatMap((entry) => projectFolders(folder, posix.join(inner, entry.name)))]
}

/** The lock files of a component, relative to the tree: npm's one, or NuGet's beside each project. */
const LOCKS = Object.freeze({
  typescript: (tree, root) => [posix.join(root, 'package-lock.json')],
  javascript: (tree, root) => [posix.join(root, 'package-lock.json')],
  react: (tree, root) => [posix.join(root, 'package-lock.json')],
  dotnet: (tree, root) => projectFolders(join(tree, root)).map((folder) => posix.join(root, folder, 'packages.lock.json')),
})

/** Where each mutation script leaves the report the engine reads, below its --evidence folder. */
const MUTATION_REPORTS = Object.freeze({
  'quality-gates-typescript/scripts/mutation-gate.mjs': 'qg-mutation/mutation-report.json',
  'quality-gates-dotnet/scripts/mutation-core.mjs': 'qg-mutation-report.json',
})

/** The scenario's own file when it brings one, else the seed's: the file git must keep in this repository. */
const sourceOf = (name, path) => {
  const { seed = name } = scenarioOf(name)
  const own = posix.join('eng', 'e2e-scenarios', name, 'files', path)
  return existsSync(join(ROOT, own)) ? own : posix.join('eng', 'e2e-scenarios', seed, 'seed', path)
}

test('every scenario names a seed, its sandbox repository and a slug', () => {
  assert.ok(scenarios.length > 0)
  for (const name of scenarios) {
    const { repo, slug, seed = name, without = [] } = scenarioOf(name)
    assert.ok(seeds.includes(seed), `${name}: no seed named ${seed}`)
    assert.ok(Array.isArray(without) && without.every((path) => typeof path === 'string' && !path.split('/').includes('..')), `${name}: without lists paths inside the seed`)
    assert.match(repo, /^[\w.-]+\/[\w.-]+$/, `${name}: sandbox repository owner/name`)
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name}: kebab-case slug`)
  }
})

test('a scenario drops from its seed what without names, and its own files replace the seed\'s', () => {
  for (const name of scenarios.filter((scenario) => scenarioOf(scenario).without)) {
    for (const path of scenarioOf(name).without) {
      const own = join(SCENARIOS, name, 'files', path)
      // A dropped folder the scenario brings again holds only the scenario's files.
      const expected = existsSync(own) ? readdirSync(own).sort() : null
      const planted = existsSync(join(treeOf(name), path)) ? readdirSync(join(treeOf(name), path)).sort() : null
      assert.deepEqual(planted, expected, `${name}: ${path}`)
    }
  }
  for (const name of scenarios.filter((scenario) => existsSync(join(SCENARIOS, scenario, 'files', 'README.md')))) {
    assert.equal(readFileSync(join(treeOf(name), 'README.md'), 'utf8'), readFileSync(join(SCENARIOS, name, 'files', 'README.md'), 'utf8'), name)
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
    // The scenario's INVENTORY checkpoint expects every FR under one of the PRD's epics.
    const { epics, requirements } = inventoryOf(readFileSync(join(SCENARIOS, name, 'files', prd), 'utf8'))
    const frs = requirements.filter(({ kind }) => kind === 'FR')
    assert.ok(epics.length > 1 && frs.length > 0, `${name}: ${prd} holds no epics or no FR`)
    assert.deepEqual(frs.filter(({ epic }) => epic === null).map(({ id }) => id), [], `${name}: FR outside an epic`)
  }
})

test('the engine accepts the config each scenario plants, and can start each of its commands', () => {
  for (const name of scenarios) {
    const reading = readConfig(configText(name))
    assert.ok(reading.ok, `${name}: ${(reading.errors ?? []).join('; ')}`)
    for (const { commands } of componentsOf(name)) {
      for (const [gate, line] of Object.entries(commands)) {
        const parsed = parseCommand(line, { baseSha: 'abc1234' })
        assert.ok(parsed.ok, `${name} ${gate}: ${parsed.reason}`)
      }
    }
  }
})

test('every gate script a scenario names ships in the plugin', () => {
  for (const name of scenarios) {
    const text = configText(name)
    assert.doesNotMatch(text, /\{\{/, `${name}: unresolved placeholder`)
    const scripts = [...text.matchAll(/node \\"([^"\\]+)\\"/g)].map(([, path]) => path)
    assert.ok(scripts.length > 0, `${name}: names no gate script`)
    for (const script of scripts) assert.ok(existsSync(script), `${name}: ${script} does not exist`)
  }
})

test('every component a scenario configures holds its project, and its gates name it as their scripts expect', () => {
  for (const name of scenarios) {
    for (const { name: component, root, stack, commands } of componentsOf(name)) {
      assert.ok(PROJECT[stack], `${name} ${component}: no project rule for stack ${stack}`)
      const files = existsSync(join(treeOf(name), root)) ? readdirSync(join(treeOf(name), root)) : []
      assert.ok(PROJECT[stack](files), `${name} ${component}: no ${stack} project in ${root}`)
      // A seed's component the scenario replaces must be dropped, not mixed with the new one.
      const foreign = [...new Set(Object.values(PROJECT))].filter((rule) => rule !== PROJECT[stack])
      assert.ok(!foreign.some((rule) => rule(files)), `${name} ${component}: ${root} also holds the project of another stack`)
      for (const solution of files.filter((file) => /\.slnx?$/.test(file))) {
        const listed = solutionProjects(readFileSync(join(treeOf(name), root, solution), 'utf8'))
        assert.ok(listed.length > 0, `${name} ${component}: ${solution} lists no project`)
        for (const project of listed) assert.ok(existsSync(join(treeOf(name), root, project)), `${name} ${component}: ${solution} lists ${project}, which is not planted`)
      }
      for (const [gate, line] of Object.entries(commands).filter(([, line]) => line.includes('--root '))) {
        if (stack === 'dotnet') {
          // The .NET scripts run the solution found in --root: the component's own folder.
          assert.equal(posix.join(root, option(line, 'root')), posix.normalize(root), `${name} ${component} ${gate}: --root is not the component`)
          continue
        }
        assert.equal(posix.join(root, option(line, 'root')), '.', `${name} ${component} ${gate}: --root is not the repository root`)
        assert.equal(posix.normalize(option(line, 'package') ?? '.'), root, `${name} ${component} ${gate}: --package is not the component`)
      }
    }
  }
})

test('a .NET component keeps the Stryker.NET config its mutation gate reads', () => {
  for (const name of scenarios) {
    for (const { name: component, root, commands } of componentsOf(name).filter(({ commands }) => /quality-gates-dotnet\/scripts\/mutation-core\.mjs/.test(commands.mutation ?? ''))) {
      const config = posix.join(root, option(commands.mutation, 'root'), option(commands.mutation, 'config') ?? 'stryker-config-core.json')
      assert.ok(existsSync(join(treeOf(name), config)), `${name} ${component}: no ${config}`)
    }
  }
})

test('a front end of a scenario guards its layers with the rules clean-architecture-react ships today', () => {
  const shipped = readFileSync(join(PLUGIN, 'skills', 'clean-architecture-react', 'eslint', 'clean-architecture.js'), 'utf8')
  for (const name of scenarios) {
    for (const { root } of componentsOf(name).filter(({ stack }) => stack === 'react')) {
      assert.equal(readFileSync(join(treeOf(name), root, 'eslint', 'clean-architecture.js'), 'utf8'), shipped, `${name} ${root}`)
    }
  }
})

test('the engine reads the mutation report where the mutation gate writes it', () => {
  for (const name of scenarios) {
    for (const { name: component, root, commands, mutationReport } of componentsOf(name)) {
      const script = Object.keys(MUTATION_REPORTS).find((path) => (commands.mutation ?? '').includes(path))
      if (!script) continue
      assert.ok(mutationReport, `${name} ${component}: mutationReport is not set`)
      // --evidence is read from --root, mutationReport from the component root.
      const written = posix.join(root, option(commands.mutation, 'root'), option(commands.mutation, 'evidence'), MUTATION_REPORTS[script])
      assert.equal(posix.join(root, mutationReport), written, `${name} ${component}`)
    }
  }
})

test('the lock files of each component of a scenario are planted, and git keeps them here and in the sandbox', () => {
  for (const name of scenarios) {
    for (const { name: component, root, stack } of componentsOf(name)) {
      const locks = LOCKS[stack](treeOf(name), root)
      assert.ok(locks.length > 0, `${name} ${component}: no lock file expected in ${root}`)
      for (const lock of locks) {
        assert.ok(existsSync(join(treeOf(name), lock)), `${name} ${component}: no ${lock}`)
        // Reads only the .gitignore files; the file system monitor has nothing to add.
        assert.equal(git(['check-ignore', '--quiet', '--no-index', lock], treeOf(name)).status, 1, `${name}: ${lock} is ignored in the sandbox`)
        assert.equal(git(['check-ignore', '--quiet', '--no-index', sourceOf(name, lock)], ROOT).status, 1, `${name}: ${sourceOf(name, lock)} is ignored by git`)
      }
    }
  }
})

test('a scenario may drop only a plain path inside its seed', () => {
  const seed = join(SCENARIOS, 'mastermind', 'seed')
  for (const path of ['', '.', '..', '../mastermind/seed', '/api', 'api/', './api', 'api/../web', 'api//src']) {
    const target = join(PLANTED, 'refused')
    assert.throws(() => plantTree({ seed, files: join(SCENARIOS, 'none'), without: [path], target, plugin: PLUGIN }), /without/, JSON.stringify(path))
    assert.ok(!existsSync(target), `${JSON.stringify(path)}: planted before refusing`)
  }
})

test('a scenario issue reads its title from the first heading, and the run branch carries the issue', () => {
  assert.deepEqual(readIssue('# Évaluer une proposition\n\nEn tant que joueur…\n'), { title: 'Évaluer une proposition', body: 'En tant que joueur…\n' })
  assert.throws(() => readIssue('Évaluer une proposition\n'), /must start with "# <title>"/)
  assert.equal(branchOf(7, 'evaluer-proposition'), 'feat/7-evaluer-proposition')
})
