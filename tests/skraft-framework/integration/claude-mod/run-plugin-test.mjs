#!/usr/bin/env node
// Runs `claude plugin test` on the skraft mod without placing a test file in plugins/:
// copies the plugin (less the engine's dev dependencies) into a temporary folder, adds the
// *.test.ts files of ./plugin-test/ and `plugin-files.ts` (the plugin files the tests serve
// through their `fs.read` hook: the test runtime has no file system beneath it), runs the CLI
// on that folder and exits with its code.
//
//   node tests/skraft-framework/integration/claude-mod/run-plugin-test.mjs
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../../plugins/skraft-framework/', import.meta.url))
const TESTS = fileURLToPath(new URL('./plugin-test/', import.meta.url))
/** The plugin files the mod reads during a run, relative to the plugin root. */
const SERVED = [
  'workflows/skraft.dot',
  ...readdirSync(join(PLUGIN, 'com.anthropic.claude-code', 'agents')).map((name) => `com.anthropic.claude-code/agents/${name}`),
  ...readdirSync(join(PLUGIN, 'skills')).filter((name) => existsSync(join(PLUGIN, 'skills', name, 'SKILL.md'))).map((name) => `skills/${name}/SKILL.md`),
]
const SKIPPED = [['engine', 'node_modules'], ['engine', 'reports'], ['engine', '.stryker-tmp']].map((parts) => parts.join(sep))

const folder = mkdtempSync(join(tmpdir(), 'skraft-plugin-test-'))
try {
  const target = join(folder, 'skraft')
  cpSync(PLUGIN, target, {
    recursive: true,
    filter: (source) => !SKIPPED.some((skipped) => relative(PLUGIN, source).startsWith(skipped)),
  })
  for (const name of readdirSync(TESTS).filter((file) => /\.test\.tsx?$/.test(file))) {
    cpSync(join(TESTS, name), join(target, 'tests', name))
  }
  const served = Object.fromEntries(SERVED.map((path) => [path, readFileSync(join(PLUGIN, ...path.split('/')), 'utf8')]))
  writeFileSync(join(target, 'tests', 'plugin-files.ts'), `export const PLUGIN_FILES: Record<string, string> = ${JSON.stringify(served, null, 2)}\n`)
  const run = spawnSync('claude', ['plugin', 'test', target], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (run.error) throw run.error
  process.exitCode = run.status ?? 1
} finally {
  rmSync(folder, { recursive: true, force: true })
}
