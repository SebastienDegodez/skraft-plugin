// The dynamic workflows the repository's plugins declare: each Copilot extension's manifest
// (plugins/<plugin>/com.github.copilot/extensions/**/copilot-extension.json) names the workflow
// that dispatches the plugin's agents. The catalogue scan and the documentation drift scan both
// hand this list to buildCatalogueTopology, so they read the same dispatchers.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const MANIFEST = 'copilot-extension.json'

/** @param {string} directory @returns {string[]} every manifest under it */
const manifestsUnder = (directory) => {
  if (!existsSync(directory)) return []
  return readdirSync(directory).sort().flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return manifestsUnder(path)
    return entry === MANIFEST ? [path] : []
  })
}

/** The plugin's name in its Claude manifest, else its folder name. @param {string} pluginDir @param {string} folder */
const pluginNameOf = (pluginDir, folder) => {
  try {
    return String(JSON.parse(readFileSync(join(pluginDir, '.claude-plugin/plugin.json'), 'utf8')).name || folder)
  } catch {
    return folder
  }
}

/** @param {string} path @returns {string} the manifest's workflow name, empty when it names none */
const workflowName = (path) => {
  try {
    return String(JSON.parse(readFileSync(path, 'utf8')).name ?? '')
  } catch {
    return ''
  }
}

/**
 * @param {string} root the repository root
 * @returns {{ id: string, plugin: string, path: string }[]} path: the manifest, relative to root, with `/`
 */
export const findDynamicWorkflows = (root) => {
  const pluginsDir = join(root, 'plugins')
  if (!existsSync(pluginsDir)) return []
  return readdirSync(pluginsDir).sort().flatMap((folder) => {
    const pluginDir = join(pluginsDir, folder)
    return manifestsUnder(join(pluginDir, 'com.github.copilot', 'extensions'))
      .map((path) => ({ id: workflowName(path), plugin: pluginNameOf(pluginDir, folder), path: relative(root, path).split('\\').join('/') }))
  }).filter((workflow) => workflow.id)
}
