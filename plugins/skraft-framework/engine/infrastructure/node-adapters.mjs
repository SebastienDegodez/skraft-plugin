import { createNodeFiles, listFolder } from './files/node-files.mjs'
import { createTrackingStore } from './tracking/tracking-store.mjs'
import { createPluginTemplates } from './templates/plugin-templates.mjs'
import { createSystemClock } from './clock/system-clock.mjs'
import { createWebCryptoHasher } from './crypto/web-crypto-hasher.mjs'
import { createWorkspaceFiles } from './workspace/workspace-files.mjs'
import { createGitSourceControl } from './source-control/git-source-control.mjs'
import { createGitCommitReplay } from './source-control/git-commit-replay.mjs'
import { createAgentCatalog } from './agents/agent-catalog.mjs'
import { createPluginWorkflows } from './workflows/plugin-workflows.mjs'
import { createNodeCommandRunner, createNodeExecutables } from './process/node-processes.mjs'

/**
 * Every adapter a Node host needs, except the host's own AgentRunner and progress.
 * @param {{ cwd: string, pluginRoot: string, env?: NodeJS.ProcessEnv }} host env: where programs are
 *   looked for and what they inherit; this process's environment by default
 */
export const createNodeAdapters = ({ cwd, pluginRoot, env = process.env }) => {
  const files = createNodeFiles()
  return Object.freeze({
    ...trackedState(files, cwd),
    ...pluginContent(files, pluginRoot, cwd),
    clock: createSystemClock(),
    hasher: createWebCryptoHasher(),
    workspace: createWorkspaceFiles({ files, root: cwd, list: listFolder }),
    ...programs(cwd, env),
    runtime: Object.freeze({ nodeVersion: () => process.version }),
  })
}

/**
 * The journal, active pipeline and tracked files, all in the working copy's tracking folder.
 * @param {ReturnType<typeof createNodeFiles>} files @param {string} cwd
 */
const trackedState = (files, cwd) => {
  const tracking = createTrackingStore({ files, root: cwd })
  return { journal: tracking.journal, activePipeline: tracking.activePipeline, files: tracking.files }
}

/**
 * What the plugin ships, and the agents the working copy adds to it.
 * @param {ReturnType<typeof createNodeFiles>} files @param {string} pluginRoot @param {string} cwd
 */
const pluginContent = (files, pluginRoot, cwd) => ({
  templates: createPluginTemplates({ files, pluginRoot }),
  workflowSource: createPluginWorkflows({ files, pluginRoot }),
  agentCatalog: createAgentCatalog({ files, pluginRoot, root: cwd }),
})

/**
 * Programs started from the working copy, git run through them, and where they are found.
 * @param {string} cwd @param {NodeJS.ProcessEnv} env
 */
const programs = (cwd, env) => {
  const commandRunner = createNodeCommandRunner({ root: cwd, env })
  return {
    commandRunner,
    sourceControl: createGitSourceControl({ commandRunner }),
    commitReplay: createGitCommitReplay({ commandRunner }),
    executables: createNodeExecutables({ root: cwd, env }),
  }
}
