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

/** One driver per loaded module: the run it drives and the subagents' answers. */
export const createClaudeModDriver = () => {
  const answers = createAgentAnswers()
  /** @type {string | null} */
  let running = null
  /** @type {Promise<RunOutcome | null>} */
  let current = Promise.resolve(null)
  /** @type {string[]} */
  let log = []
  /** @type {Promise<unknown>} */
  let publishing = Promise.resolve()

  /** @param {ModHost} host */
  const compose = async (host) => {
    const files = createModFiles(host.fs, { run: host.run })
    const root = await host.cwd()
    const tracking = createTrackingStore({ files, root })
    const commandRunner = createModCommandRunner({ run: host.run, root })
    return {
      journal: tracking.journal,
      activePipeline: tracking.activePipeline,
      files: tracking.files,
      templates: createPluginTemplates({ files, pluginRoot: host.pluginRoot }),
      clock: host.clock ?? createSystemClock(),
      hasher: createWebCryptoHasher(),
      workspace: createWorkspaceFiles({ files, root }),
      commandRunner,
      sourceControl: createGitSourceControl({ commandRunner }),
      commitReplay: createGitCommitReplay({ commandRunner }),
      workflowSource: createPluginWorkflows({ files, pluginRoot: host.pluginRoot }),
      agentCatalog: createAgentCatalog({ files, pluginRoot: host.pluginRoot, root, host: 'claude-code' }),
    }
  }

  /** The pane's snapshot, published in order. @param {ModHost} host @param {Awaited<ReturnType<typeof compose>>} deps */
  const refresh = (host, deps) => {
    publishing = publishing
      .then(async () => host.publish({ view: await createObserve(deps).view(), log: [...log] }))
      .catch(() => undefined)
    return publishing
  }

  /** @param {string} line */
  const remember = (line) => { log = [...log, line].slice(-LOG_KEPT) }

  /**
   * RunPipeline's ports for this host: the tracking folder, the spawn runner, the pane.
   * @param {ModHost} host @param {Awaited<ReturnType<typeof compose>>} deps @param {string | null} slug
   */
  const pipelineOf = (host, deps, slug) => createRunPipeline({
    ...deps,
    agentRunner: createSpawnAgentRunner({ spawn: host.spawn, answers, pluginName: host.pluginName, sessionCostUsd: host.sessionCostUsd }),
    progress: {
      phase: (phase) => {
        host.status(`skraft ${slug} · ${phase}`)
        void refresh(host, deps)
      },
      log: (message) => {
        remember(message)
        void refresh(host, deps)
      },
    },
  })

  /** @param {ModHost} host @param {Awaited<ReturnType<typeof compose>>} deps @param {string} slug */
  const drive = async (host, deps, slug) => {
    /** @type {RunOutcome | null} */
    let outcome = null
    let line
    try {
      outcome = await pipelineOf(host, deps, slug).run({ slug })
      line = outcomeText(outcome)
    } catch (error) {
      line = `skraft ${slug}: error — ${error instanceof Error ? error.message : String(error)}`
    }
    running = null
    remember(line)
    await refresh(host, deps)
    host.status(undefined)
    host.notify(line)
    return outcome
  }

  /** @param {ModHost} host @param {{ slug: string | null, story: Story, base: string | null, fromArtifacts: boolean }} request @returns {Promise<string>} */
  const start = async (host, { slug, story, base, fromArtifacts }) => {
    if (running !== null) return `skraft is already running ${running}; see the Skraft pane.`
    running = slug ?? 'the active pipeline'
    let launched = false
    try {
      const deps = await compose(host)
      let target = slug
      if (target === null) {
        target = await deps.activePipeline.current()
        if (target === null) return outcomeText(await pipelineOf(host, deps, null).run({}))
      } else {
        const initialised = await createInit(deps).init({ slug: target, story, base, fromArtifacts })
        if (!initialised.ok) return `skraft ${target}: not started — ${initialised.reason}`
      }
      const slugToRun = target
      running = slugToRun
      log = []
      await refresh(host, deps)
      host.later(() => { current = drive(host, deps, slugToRun) })
      launched = true
      return `skraft ${slugToRun} started — progress in the Skraft pane.`
    } finally {
      if (!launched) running = null
    }
  }

  return Object.freeze({
    /** `turn.complete`: a subagent's answer. @param {TurnComplete} turn */
    turnComplete: (turn) => answers.complete(turn),

    /** `/skraft <args>`. @param {ModHost} host @param {unknown} args @returns {Promise<string>} */
    command: async (host, args) => {
      const request = parseSkraftCommand(args)
      if (request.command === 'run') return start(host, request)
      const deps = await compose(host)
      if (request.command === 'decide') {
        const slug = await deps.activePipeline.current()
        return `skraft: no question is pending${slug ? ` for ${slug}` : ''}; nothing to decide.`
      }
      return viewText(await createObserve(deps).view())
    },

    /** `mcp__<plugin>__run_pipeline`. @param {ModHost} host @param {Parameters<typeof toolRequest>[0]} input */
    tool: (host, input) => start(host, toolRequest(input)),

    /** Publishes the pane's snapshot of the working copy as it stands. @param {ModHost} host */
    refresh: async (host) => refresh(host, await compose(host)),

    /** The run started last, once it has stopped (null when it could not run). */
    settled: () => current,
  })
}

/** @param {RunOutcome} outcome */
export const outcomeText = ({ slug, status, code, reason }) =>
  `skraft${slug ? ` ${slug}` : ''}: ${status}${code ? ` (${code})` : ''} — ${reason}`
