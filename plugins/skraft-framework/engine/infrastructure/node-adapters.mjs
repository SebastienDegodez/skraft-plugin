import { homedir } from 'node:os'
import { createNodeFiles, listFolder } from './files/node-files.mjs'
import { createTrackingStore } from './tracking/tracking-store.mjs'
import { createNodeRunLock } from './tracking/lock-file.mjs'
import { createPluginTemplates } from './templates/plugin-templates.mjs'
import { createSystemClock } from './clock/system-clock.mjs'
import { createNodeTimer } from './clock/node-timer.mjs'
import { createWebCryptoHasher } from './crypto/web-crypto-hasher.mjs'
import { createWorkspaceFiles } from './workspace/workspace-files.mjs'
import { createUserSettings } from './settings/user-settings.mjs'
import { createHostSettings } from './settings/host-settings.mjs'
import { createGitSourceControl } from './source-control/git-source-control.mjs'
import { createGitCommitReplay } from './source-control/git-commit-replay.mjs'
import { createGhCodeHost } from './code-host/gh-code-host.mjs'
import { createAgentCatalog } from './agents/agent-catalog.mjs'
import { createPluginWorkflows } from './workflows/plugin-workflows.mjs'
import { createNodeCommandRunner, createNodeExecutables } from './process/node-processes.mjs'
import { createCopilotSdkLocator } from './copilot/copilot-sdk-locator.mjs'

/**
 * Every adapter a Node host needs, except the host's own AgentRunner and progress.
 * @param {{ cwd: string, pluginRoot: string, env?: NodeJS.ProcessEnv, agentHost?: import('./agents/agent-catalog.mjs').AgentHost, home?: string, signal?: AbortSignal }} host
 *   env: where programs are looked for and what they inherit; this process's environment by
 *   default. agentHost: the host that starts the agents; none for the CLI, which checks for both.
 *   home: the folder that holds the developer's `.skraft/config.json`; the user's home by default.
 *   signal: ends every command still running when it aborts (the host cancelled the run).
 */
export const createNodeAdapters = ({ cwd, pluginRoot, env = process.env, agentHost, home = homedir(), signal }) => {
  const files = createNodeFiles()
  return Object.freeze({
    ...trackedState(files, cwd),
    ...pluginContent(files, { pluginRoot, cwd, agentHost }),
    ...timekeeping(),
    hasher: createWebCryptoHasher(),
    ...configuration(files, { cwd, home, env }),
    ...programs(cwd, env, signal),
    runtime: Object.freeze({ nodeVersion: () => process.version }),
  })
}

/**
 * The working copy's files, the developer's own configuration in the home folder, what the
 * hosts set for their agents, and the Copilot SDK the Copilot CLI installed there.
 * @param {ReturnType<typeof createNodeFiles>} files @param {{ cwd: string, home: string, env: NodeJS.ProcessEnv }} where
 */
const configuration = (files, { cwd, home, env }) => ({
  workspace: createWorkspaceFiles({ files, root: cwd, list: listFolder }),
  userSettings: createUserSettings({ files, home }),
  hostSettings: createHostSettings({ files, home, env }),
  copilotSdk: createCopilotSdkLocator({ home }),
})

/** The clock, and the timer that renews this session's lease. */
const timekeeping = () => ({ clock: createSystemClock(), timer: createNodeTimer() })

/**
 * The journal, active pipeline, tracked files and this session's lease, all in the working
 * copy's tracking folder.
 * @param {ReturnType<typeof createNodeFiles>} files @param {string} cwd
 */
const trackedState = (files, cwd) => {
  const tracking = createTrackingStore({ files, root: cwd })
  return { journal: tracking.journal, activePipeline: tracking.activePipeline, files: tracking.files, runLock: createNodeRunLock({ root: cwd }) }
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

/** How long a command may run, by kind: git, and the developer's commands (gates, TDD replay). */
const GIT_TIMEOUT_MS = 300_000
const COMMAND_TIMEOUT_MS = 7_200_000

/**
 * Programs started from the working copy, git and gh run through them, and where they are found; each
 * kind with its time limit, every one ended when the signal aborts.
 * @param {string} cwd @param {NodeJS.ProcessEnv} env @param {AbortSignal | undefined} signal
 */
const programs = (cwd, env, signal) => {
  const commandRunner = createNodeCommandRunner({ root: cwd, env, signal, timeoutMs: COMMAND_TIMEOUT_MS })
  return {
    commandRunner,
    sourceControl: createGitSourceControl({ commandRunner: createNodeCommandRunner({ root: cwd, env, signal, timeoutMs: GIT_TIMEOUT_MS }) }),
    commitReplay: createGitCommitReplay({ commandRunner }),
    codeHost: createGhCodeHost({ commandRunner: createNodeCommandRunner({ root: cwd, env, signal, timeoutMs: GIT_TIMEOUT_MS }) }),
    executables: createNodeExecutables({ root: cwd, env }),
  }
}
