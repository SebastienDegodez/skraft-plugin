// SKRAFT pipeline as a Claude Code mod — composition root of the RunPipeline use case
// (src/application/pipeline/run-pipeline.mjs) for Claude Code. See docs/run-pipeline.md.
//
//   /skraft <slug> [#issue] [title…]          start (or resume) the pipeline, progress in a pane
//   /skraft                                   where the pipeline stands
//   /skraft decide <slug> <key> <answer…>     answer a checkpoint, then /skraft <slug> resumes
//   /skraft close <slug> [findings]           close the open phase after human-validated reworks
//   mcp__skraft__run_pipeline                 start or resume, for the main agent
//
// Driven adapters that touch `$` are declared in this file: the mods engine follows `$`
// only into functions of the hooks module, never across an import. Each one translates a
// port onto `$`; none decides:
//   TrackingStore, RepositoryReader, TemplateReader $.fs
//   SourceTree                                     git ls-files through $.process.run, $.fs
//   ActivePipeline                                 $.fs ({trackingRoot}/.active-slug)
//   AgentRunner                                    $.agent.spawn + the subagent's turn.complete
//   HumanInteraction                               $.ui.ask (null when nothing draws)
//   PipelineProgress                               $.state atom + pane + $.ui.status
// The adapters that need no `$` of their own come from src/adapters/infrastructure/
// (SourceControl on a git runner, Hasher on Web Crypto, the state adapters on file
// functions — reader, snapshot writer, backups, archive — and DecisionStore); this file
// hands them functions built on `$`. The quality-gate evidence check and the
// structural scan run in process, inside RunPipeline: no command line. The run outlives the command that started it: it
// is driven from a $.clock timer.
//
// G8, write rights per agent role, is judged here on every Write, Edit, MultiEdit,
// NotebookEdit and Bash call (WriteRightsGuard, src/application/write-rights-guard.mjs):
// the engine names the loop a call runs in (agentId), $.agent.list() its agent type and
// who spawned it, SessionStart's agent_type the main loop's agent under --agent. A guard
// that fails refuses the call. The settings hooks (hooks.json `hooks`) keep G2/G3, G7,
// provenance, and G8 for a Claude Code without mods.
import { atom, read, update } from 'claude-code'
import { createRunPipeline } from '../src/application/pipeline/run-pipeline.mjs'
import { createRecordDecision } from '../src/application/pipeline/record-decision.mjs'
import { createCloseManually } from '../src/application/pipeline/close-manually.mjs'
import { activePipelineSlug } from '../src/application/pipeline/active-pipeline.mjs'
import { stateBaseSegments, resolveTrackingLayout } from '../src/domain/tracking-layout-policy.mjs'
import { createSystemTime } from '../src/adapters/infrastructure/system-time.mjs'
import { createGitSourceControl } from '../src/adapters/infrastructure/git/git-source-control.mjs'
import { createProcessGitRunner } from '../src/adapters/infrastructure/git/process-git-runner.mjs'
import { createGitSourceTree } from '../src/adapters/infrastructure/source-tree/git-source-tree.mjs'
import { createWebCryptoHasher } from '../src/adapters/infrastructure/web-crypto-hasher.mjs'
import { createAgentReportTransport } from '../src/adapters/infrastructure/reporting/agent-report-transport.mjs'
import { createSnapshotStateWriter } from '../src/adapters/infrastructure/state/snapshot-state-writer.mjs'
import { createFileStateReader, createFileStateBackupReader, createFileStateArchive } from '../src/adapters/infrastructure/state/file-state-store.mjs'
import { createTrackingDecisionStore } from '../src/adapters/infrastructure/pipeline/tracking-decision-store.mjs'
import { joinPath, claudeAgentId, walkFiles, askable, claudeUsage, callerChain, lastSegment } from '../src/adapters/infrastructure/claude-code-mod/mod-helpers.mjs'
import { createWriteRightsGuard } from '../src/application/write-rights-guard.mjs'
import { parseSkraftArgs } from '../src/adapters/api/claude-code-mod/command-args.mjs'

