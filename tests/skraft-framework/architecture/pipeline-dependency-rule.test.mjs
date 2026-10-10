// Dependency rule of the pipeline orchestration (ADR-002), read off the import
// statements: domain → nothing outside domain; application → domain + application only;
// infrastructure adapters → never the use cases; no command line, plugin path or exit code
// in the core; everything the Claude Code mod loads is free of Node APIs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../plugins/skraft-framework/', import.meta.url))
const SRC = join(ROOT, 'src')

const filesUnder = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? filesUnder(join(dir, entry.name)) : entry.name.endsWith('.mjs') ? [join(dir, entry.name)] : [])
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
// Under mutation testing a module on disk is Stryker's instrumented copy (marker
// stryNS_9fa48): its regenerated text says nothing of the source, so the text rules skip
// it there. The normal test run checks the real source.
const instrumented = (source) => source.includes('stryNS_9fa48')
// The code a module runs: comments and import/export-from lines left out.
const bodyOf = (source) => (instrumented(source) ? '' : withoutComments(source).replace(/^\s*(?:import|export)\s[^'"]*?from\s+['"][^'"]+['"]\s*$/gm, ''))
// The Node `process` global, not `$.process` of the mods API.
const NODE_PROCESS = /(?<![.\w$])process\./
const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)]
  .map(([, spec]) => ({ spec, target: spec.startsWith('.') ? resolve(dirname(file), spec) : null }))
// Paths compare with '/' whatever the OS writes (Windows: '\\').
const segments = (path) => path.split(/[\\/]/)
const layerOf = (path) => segments(relative(SRC, path))[0]
const show = (file) => segments(relative(ROOT, file)).join('/')

test('pipeline domain imports nothing outside domain/', () => {
  const offenders = filesUnder(join(SRC, 'domain/pipeline')).flatMap((file) =>
    importsOf(file).filter(({ target }) => !target || layerOf(target) !== 'domain').map(({ spec }) => `${show(file)} → ${spec}`))
  assert.deepEqual(offenders, [])
})

test('pipeline application imports only domain/ and application/', () => {
  const offenders = filesUnder(join(SRC, 'application/pipeline')).flatMap((file) =>
    importsOf(file).filter(({ target }) => !target || !['domain', 'application'].includes(layerOf(target))).map(({ spec }) => `${show(file)} → ${spec}`))
  assert.deepEqual(offenders, [])
})

test('pipeline core names no command line, plugin path, process or exit code', () => {
  const files = [...filesUnder(join(SRC, 'domain/pipeline')), ...filesUnder(join(SRC, 'application/pipeline'))]
  const forbidden = new RegExp(`src/cli/|\\.mjs['"\`]|pluginRoot|argv|exitCode|child_process|runProcess|${NODE_PROCESS.source}`)
  const offenders = files.filter((file) => forbidden.test(bodyOf(readFileSync(file, 'utf8')))).map(show)
  assert.deepEqual(offenders, [])
})

// G8 (#208): the write-rights policy and its use case, which every host calls — the settings
// hook, the Claude Code mod and the Copilot extension.
const WRITE_RIGHTS_CORE = ['domain/write-rights-policy.mjs', 'application/write-rights-guard.mjs']

test('write rights: the policy imports only domain/, the use case only domain/ and application/', () => {
  const allowed = { domain: ['domain'], application: ['domain', 'application'] }
  const offenders = WRITE_RIGHTS_CORE.map((path) => join(SRC, path)).flatMap((file) =>
    importsOf(file).filter(({ target }) => !target || !allowed[layerOf(file)].includes(layerOf(target))).map(({ spec }) => `${show(file)} → ${spec}`))
  assert.deepEqual(offenders, [])
})

test('write rights core names no command line, plugin path, process or exit code', () => {
  const forbidden = new RegExp(`src/cli/|\\.mjs['"\`]|pluginRoot|argv|exitCode|child_process|runProcess|${NODE_PROCESS.source}`)
  const offenders = WRITE_RIGHTS_CORE.map((path) => join(SRC, path)).filter((file) => forbidden.test(bodyOf(readFileSync(file, 'utf8')))).map(show)
  assert.deepEqual(offenders, [])
})

test('driven (infrastructure) adapters never import a use case', () => {
  const offenders = filesUnder(join(SRC, 'adapters/infrastructure')).flatMap((file) =>
    importsOf(file).filter(({ target }) => target && layerOf(target) === 'application').map(({ spec }) => `${show(file)} → ${spec}`))
  assert.deepEqual(offenders, [])
})

test('every module the Claude Code mod loads is free of Node APIs', () => {
  const seen = new Set()
  const offenders = []
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const { spec, target } of importsOf(file)) {
      if (target) visit(target)
      else if (spec !== 'claude-code') offenders.push(`${show(file)} → ${spec}`)
    }
    if (/\brequire\(|\bimport\(|createRequire/.test(bodyOf(readFileSync(file, 'utf8'))) || NODE_PROCESS.test(bodyOf(readFileSync(file, 'utf8')))) offenders.push(`${show(file)} uses require, import() or process`)
  }
  visit(join(ROOT, 'hooks/skraft-mod.mjs'))
  assert.deepEqual(offenders, [])
  assert.ok(seen.size > 15, `the mod's import graph looks too small (${seen.size})`)
})

test('each driven port of the pipeline has a contract under ports/infrastructure/', () => {
  const ports = ['agent-runner', 'human-interaction', 'decision-store', 'pipeline-progress', 'tracking-store', 'repository-reader', 'source-control', 'source-tree', 'hasher', 'template-reader', 'state-backup-reader', 'state-archive', 'report-transport', 'active-pipeline', 'state-reader', 'state-writer', 'time-provider']
  const missing = ports.filter((port) => !filesUnder(join(SRC, 'ports/infrastructure')).some((file) => basename(file) === `${port}.mjs`))
  assert.deepEqual(missing, [])
})
