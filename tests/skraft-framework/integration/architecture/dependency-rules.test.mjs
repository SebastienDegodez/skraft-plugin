import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE = fileURLToPath(new URL('../../../../plugins/skraft-framework/engine/', import.meta.url))

/** @typedef {{ path: string, source: string }} SourceFile  path relative to engine/, any separator */

const toPosix = (path) => path.split(/[\\/]/).join('/')

const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const IMPORT_SPECS = [
  /^\s*(?:import|export)\s[^'"]*?\bfrom\s+['"]([^'"]+)['"]/gm,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
]
const importsOf = (source) => IMPORT_SPECS.flatMap((pattern) => [...withoutComments(source).matchAll(pattern)].map(([, spec]) => spec))

// Under mutation testing the files on disk are Stryker's instrumented copies: their text no
// longer says what the source does, so the text rules read them as empty.
const bodyOf = (source) => (source.includes('stryNS_9fa48') ? '' : withoutComments(source))

const NODE_ONLY = [
  ['process', /(?<![.\w$])process\./],
  ['child_process', /child_process/],
  ['$', /(?<![.\w$])\$\./],
]

const LAYERS = ['domain', 'application', 'infrastructure', 'drivers']

/** @param {SourceFile[]} files */
const dependencyViolations = (files) =>
  files.flatMap(({ path, source }) => {
    const from = toPosix(path)
    if (!from.includes('/')) return [] // engine-root config files such as stryker.config.mjs
    const [layer, area] = from.split('/')
    if (!LAYERS.includes(layer)) return [`${from} is outside the engine layers`]
    const violations = []
    for (const spec of importsOf(source)) {
      const target = spec.startsWith('.') ? posix.join(posix.dirname(from), spec) : null
      const [targetLayer, targetArea] = target ? target.split('/') : []
      const allowed =
        layer === 'domain' ? targetLayer === 'domain'
        : layer === 'application' ? ['domain', 'application'].includes(targetLayer)
        : layer === 'infrastructure' ? targetLayer !== 'drivers' && (targetLayer !== 'application' || targetArea === 'ports')
        : targetLayer !== 'drivers' || targetArea === area
      if (!allowed) violations.push(`${from} → ${spec}`)
    }
    if (layer === 'domain' || layer === 'application') {
      for (const [name, pattern] of NODE_ONLY) if (pattern.test(bodyOf(source))) violations.push(`${from} uses ${name}`)
    }
    return violations
  })

const engineFiles = (dir = ENGINE) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : engineFiles(join(dir, entry.name))
      : entry.name.endsWith('.mjs') ? [{ path: relative(ENGINE, join(dir, entry.name)), source: readFileSync(join(dir, entry.name), 'utf8') }] : [])

test('every engine module respects the dependency rule', () => {
  const files = engineFiles()
  assert.ok(files.some(({ path }) => toPosix(path) === 'drivers/cli/skraft.mjs'), 'the scan does not reach the CLI entry point')
  assert.deepEqual(dependencyViolations(files), [])
})

test('application modules live in features and expose explicitly named use cases', () => {
  const files = engineFiles().filter(({ path }) => toPosix(path).startsWith('application/'))
  const violations = files.flatMap(({ path, source }) => {
    const normalized = toPosix(path)
    const problems = normalized.split('/').length < 3 ? [`${normalized} has no feature folder`] : []
    if (/^export const create\w+\s*=/m.test(bodyOf(source)) && !/\/[a-z]+(?:-[a-z]+)*-usecase\.mjs$/.test(normalized)) {
      problems.push(`${normalized} exposes a use case without the xxx-usecase.mjs name`)
    }
    return problems
  })
  assert.deepEqual(violations, [])
})

test('the dependency rule reports each forbidden dependency, whatever the path separator', () => {
  const fakes = [
    { path: 'domain\\step.mjs', source: "import { x } from '../application/next-step.mjs'" },
    { path: 'domain/clock.mjs', source: "import { readFileSync } from 'node:fs'" },
    { path: 'domain/now.mjs', source: 'export const now = () => process.env.NOW' },
    { path: 'application/next-step.mjs', source: "import { run } from '../infrastructure/git.mjs'" },
    { path: 'application\\ports\\runner.mjs', source: "const cp = await import('child_process')" },
    { path: 'application/spawn.mjs', source: 'export const spawn = (p) => $.agent.spawn(p)' },
    { path: 'infrastructure/store.mjs', source: "import { nextStep } from '../application/next-step.mjs'" },
    { path: 'infrastructure\\ui.mjs', source: "import '../drivers/cli/skraft.mjs'" },
    { path: 'drivers/claude-mod/mod.mjs', source: "import {\n  runCli,\n} from '../cli/run-cli.mjs'" },
    { path: 'core\\rules.mjs', source: "import { x } from '../infrastructure/git.mjs'" },
  ]
  assert.deepEqual(dependencyViolations(fakes), [
    'domain/step.mjs → ../application/next-step.mjs',
    'domain/clock.mjs → node:fs',
    'domain/now.mjs uses process',
    'application/next-step.mjs → ../infrastructure/git.mjs',
    'application/ports/runner.mjs → child_process',
    'application/ports/runner.mjs uses child_process',
    'application/spawn.mjs uses $',
    'infrastructure/store.mjs → ../application/next-step.mjs',
    'infrastructure/ui.mjs → ../drivers/cli/skraft.mjs',
    'drivers/claude-mod/mod.mjs → ../cli/run-cli.mjs',
    'core/rules.mjs is outside the engine layers',
  ])
})

test('the dependency rule accepts what each layer may depend on', () => {
  const fakes = [
    { path: 'domain/step.mjs', source: "import { y } from './verdict.mjs'\n// process.exit is not called here" },
    { path: 'application/next-step.mjs', source: "import { y } from '../domain/step.mjs'\nimport { p } from './ports/runner.mjs'" },
    { path: 'infrastructure\\git.mjs', source: "import { spawn } from 'node:child_process'\nimport { p } from '../application/ports/runner.mjs'" },
    { path: 'drivers\\cli\\skraft.mjs', source: "import { run } from './run-cli.mjs'\nimport { git } from '../../infrastructure/git.mjs'\nprocess.exitCode = 0" },
  ]
  assert.deepEqual(dependencyViolations(fakes), [])
})
