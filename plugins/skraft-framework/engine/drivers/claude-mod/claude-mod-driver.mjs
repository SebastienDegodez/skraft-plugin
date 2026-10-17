import { createInit } from '../../application/init.mjs'
import { createRunPipeline } from '../../application/run-pipeline.mjs'
import { createObserve } from '../../application/observe.mjs'
import { createTrackingStore } from '../../infrastructure/tracking/tracking-store.mjs'
import { createPluginTemplates } from '../../infrastructure/templates/plugin-templates.mjs'
import { createSystemClock } from '../../infrastructure/clock/system-clock.mjs'
import { createWebCryptoHasher } from '../../infrastructure/crypto/web-crypto-hasher.mjs'
import { createWorkspaceFiles } from '../../infrastructure/workspace/workspace-files.mjs'
import { createGitSourceControl } from '../../infrastructure/source-control/git-source-control.mjs'
import { createGitCommitReplay } from '../../infrastructure/source-control/git-commit-replay.mjs'
import { createAgentCatalog } from '../../infrastructure/agents/agent-catalog.mjs'
import { createPluginWorkflows } from '../../infrastructure/workflows/plugin-workflows.mjs'
import { createModCommandRunner } from './mod-processes.mjs'
import { createModFiles } from './mod-files.mjs'
import { createAgentAnswers, createSpawnAgentRunner } from './agent-runner.mjs'
import { parseSkraftCommand, toolRequest } from './command-args.mjs'
import { viewText } from './run-view.mjs'

/**
 * The Claude Code mod's composition: `/skraft`, the `run_pipeline` tool and the pane's
 * snapshot, over the engine's use cases. The registered module hands it one-line
 * functions on `$` (ModHost); it decides nothing the use cases decide.
 *
 * @typedef {import('./mod-files.mjs').ModFs} ModFs
 * @typedef {import('./agent-runner.mjs').SpawnArgs} SpawnArgs
 * @typedef {import('./agent-runner.mjs').SpawnResult} SpawnResult
 * @typedef {import('./agent-runner.mjs').TurnComplete} TurnComplete
 * @typedef {import('./run-view.mjs').PipelineSnapshot} PipelineSnapshot
 * @typedef {import('./command-args.mjs').Story} Story
 * @typedef {import('../../application/active-run.mjs').RunOutcome} RunOutcome
 * @typedef {{
 *   fs: ModFs,
 *   cwd: () => Promise<string>,
 *   pluginRoot: string,
 *   pluginName: string,
 *   spawn: (args: SpawnArgs) => Promise<SpawnResult>,
 *   run: import('./mod-processes.mjs').ModRun,
 *   sessionCostUsd: () => Promise<number | null>,
 *   later: (run: () => void) => void,
 *   publish: (snapshot: PipelineSnapshot) => Promise<unknown>,
 *   status: (text: string | undefined) => void,
 *   notify: (line: string) => void,
 *   clock?: import('../../application/ports/clock.mjs').Clock,
 * }} ModHost
 *   cwd: `$.session.cwd()`; run: `$.process.run`; later: `$.clock.after(0, run)`; publish: the pane's `$.state`;
 *   status: `$.ui.status`; notify: `$.ui.log` and a toast.
 */

export const PANE_ID = 'skraft-pipeline'
export const PANE_TITLE = 'Skraft'
export const COMMAND = Object.freeze({
  name: 'skraft',
  // Stryker disable next-line StringLiteral: text shown to the host and the model; no engine behaviour reads it
  description: 'Run the skraft pipeline for one story, or show where the active one stands',
  // Stryker disable next-line StringLiteral: text shown to the host and the model; no engine behaviour reads it
  argumentHint: '[<slug> [#issue] [title…] [--base <ref>] [--from-artifacts]] | decide …',
})
export const TOOL = Object.freeze({
  name: 'run_pipeline',
  // Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
  description:
    'Start or resume the skraft engineering pipeline of this working copy for one story. ' +
    'Returns at once; the run goes on in the background and reports in the Skraft pane. ' +
    'Without a slug it resumes the active pipeline; it never picks a slug itself.',
  // Stryker restore StringLiteral
  inputSchema: Object.freeze({
    type: 'object',
    properties: {
      // Stryker disable StringLiteral: descriptions shown to the model; the types are checked by the tool-input tests
      slug: { type: 'string', description: 'kebab-case feature scope; omit to resume the active pipeline' },
      issue: { type: 'integer', description: 'the story issue number' },
      title: { type: 'string', description: 'the story title' },
      base: { type: 'string', description: 'git ref to diff against instead of the configured base; only for a new slug' },
      fromArtifacts: { type: 'boolean', description: 'start a new slug in DESIGN from the DISCUSS stories already in its tracking folder' },
      // Stryker restore StringLiteral
    },
  }),
})

