import { homedir } from 'node:os'
import { createNodeFiles, listFolder } from './files/node-files.mjs'
import { createTrackingStore } from './tracking/tracking-store.mjs'
import { createPluginTemplates } from './templates/plugin-templates.mjs'
import { createSystemClock } from './clock/system-clock.mjs'
import { createWebCryptoHasher } from './crypto/web-crypto-hasher.mjs'
import { createWorkspaceFiles } from './workspace/workspace-files.mjs'
import { createUserSettings } from './settings/user-settings.mjs'
import { createGitSourceControl } from './source-control/git-source-control.mjs'
import { createGitCommitReplay } from './source-control/git-commit-replay.mjs'
import { createAgentCatalog } from './agents/agent-catalog.mjs'
import { createPluginWorkflows } from './workflows/plugin-workflows.mjs'
import { createNodeCommandRunner, createNodeExecutables } from './process/node-processes.mjs'

/**
 * Every adapter a Node host needs, except the host's own AgentRunner and progress.
 * @param {{ cwd: string, pluginRoot: string, env?: NodeJS.ProcessEnv, agentHost?: import('./agents/agent-catalog.mjs').AgentHost, home?: string }} host
 *   env: where programs are looked for and what they inherit; this process's environment by
 *   default. agentHost: the host that starts the agents; none for the CLI, which checks for both.
 *   home: the folder that holds the developer's `.skraft/config.json`; the user's home by default.
 */
export const createNodeAdapters = ({ cwd, pluginRoot, env = process.env, agentHost, home = homedir() }) => {
  const files = createNodeFiles()
  return Object.freeze({
    ...trackedState(files, cwd),
    ...pluginContent(files, { pluginRoot, cwd, agentHost }),
    clock: createSystemClock(),
    hasher: createWebCryptoHasher(),
    ...configuration(files, cwd, home),
    ...programs(cwd, env),
    runtime: Object.freeze({ nodeVersion: () => process.version }),
  })
}

/**
 * The working copy's files, and the developer's own configuration in the home folder.
 * @param {ReturnType<typeof createNodeFiles>} files @param {string} cwd @param {string} home
 */
const configuration = (files, cwd, home) => ({
  workspace: createWorkspaceFiles({ files, root: cwd, list: listFolder }),
  userSettings: createUserSettings({ files, home }),
})

/**
 * The journal, active pipeline and tracked files, all in the working copy's tracking folder.
 * @param {ReturnType<typeof createNodeFiles>} files @param {string} cwd
 */
const trackedState = (files, cwd) => {
  const tracking = createTrackingStore({ files, root: cwd })
  return { journal: tracking.journal, activePipeline: tracking.activePipeline, files: tracking.files }
}

/**
 * What the plugin ships, and the agents the working copy adds to it for the host that starts them.
 * @param {ReturnType<typeof createNodeFiles>} files
 * @param {{ pluginRoot: string, cwd: string, agentHost: import('./agents/agent-catalog.mjs').AgentHost | undefined }} where
 */
const pluginContent = (files, { pluginRoot, cwd, agentHost }) => ({
  templates: createPluginTemplates({ files, pluginRoot }),
  workflowSource: createPluginWorkflows({ files, pluginRoot }),
  agentCatalog: createAgentCatalog({ files, pluginRoot, root: cwd, host: agentHost }),
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