/** @typedef {import('claude-code').Register} Register */

const PANE = 'skraft-pipeline'
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER']
const IDLE = { slug: null, status: 'idle', phase: null, reason: '', log: [], checkpointKey: null }
const run = atom({ plugin: 'skraft', key: 'run' }, IDLE)
// The main loop's agent type when the session runs --agent (SessionStart's agent_type).
const mainAgent = atom({ plugin: 'skraft', key: 'mainAgent' }, null)
// The tools G8 judges: the ones that write a file, and the shell.
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']

let active = null // slug of the run this module drives, if any
const waiting = new Map() // agentId → resolve
const finished = new Map() // agentId → answer, for a subagent done before we listened

const waitForAgent = (agentId) => {
  if (finished.has(agentId)) {
    const answer = finished.get(agentId)
    finished.delete(agentId)
    return Promise.resolve(answer)
  }
  return new Promise((resolve) => waiting.set(agentId, resolve))
}

// The process runner the git runner receives: git is the only process the mod starts.
async function processRun($, cwd, argv, { timeoutMs = 600_000, stdin } = {}) {
  try {
    const result = await $.process.run(argv, { cwd, timeoutMs: Math.min(timeoutMs, 600_000), ...(stdin === undefined ? {} : { stdin }) })
    return { exitCode: result.exitCode, stdout: result.stdout ?? '', stderr: result.stderr ?? '', isStdoutTruncated: result.isStdoutTruncated === true }
  } catch (error) {
    return { exitCode: 124, stdout: '', stderr: String(error?.message ?? error) }
  }
}

// The session's cost so far, in US dollars, as /cost totals it; null where none is kept.
async function sessionCostUsd($) {
  try {
    const usd = (await $.session.usage()).cost?.usd
    return typeof usd === 'number' ? usd : null
  } catch {
    return null
  }
}

async function trackingRootOf($, cwd) {
  const explicit = await $.env.get('SKRAFT_TRACKING_ROOT')
  if (explicit) return explicit
  let layout = await $.env.get('SKRAFT_TRACKING_LAYOUT')
  if (!layout) {
    try { layout = JSON.parse(await $.fs.read(joinPath(cwd, 'skraft-config.json')))?.trackingLayout } catch { /* default */ }
  }
  return [cwd, ...stateBaseSegments(resolveTrackingLayout(layout))].join('/')
}