const LOG_KEPT = 60

/**
 * @typedef {{
 *   answers: import('./agent-runner.mjs').AgentAnswers,
 *   running: string | null,
 *   current: Promise<RunOutcome | null>,
 *   log: string[],
 *   publishing: Promise<unknown>,
 * }} DriverState
 *   running: the slug of the run in progress, so that one run goes at a time; current: the
 *   run started last; log: the pane's lines of that run; publishing: the last snapshot sent.
 * @typedef {Awaited<ReturnType<typeof compose>>} ModDeps
 * @typedef {{ slug: string | null, story: Story, base: string | null, fromArtifacts: boolean }} StartRequest
 * @typedef {{ launched: boolean, text: string }} StartAnswer
 */

/** One driver per loaded module: the run it drives and the subagents' answers. */
export const createClaudeModDriver = () => {
  const driver = newDriverState()
  return Object.freeze({
    /** `turn.complete`: a subagent's answer. @param {TurnComplete} turn */
    turnComplete: (turn) => driver.answers.complete(turn),

    /** `/skraft <args>`. @param {ModHost} host @param {unknown} args @returns {Promise<string>} */
    command: (host, args) => answerCommand(driver, host, args),

    /** `mcp__<plugin>__run_pipeline`. @param {ModHost} host @param {Parameters<typeof toolRequest>[0]} input */
    tool: (host, input) => start(driver, host, toolRequest(input)),

    /** Publishes the pane's snapshot of the working copy as it stands. @param {ModHost} host */
    refresh: async (host) => refresh(driver, host, await compose(host)),

    /** The run started last, once it has stopped (null when it could not run). */
    settled: () => driver.current,
  })
}

/** @returns {DriverState} */
const newDriverState = () => ({
  answers: createAgentAnswers(),
  running: null,
  current: Promise.resolve(null),
  log: [],
  publishing: Promise.resolve(),
})

/** @param {ModHost} host */
const compose = async (host) => {
  const files = createModFiles(host.fs, { run: host.run })
  const root = await host.cwd()
  return {
    ...trackingPorts(files, root),
    ...pluginPorts(files, host.pluginRoot, root),
    clock: host.clock ?? createSystemClock(),
    hasher: createWebCryptoHasher(),
    workspace: createWorkspaceFiles({ files, root }),
    ...gitPorts(createModCommandRunner({ run: host.run, root })),
  }
}

/** @param {ReturnType<typeof createModFiles>} files @param {string} root */
const trackingPorts = (files, root) => {
  const tracking = createTrackingStore({ files, root })
  return { journal: tracking.journal, activePipeline: tracking.activePipeline, files: tracking.files }
}

/** What the plugin ships: templates, workflows, agents. @param {ReturnType<typeof createModFiles>} files @param {string} pluginRoot @param {string} root */
const pluginPorts = (files, pluginRoot, root) => ({
  templates: createPluginTemplates({ files, pluginRoot }),
  workflowSource: createPluginWorkflows({ files, pluginRoot }),
  agentCatalog: createAgentCatalog({ files, pluginRoot, root, host: 'claude-code' }),
})

/** @param {ReturnType<typeof createModCommandRunner>} commandRunner */
const gitPorts = (commandRunner) => ({
  commandRunner,
  sourceControl: createGitSourceControl({ commandRunner }),
  commitReplay: createGitCommitReplay({ commandRunner }),
})

/** The pane's snapshot, published in order. @param {DriverState} driver @param {ModHost} host @param {ModDeps} deps */
const refresh = (driver, host, deps) => {
  driver.publishing = driver.publishing
    .then(async () => host.publish({ view: await createObserve(deps).view(), log: [...driver.log] }))
    .catch(() => undefined)
  return driver.publishing
}

/** @param {DriverState} driver @param {string} line */
const remember = (driver, line) => { driver.log = [...driver.log, line].slice(-LOG_KEPT) }

/**
 * RunPipeline's ports for this host: the tracking folder, the spawn runner, the pane.
 * @param {DriverState} driver @param {ModHost} host @param {ModDeps} deps @param {string | null} slug
 */
const pipelineOf = (driver, host, deps, slug) => createRunPipeline({
  ...deps,
  agentRunner: createSpawnAgentRunner({ spawn: host.spawn, answers: driver.answers, pluginName: host.pluginName, sessionCostUsd: host.sessionCostUsd }),
  progress: progressOf(driver, host, deps, slug),
})

