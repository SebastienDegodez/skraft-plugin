import { homedir } from 'node:os'
import { join } from 'node:path'
import { createNodeFiles, listFolder, writeSecret } from './files/node-files.mjs'
import { createReviewStore, createTrackingStore, REVIEWS_FOLDER } from './tracking/tracking-store.mjs'
import { createReviewFolder } from './tracking/review-folder.mjs'
import { createNodeRunLock } from './tracking/lock-file.mjs'
import { createPluginTemplates } from './templates/plugin-templates.mjs'
import { createSystemClock } from './clock/system-clock.mjs'
import { createNodeTimer } from './clock/node-timer.mjs'
import { createWebCryptoHasher } from './crypto/web-crypto-hasher.mjs'
import { createJournalKeys } from './crypto/journal-keys.mjs'
import { createWorkspaceFiles } from './workspace/workspace-files.mjs'
import { createUserSettings } from './settings/user-settings.mjs'
import { createHostSettings } from './settings/host-settings.mjs'
import { createGitSourceControl } from './source-control/git-source-control.mjs'
import { createForges } from './code-host/forges.mjs'
import { createAgentCatalog } from './agents/agent-catalog.mjs'
import { createPluginWorkflows } from './workflows/plugin-workflows.mjs'
import { createNodeCommandRunner, createNodeExecutables } from './process/node-processes.mjs'
import { createCopilotSdkLocator } from './copilot/copilot-sdk-locator.mjs'
import { createProgramLauncher } from './process/program-launcher.mjs'
import { createNodeKernelHost } from './repl/node-kernel.mjs'
import { createRunDigests } from './repl/run-digests.mjs'
import { createOrphanJournal, processCreation } from './repl/orphans.mjs'

/**
 * Every adapter a Node host needs, except the host's own AgentRunner and progress.
 * @param {{ cwd: string, pluginRoot: string, env?: NodeJS.ProcessEnv, agentHost?: import('./agents/agent-catalog.mjs').AgentHost, home?: string, signal?: AbortSignal }} host
 *   env: where programs are looked for and what they inherit; this process's environment by
 *   default. agentHost: the host that starts the agents; none for the CLI, which checks for both.
 *   home: the folder that holds the developer's `.skraft-design/config.json` and `.skraft-design/journal-keys/`;
 *   the user's home by default.
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
 * The working copy's files, the developer's own configuration and journal keys in the home
 * folder, what the hosts set for their agents, and the Copilot SDK the Copilot CLI installed there.
 * @param {ReturnType<typeof createNodeFiles>} files @param {{ cwd: string, home: string, env: NodeJS.ProcessEnv }} where
 */
const configuration = (files, { cwd, home, env }) => ({
  workspace: createWorkspaceFiles({ files, root: cwd, list: listFolder }),
  userSettings: createUserSettings({ files, home }),
  journalKeys: createJournalKeys({ files, home: async () => home, writeSecret, fixedKey: env.SKRAFT_DESIGN_JOURNAL_KEY ?? null }),
  hostSettings: createHostSettings({ files, home, env }),
  copilotSdk: createCopilotSdkLocator({ home }),
})

/** The clock, and the timer that renews this session's lease. */
const timekeeping = () => ({ clock: createSystemClock(), timer: createNodeTimer() })

/**
 * The journal, active pipeline, tracked files and this session's lease, all in the working
 * copy's tracking folder, and the journal and files of the pull request reviews in theirs.
 * @param {ReturnType<typeof createNodeFiles>} files @param {string} cwd
 */
const trackedState = (files, cwd) => {
  const tracking = createTrackingStore({ files, root: cwd })
  const reviews = createReviewStore({ files, root: cwd })
  return { journal: tracking.journal, activePipeline: tracking.activePipeline, files: tracking.files, runLock: createNodeRunLock({ root: cwd }), reviewJournal: reviews.journal, reviewFiles: reviews.files, reviewLock: createNodeRunLock({ root: cwd, folder: REVIEWS_FOLDER }), reviewFolder: createReviewFolder({ root: cwd }) }
}

/**
 * What the plugin ships, the agents the working copy adds to it for the host that starts them.
 * @param {ReturnType<typeof createNodeFiles>} files
 * @param {{ pluginRoot: string, cwd: string, agentHost: import('./agents/agent-catalog.mjs').AgentHost | undefined }} where
 */
const pluginContent = (files, { pluginRoot, cwd, agentHost }) => ({
  templates: createPluginTemplates({ files, pluginRoot }),
  workflowSource: createPluginWorkflows({ files, pluginRoot }),
  agentCatalog: createAgentCatalog({ files, pluginRoot, root: cwd, host: agentHost }),
})

/** How long a command may run, by kind: git, and the developer's commands (gates). */
const GIT_TIMEOUT_MS = 300_000
const COMMAND_TIMEOUT_MS = 7_200_000

/**
 * Programs started from the working copy, git and each forge's client run through them, and where they are found; each
 * kind with its time limit, every one ended when the signal aborts.
 * @param {string} cwd @param {NodeJS.ProcessEnv} env @param {AbortSignal | undefined} signal
 */
const programs = (cwd, env, signal) => {
  const commandRunner = createNodeCommandRunner({ root: cwd, env, signal, timeoutMs: COMMAND_TIMEOUT_MS })
  const forge = createNodeCommandRunner({ root: cwd, env, signal, timeoutMs: GIT_TIMEOUT_MS })
  return {
    commandRunner,
    sourceControl: createGitSourceControl({ commandRunner: createNodeCommandRunner({ root: cwd, env, signal, timeoutMs: GIT_TIMEOUT_MS }) }),
    forges: createForges({ commandRunner: forge }),
    executables: createNodeExecutables({ root: cwd, env }),
    repl: replAdapters(cwd, env),
  }
}

/**
 * This server's own start time, asked of the system once per process, while the server goes on;
 * null until the system has answered, or when it cannot.
 * @type {{ created: string | null, asked: boolean }}
 */
const serverStart = { created: null, asked: false }

/** @returns {{ pid: number, created: string | null }} */
const thisServer = () => {
  if (!serverStart.asked) askServerStart()
  return { pid: process.pid, created: serverStart.created }
}

const askServerStart = () => {
  serverStart.asked = true
  void processCreation(process.pid).then((created) => { serverStart.created = created })
}

/**
 * What the agents' REPL needs: the kernel host, the launcher of its programs, the journal of the
 * processes it started (for a later server to end what a killed one left), the lease on each
 * attempt, and this server as the leases and the journal name it.
 * @param {string} cwd @param {NodeJS.ProcessEnv} env
 */
const replAdapters = (cwd, env) => Object.freeze({
  root: cwd,
  kernels: createNodeKernelHost(),
  launcher: createProgramLauncher({ root: cwd, env }),
  digests: createRunDigests(),
  orphans: createOrphanJournal({ folder: join(cwd, '.copilot-tracking', 'skraft-repl') }),
  locks: createNodeRunLock({ root: cwd }),
  get server() { return thisServer() },
})