// Composition: the RunPipeline dependencies for this session.
async function pipelineDependencies($, { config, cwd, trackingRoot, slug }) {
  const pluginName = $.plugin.name
  const time = createSystemTime()
  const runProcess = (argv, opts) => processRun($, cwd, argv, opts)
  const trackingDir = (s) => joinPath(trackingRoot, s)
  const relativeToCwd = (path) => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)
  const log = (line) => update($, run, (view) => ({ ...view, log: [...view.log, line].slice(-60) }))
  const git = createProcessGitRunner({ runProcess })

  // The file functions the host-neutral state adapters take, on $.fs
  const files = {
    exists: (path) => $.fs.exists(path),
    read: (path) => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    list: async (dir) => (await $.fs.list(dir)).filter((entry) => entry.kind === 'file').map((entry) => entry.name),
  }
  const now = () => time.now().getTime()

  // TrackingStore on $.fs
  const trackingStore = {
    exists: (s, rel) => $.fs.exists(joinPath(trackingDir(s), rel)),
    read: (s, rel) => $.fs.read(joinPath(trackingDir(s), rel)),
    list: (s) => walkFiles((dir) => $.fs.list(dir), trackingDir(s)),
    write: (s, rel, text) => $.fs.write(joinPath(trackingDir(s), rel), text),
    prefix: (s) => `${relativeToCwd(trackingDir(s))}/`,
  }

  // AgentRunner on $.agent.spawn
  const agentRunner = {
    run: async ({ agent, label, prompt }) => {
      // What the dispatch cost: the subagent's tokens, and the session's dollar cost before and after.
      const costBefore = await sessionCostUsd($)
      const spawned = await $.agent.spawn({
        prompt,
        subagentType: claudeAgentId(agent, config, pluginName),
        description: label.slice(0, 60),
      })
      if (spawned.deny || !spawned.agentId) return { ok: false, text: spawned.deny ?? 'not started' }
      const answer = await waitForAgent(spawned.agentId)
      const usage = claudeUsage(answer.usage, costBefore, await sessionCostUsd($))
      return { ok: answer.reason === 'answer' && answer.text.length > 0, text: answer.text, ...(usage ? { usage } : {}) }
    },
  }

  return {
    config,
    stateReader: createFileStateReader({ files, trackingRoot, now }),
    // StateWriter: a backup per phase change, read-back check (no rename on $.fs)
    stateWriter: createSnapshotStateWriter({ files, trackingRoot, now }),
    stateBackups: createFileStateBackupReader({ files, trackingRoot }),
    stateArchive: createFileStateArchive({ files, trackingRoot, now }),
    trackingStore,
    // RepositoryReader on $.fs
    repositoryReader: { read: async (rel) => { try { return await $.fs.read(joinPath(cwd, rel)) } catch { return null } } },
    // SourceControl: git through the process runner
    sourceControl: createGitSourceControl({ git }),
    // SourceTree: git ls-files, sizes and text on $.fs
    sourceTree: createGitSourceTree({
      git,
      sizeOf: async (rel) => {
        const stat = await $.fs.stat(joinPath(cwd, rel))
        return stat.kind === 'file' ? stat.size : null
      },
      readText: (rel) => $.fs.read(joinPath(cwd, rel)),
      listAll: async () => (await walkFiles((dir) => $.fs.list(dir), cwd)),
    }),
    hasher: createWebCryptoHasher(),
    // ActivePipeline: the pointer file the settings hooks read (written as cli/state.mjs select does)
    activePipeline: {
      activate: (s) => $.fs.write(joinPath(trackingRoot, '.active-slug'), `${s}\n`),
      current: async () => {
        try {
          const slug = (await $.fs.read(joinPath(trackingRoot, '.active-slug'))).trim()
          return SLUG.test(slug) ? slug : null
        } catch {
          return null
        }
      },
    },
    agentRunner,
    // ReportTransport: a general-purpose subagent, which sees the session's MCP tools
    reportTransportOf: (runner) => createAgentReportTransport({ agentRunner: runner, pluginRoot: $.plugin.root }),
    // HumanInteraction on the engine's question dialog; null when nothing draws
    humanInteraction: {
      ask: async ({ question, options }) => {
        if ((await $.session.surfaces()).length === 0) return null
        try {
          return await $.ui.ask(askable(question), { options: options.slice(0, 4), header: 'Skraft' })
        } catch {
          return null
        }
      },
    },
    decisionStore: createTrackingDecisionStore({ trackingStore, time }),
    // TemplateReader on $.fs, under the plugin root
    templateReader: { read: (path) => $.fs.read(joinPath($.plugin.root, path)) },
    // PipelineProgress on the $.state atom the pane draws, and the status line
    progress: {
      phase: (title) => {
        $.ui.status(`skraft ${slug} · ${title}`)
        void update($, run, (view) => ({ ...view, phase: title }))
      },
      log: (message) => void log(message),
    },
    time,
  }
}

async function frameworkConfig($) {
  return JSON.parse(await $.fs.read(joinPath($.plugin.root, 'skraft-framework.config.json')))
}

async function sessionDependencies($, slug) {
  const cwd = await $.session.cwd()
  const config = await frameworkConfig($)
  return pipelineDependencies($, { config, cwd, trackingRoot: await trackingRootOf($, cwd), slug })
}

