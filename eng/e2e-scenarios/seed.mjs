// Pure helpers of the e2e scenarios: how a seed's config template and its issue file are read.
// See eng/e2e-scenarios/README.md.
import { join } from 'node:path'

const SCRIPTS = /\{\{scripts:([a-z0-9-]+)\}\}/g

/**
 * The seed's skraft-config.json: each {{scripts:<skill>}} becomes the scripts folder of that
 * skill in the plugin under test, with forward slashes so the JSON string needs no escaping and
 * Node reads it on Windows too.
 * @param {string} template @param {string} pluginRoot
 */
export const renderConfig = (template, pluginRoot) =>
  template.replace(SCRIPTS, (_, skill) => join(pluginRoot, 'skills', skill, 'scripts').split('\\').join('/'))

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
