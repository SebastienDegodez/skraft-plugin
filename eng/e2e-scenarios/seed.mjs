// Helpers of the e2e scenarios: how a scenario's tree is planted, and how its config template and
// its issue file are read. See eng/e2e-scenarios/README.md.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SCRIPTS = /\{\{scripts:([a-z0-9-]+)\}\}/g
const TEMPLATE = 'skraft-config.template.json'
// What a hand check of a seed or of one of its components leaves behind; never part of the sandbox.
const GENERATED = new Set(['node_modules', 'dist', 'reports', '.stryker-tmp', '.copilot-tracking', 'test-results', 'playwright-report', 'skraft-visuals', 'bin', 'obj', 'TestResults', 'StrykerOutput'])

/**
 * The seed's skraft-config.json: each {{scripts:<skill>}} becomes the scripts folder of that
 * skill in the plugin under test, with forward slashes so the JSON string needs no escaping and
 * Node reads it on Windows too.
 * @param {string} template @param {string} pluginRoot
 */
export const renderConfig = (template, pluginRoot) =>
  template.replace(SCRIPTS, (_, skill) => join(pluginRoot, 'skills', skill, 'scripts').split('\\').join('/'))

/** @param {string} from @param {string} source @param {string[][]} dropped */
const kept = (from, source, dropped = []) => {
  const parts = relative(from, source).split(sep)
  return !parts.some((part) => GENERATED.has(part)) && !dropped.some((path) => path.every((part, index) => parts[index] === part))
}

/**
 * Lays a scenario's tree in target: its seed without the paths `without` names (`/`-separated,
 * relative to the seed), the scenario's own files on top, then skraft-config.json rendered from
 * the template the tree ends with.
 * @param {{ seed: string, files: string, without?: string[], target: string, plugin: string }} tree
 */
export const plantTree = ({ seed, files, without = [], target, plugin }) => {
  const missing = without.filter((path) => !existsSync(join(seed, ...path.split('/'))))
  if (missing.length > 0) throw new Error(`without names what the seed does not hold: ${missing.join(', ')}`)
  const dropped = without.map((path) => path.split('/'))
  cpSync(seed, target, { recursive: true, filter: (source) => kept(seed, source, dropped) })
  if (existsSync(files)) cpSync(files, target, { recursive: true, filter: (source) => kept(files, source) })
  const template = join(target, TEMPLATE)
  writeFileSync(join(target, 'skraft-config.json'), renderConfig(readFileSync(template, 'utf8'), plugin))
  rmSync(template)
}

/**
 * The issue a scenario opens: its first line is `# <title>`, the rest is the body.
 * @param {string} text @returns {{ title: string, body: string }}
 */
export const readIssue = (text) => {
  const [first, ...rest] = text.split('\n')
  if (!first.startsWith('# ')) throw new Error('issue.md must start with "# <title>"')
  return { title: first.slice(2).trim(), body: `${rest.join('\n').trim()}\n` }
}

/** The branch the run works on: the forge refuses a pull request from the base branch. */
export const branchOf = (issue, slug) => `feat/${issue}-${slug}`