// G8: the WriteRightsGuard verdict on one tool call, the caller resolved from the engine.
async function writeRightsVerdict($, e) {
  const cwd = await $.session.cwd()
  const config = await frameworkConfig($)
  const caller = callerChain({
    agentId: e.agentId,
    agents: e.agentId ? await $.agent.list() : [],
    mainAgent: await read($, mainAgent),
    pluginName: $.plugin.name,
  })
  const guard = createWriteRightsGuard({ config, trackingDir: lastSegment(await trackingRootOf($, cwd)) })
  return guard.judge({ caller, calls: [{ toolName: e.tool, toolInput: e }], cwd })
}

async function drive($, { slug, story }) {
  const outcome = await createRunPipeline(await sessionDependencies($, slug)).run({ slug, story })
  await update($, run, (view) => ({
    ...view,
    status: outcome.status,
    phase: outcome.phase ?? view.phase,
    reason: outcome.reason,
    checkpointKey: outcome.checkpoint?.key ?? null,
  }))
  $.ui.status(undefined)
  const summary = `skraft ${slug}: ${outcome.status} — ${outcome.reason}`
  $.ui.log(summary)
  $.ui.toast(summary)
  if (outcome.status === 'awaiting-human') {
    $.ui.log(`Answer later: /skraft decide ${slug} ${outcome.checkpoint.key} <answer>, then /skraft ${slug}`)
  }
  return outcome
}

async function start($, args) {
  if (!SLUG.test(args.slug ?? '')) return 'Usage: /skraft <slug> [#issue] [title] — slug in kebab-case.'
  if (active) return `skraft is already running ${active}; see the Skraft pane.`
  active = args.slug
  await update($, run, () => ({ ...IDLE, slug: args.slug, status: 'running' }))
  $.clock.after(0, () => {
    drive($, args)
      .catch(async (error) => {
        await update($, run, (view) => ({ ...view, status: 'error', reason: String(error?.message ?? error) }))
        $.ui.log(`skraft ${args.slug}: error — ${error?.message ?? error}`)
      })
      .finally(() => { active = null })
  })
  return `skraft ${args.slug} started — progress in the Skraft pane.`
}

// RecordDecision: an answer recorded now is read by the next run at that checkpoint.
async function decide($, { slug, key, answer }) {
  if (!SLUG.test(slug ?? '') || !key || !answer) return 'Usage: /skraft decide <slug> <checkpoint-key> <answer>'
  const deps = await sessionDependencies($, slug)
  const bound = await activePipelineSlug(deps, slug) // one pipeline per working copy: .active-slug
  if (!bound.ok) return `Refused: ${bound.error.reason}`
  const recorded = await createRecordDecision(deps).record({ slug, key, answer, by: 'human' })
  return recorded.ok ? `Recorded "${answer}" for ${key}. Resume with /skraft ${slug}.` : `Refused: ${recorded.error.reason}`
}

// CloseManually: never while this session's run drives the same pipeline.
async function closeManually($, { slug, findings }) {
  if (!SLUG.test(slug ?? '')) return 'Usage: /skraft close <slug> [findings fixed by the rework]'
  if (active === slug) return `skraft is running ${slug}; wait for it to stop before closing a phase by hand.`
  const deps = await sessionDependencies($, slug)
  const bound = await activePipelineSlug(deps, slug) // one pipeline per working copy: .active-slug
  if (!bound.ok) return `Refused (${bound.error.code}): ${bound.error.reason}`
  const closed = await createCloseManually(deps).close({ slug, findings })
  return closed.ok
    ? `${closed.value.phase} closed by human validation (${closed.value.review}); next: ${closed.value.next}. Resume with /skraft ${slug}.`
    : `Refused (${closed.error.code}): ${closed.error.reason}`
}

const describe = (view) => view.slug
  ? `skraft ${view.slug}: ${view.status}${view.phase ? ` at ${view.phase}` : ''}${view.reason ? ` — ${view.reason}` : ''}`
  : 'skraft: no pipeline run in this session. Start one with /skraft <slug> [#issue] [title].'