/** The pane follows the run: the phase in the status, each line in the log. @param {DriverState} driver @param {ModHost} host @param {ModDeps} deps @param {string | null} slug */
const progressOf = (driver, host, deps, slug) => ({
  phase: (/** @type {string} */ phase) => {
    host.status(`skraft ${slug} · ${phase}`)
    void refresh(driver, host, deps)
  },
  log: (/** @type {string} */ message) => {
    remember(driver, message)
    void refresh(driver, host, deps)
  },
})

/** @param {DriverState} driver @param {ModHost} host @param {ModDeps} deps @param {string} slug */
const drive = async (driver, host, deps, slug) => {
  const { outcome, line } = await runToEnd(driver, host, deps, slug)
  driver.running = null
  remember(driver, line)
  await refresh(driver, host, deps)
  host.status(undefined)
  host.notify(line)
  return outcome
}

/** The run's outcome and the line that tells it, an error included. @param {DriverState} driver @param {ModHost} host @param {ModDeps} deps @param {string} slug */
const runToEnd = async (driver, host, deps, slug) => {
  /** @type {{ outcome: RunOutcome | null, line: string }} */
  const ended = { outcome: null, line: '' }
  try {
    ended.outcome = await pipelineOf(driver, host, deps, slug).run({ slug })
    ended.line = outcomeText(ended.outcome)
  } catch (error) {
    ended.line = `skraft ${slug}: error — ${error instanceof Error ? error.message : String(error)}`
  }
  return ended
}

/** @param {DriverState} driver @param {ModHost} host @param {unknown} args @returns {Promise<string>} */
const answerCommand = async (driver, host, args) => {
  const request = parseSkraftCommand(args)
  if (request.command === 'run') return start(driver, host, request)
  const deps = await compose(host)
  if (request.command === 'decide') return nothingToDecide(deps)
  return viewText(await createObserve(deps).view())
}

/** @param {ModDeps} deps */
const nothingToDecide = async (deps) => {
  const slug = await deps.activePipeline.current()
  return `skraft: no question is pending${slug ? ` for ${slug}` : ''}; nothing to decide.`
}

/**
 * One run at a time: the request holds the driver until its run is launched or turned down.
 * @param {DriverState} driver @param {ModHost} host @param {StartRequest} request @returns {Promise<string>}
 */
const start = async (driver, host, request) => {
  if (driver.running !== null) return `skraft is already running ${driver.running}; see the Skraft pane.`
  driver.running = request.slug ?? 'the active pipeline'
  let launched = false
  try {
    const answer = await startHeld(driver, host, request)
    launched = answer.launched
    return answer.text
  } finally {
    if (!launched) driver.running = null
  }
}

/** A named slug is initialised first. @param {DriverState} driver @param {ModHost} host @param {StartRequest} request @returns {Promise<StartAnswer>} */
const startHeld = async (driver, host, { slug, story, base, fromArtifacts }) => {
  const deps = await compose(host)
  if (slug === null) return resumeActive(driver, host, deps)
  const initialised = await createInit(deps).init({ slug, story, base, fromArtifacts })
  if (!initialised.ok) return notLaunched(`skraft ${slug}: not started — ${initialised.reason}`)
  return launch(driver, host, deps, slug)
}

/** Without a slug: the active pipeline, or RunPipeline's answer when there is none. @param {DriverState} driver @param {ModHost} host @param {ModDeps} deps @returns {Promise<StartAnswer>} */
const resumeActive = async (driver, host, deps) => {
  const active = await deps.activePipeline.current()
  if (active === null) return notLaunched(outcomeText(await pipelineOf(driver, host, deps, null).run({})))
  return launch(driver, host, deps, active)
}

/** Clears the pane and drives the run in the background. @param {DriverState} driver @param {ModHost} host @param {ModDeps} deps @param {string} slug @returns {Promise<StartAnswer>} */
const launch = async (driver, host, deps, slug) => {
  driver.running = slug
  driver.log = []
  await refresh(driver, host, deps)
  host.later(() => { driver.current = drive(driver, host, deps, slug) })
  return { launched: true, text: `skraft ${slug} started — progress in the Skraft pane.` }
}

/** @param {string} text @returns {StartAnswer} */
const notLaunched = (text) => ({ launched: false, text })

/** @param {RunOutcome} outcome */
export const outcomeText = ({ slug, status, code, reason }) =>
  `skraft${slug ? ` ${slug}` : ''}: ${status}${code ? ` (${code})` : ''} — ${reason}`
