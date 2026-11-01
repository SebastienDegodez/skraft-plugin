#!/usr/bin/env node
// Checks a pull request title against the files it changes. A squash merge keeps the title as
// the only commit message, and two releases read it:
// - the plugin's (.releaserc.json) never releases a commit scoped `cli`;
// - the skraft command's (cli/.releaserc.json) only reads commits that touch cli/.
// So a pull request that changes the plugin is never scoped `cli`, and one that only changes the
// skraft command is scoped `cli`, or the plugin would release a change it does not hold.
//   PR_TITLE='feat(engine): …' node scripts/check-pr-title.mjs --files <one path per line>
import { readFileSync } from 'node:fs'

const TITLE = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: \S/
const RELEASING = new Set(['feat', 'fix', 'perf', 'refactor'])

/** The skraft command's own files: its package, its tests, its workflows. @param {string} file */
const isCommand = (file) => file.startsWith('cli/') || file.startsWith('tests/cli/') || file.startsWith('.github/workflows/cli-')

/** Documentation the plugin release ignores. @param {string} file */
const isDocumentation = (file) => file.startsWith('docs/') || (!file.includes('/') && file.endsWith('.md'))

/**
 * @param {string} title @param {string[]} files
 * @returns {string | undefined} why the title does not fit the files; undefined when it does
 */
export const titleProblem = (title, files) => {
  const parsed = TITLE.exec(title)?.groups
  if (parsed === undefined) return `"${title}" is not a conventional commit title (type(scope): subject); its squash commit would release nothing`
  if (!RELEASING.has(parsed.type) && parsed.breaking === undefined) return undefined
  const plugin = files.filter((file) => !isCommand(file) && !isDocumentation(file))
  const command = files.filter(isCommand)
  if (plugin.length > 0 && parsed.scope === 'cli') {
    return `this pull request changes the plugin (${plugin[0]}…): scope it for the plugin, not cli, or the plugin never releases it`
  }
  if (plugin.length === 0 && command.length > 0 && parsed.scope !== 'cli') {
    return 'this pull request changes only the skraft command (cli/): scope it cli, or the plugin releases a change it does not hold'
  }
  return undefined
}

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const list = argument('--files')
if (list === undefined || process.env.PR_TITLE === undefined) {
  process.stderr.write('usage: PR_TITLE=<title> node scripts/check-pr-title.mjs --files <file>\n')
  process.exitCode = 2
} else {
  const files = readFileSync(list, 'utf8').split(/\r?\n/).filter(Boolean)
  const problem = titleProblem(process.env.PR_TITLE, files)
  if (problem === undefined) process.stdout.write(`pull request title fits its ${files.length} changed files\n`)
  else {
    process.stderr.write(`${problem}\n`)
    process.exitCode = 1
  }
}