/** @type {Register} */
export const register = (on) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'skraft',
      description: 'Run or resume the SKRAFT pipeline for one refined story',
      argumentHint: '<slug> [#issue] [title] | decide <slug> <key> <answer> | close <slug> [findings]',
    })
    await $.tool.register({
      name: 'run_pipeline',
      description:
        'Start or resume the SKRAFT engineering pipeline (RESEARCH → DESIGN → DISTILL → DELIVER) for one refined story. ' +
        'Returns at once; the pipeline runs in the background and reports in the Skraft pane.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'kebab-case feature scope' },
          issue: { type: 'integer' },
          title: { type: 'string' },
        },
        required: ['slug'],
      },
    })
    return result
  })

  on('classic.SessionStart', async ($, e, next) => {
    await update($, mainAgent, () => (typeof e.agent_type === 'string' && e.agent_type.length > 0 ? e.agent_type : null))
    return next(e)
  }).catch(($, e, next) => next(e))

  // G8 — a write outside the caller's write rights is refused; a guard that fails refuses.
  on('tool.call', { tool: WRITE_TOOLS }, async ($, e, next) => {
    const verdict = await writeRightsVerdict($, e)
    return verdict.allowed ? next(e) : { deny: `skraft G8: ${verdict.reason}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `skraft G8: the write-rights guard could not judge this call (${next.error.message ?? next.error.kind}); it is refused` }))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      const answer = { reason: e.reason, text: e.answer ?? '', usage: e.usage }
      const resolve = waiting.get(e.agentId)
      if (resolve) {
        waiting.delete(e.agentId)
        resolve(answer)
      } else if (active) {
        finished.set(e.agentId, answer)
        if (finished.size > 50) finished.delete(finished.keys().next().value)
      }
    }
    return result
  })

  on('command.run', { command: 'skraft' }, async ($, e) => {
    const args = parseSkraftArgs(e.args)
    if (args.command === 'status') return { text: describe(await read($, run)) }
    if (args.command === 'decide') return { text: await decide($, args) }
    if (args.command === 'close') return { text: await closeManually($, args) }
    const text = await start($, args)
    await $.ui.open({ id: PANE, title: 'Skraft' })
    return { text }
  }).catch(($, e, next) => ({ text: `skraft: ${next.error.message}` }))

  on('tool.call', { tool: 'mcp__skraft__run_pipeline' }, async ($, e) => {
    const story = e.issue || e.title ? { issue: e.issue ?? null, title: e.title ?? null } : null
    const text = await start($, { slug: e.slug, story })
    void $.ui.open({ id: PANE, title: 'Skraft' })
    return { result: { text } }
  }).catch(($, e, next) => ({ result: { text: `skraft could not start: ${next.error.message}` } }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const view = await read($, run)
    const at = PHASES.indexOf(view.phase)
    const phaseRow = (phase, index) => {
      const mark = view.status === 'done' || index < at ? '✓' : index === at ? '▶' : '·'
      return Text({
        key: phase,
        color: index === at && view.status === 'running' ? 'cyan' : undefined,
        dimColor: index > at,
        children: `${mark} ${phase}`,
      })
    }
    const room = Math.max(3, (e.props.scroll?.bodyRows ?? 20) - PHASES.length - 4)
    return Box({
      flexDirection: 'column',
      children: [
        Text({ bold: true, children: view.slug ? `${view.slug} — ${view.status}` : 'No pipeline yet — /skraft <slug>' }),
        ...PHASES.map(phaseRow),
        ...(view.reason ? [Text({ color: view.status === 'done' ? 'green' : 'yellow', wrap: 'wrap', children: view.reason })] : []),
        ...view.log.slice(-room).map((line, index) => Text({ key: `log-${index}`, dimColor: true, wrap: 'truncate-end', children: line })),
      ],
    })
  })
}
