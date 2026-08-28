#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const legacyRoot = 'plugins/'
const frameworkRoot = `${legacyRoot}skraft-framework/`
const runtimeLogsPath = `${legacyRoot}logs`

export const obsoletePaths = Object.freeze([
  [`${legacyRoot}skraft-framework.config.json`, `${frameworkRoot}skraft-framework.config.json`],
  [`${legacyRoot}.claude-plugin`, `${frameworkRoot}.claude-plugin`],
  [`${legacyRoot}instructions`, `${frameworkRoot}instructions`],
  [`${legacyRoot}agents`, `${frameworkRoot}agents`],
  [`${frameworkRoot}instructions`, `${frameworkRoot}com.github.copilot/rules`],
  [`${frameworkRoot}agents`, `${frameworkRoot}com.anthropic.claude-code/agents`],
  [`${legacyRoot}skills`, `${frameworkRoot}skills`],
  [`${legacyRoot}hooks`, `${frameworkRoot}com.anthropic.claude-code/hooks`],
  [runtimeLogsPath, `${frameworkRoot}logs`],
  [`${legacyRoot}stryker.config.mjs`, `${frameworkRoot}src/stryker.config.mjs`],
  [`${legacyRoot}src`, `${frameworkRoot}src`],
])

// Historical design records and generated evidence preserve paths as they existed at
// the time. Rewriting them would falsify the audit trail and make generated outputs
// dirty. Only live source, tests, manifests and handbook metadata participate.
const excludedPrefixes = Object.freeze([
  '.copilot-tracking/',
  '.specs/',
  '_site/',
  'artifacts/',
  'dashboard-data/',
  'docs/adr/',
  'docs/site/dashboard/data/',
  'docs/superpowers/plans/',
  'docs/superpowers/specs/',
  'eval-results/',
  'eval-results-pilot/',
  'graphify-out/',
])

export const isHistoricalOrGeneratedPath = (relativePath) =>
  excludedPrefixes.some((prefix) => relativePath.startsWith(prefix))

export const rewritePluginPaths = (content) => obsoletePaths.reduce(
  (updated, [obsolete, replacement]) => updated.replaceAll(obsolete, replacement),
  content,
)

export const obsoleteReferences = (content) => obsoletePaths
  .filter(([obsolete]) => content.includes(obsolete))
  .map(([obsolete]) => obsolete)

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const trackedFiles = (root) => execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'buffer' })
  .toString('utf8')
  .split('\0')
  .filter(Boolean)

const textFilesWithObsoletePaths = (root) => trackedFiles(root).flatMap((relativePath) => {
  const path = join(root, relativePath)
  if (isHistoricalOrGeneratedPath(relativePath)) return []
  if (!statSync(path).isFile()) return []

  const buffer = readFileSync(path)
  if (buffer.includes(0)) return []

  const content = buffer.toString('utf8')
  const references = obsoleteReferences(content)
  return references.length === 0 ? [] : [{ relativePath, path, content, references }]
})

export const migratePluginPaths = ({ root = repoRoot, apply = false } = {}) => {
  const files = textFilesWithObsoletePaths(root)
  if (apply) {
    for (const { path, content } of files) writeFileSync(path, rewritePluginPaths(content))
  }
  return files
}

const usage = 'Usage: node scripts/migrate-plugin-paths.mjs --check|--apply'
const args = new Set(process.argv.slice(2))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (args.size !== 1 || (!args.has('--check') && !args.has('--apply'))) {
    console.error(usage)
    process.exit(1)
  }

  const apply = args.has('--apply')
  const files = migratePluginPaths({ apply })
  if (files.length === 0) {
    console.log('✓ no obsolete plugin paths found')
    process.exit(0)
  }

  for (const { relativePath, references } of files) {
    console.log(`${apply ? 'updated' : 'obsolete'} ${relativePath}: ${references.join(', ')}`)
  }
  console.log(`${apply ? '✓ migrated' : '✗ found'} ${files.length} file(s)`)
  process.exit(apply ? 0 : 1)
}