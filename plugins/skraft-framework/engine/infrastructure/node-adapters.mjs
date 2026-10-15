import { createNodeFiles, listFolder } from './files/node-files.mjs'
import { createTrackingStore } from './tracking/tracking-store.mjs'
import { createPluginTemplates } from './templates/plugin-templates.mjs'
import { createSystemClock } from './clock/system-clock.mjs'
import { createWebCryptoHasher } from './crypto/web-crypto-hasher.mjs'
import { createWorkspaceFiles } from './workspace/workspace-files.mjs'
import { createGitSourceControl } from './source-control/git-source-control.mjs'
import { createNodeCommandRunner, createNodeExecutables } from './process/node-processes.mjs'

/**
 * Every adapter a Node host needs, except the host's own AgentRunner and progress.
 * @param {{ cwd: string, pluginRoot: string }} host
 */
export const createNodeAdapters = ({ cwd, pluginRoot }) => {
  const files = createNodeFiles()
  const tracking = createTrackingStore({ files, root: cwd })
  const commandRunner = createNodeCommandRunner({ root: cwd })
  return Object.freeze({
    journal: tracking.journal,
    activePipeline: tracking.activePipeline,
    files: tracking.files,
    templates: createPluginTemplates({ files, pluginRoot }),
    clock: createSystemClock(),
    hasher: createWebCryptoHasher(),
    workspace: createWorkspaceFiles({ files, root: cwd, list: listFolder }),
    commandRunner,
    sourceControl: createGitSourceControl({ commandRunner }),
    executables: createNodeExecutables({ root: cwd }),
    runtime: Object.freeze({ nodeVersion: () => process.version }),
  })
}
