// SKRAFT pipeline as a Claude Code mod — composition root of the RunPipeline use case
// (src/application/pipeline/run-pipeline.mjs) for Claude Code. See docs/run-pipeline.md.
//
//   /skraft <slug> [#issue] [title…]   start (or resume) the pipeline, progress in a pane
//   /skraft                            where the pipeline stands
//   mcp__skraft__run_pipeline          the same, for the main agent
//
// Driven adapters that touch `$` are declared in this file: the mods engine follows `$`
// only into functions of the hooks module, never across an import. Each one translates a
// port onto `$`; none decides:
//   StateReader, TrackingStore, RepositoryReader   $.fs
//   SourceControl                                  git through $.process.run
//   AgentRunner                                    $.agent.spawn + the subagent's turn.complete
//   HumanInteraction                               $.ui.ask (null when nothing draws)
//   PipelineProgress                               $.state atom + pane + $.ui.status
// The adapters that only need a process runner come from src/adapters/infrastructure/
// (QualityGateVerifier, StructuralScanner, StateWriter, DecisionStore); this file hands
// them a runner built on $.process.run. The run outlives the command that started it: it
// is driven from a $.clock timer. The settings hooks (hooks.json `hooks`) keep enforcing
// G1–G9 meanwhile.
import { atom, read, update } from 'claude-code'
import { createRunPipeline } from '../src/application/pipeline/run-pipeline.mjs'
import { stateBaseSegments, resolveTrackingLayout } from '../src/domain/tracking-layout-policy.mjs'
import { createSystemTime } from '../src/adapters/infrastructure/system-time.mjs'
import { createCliQualityGateVerifier } from '../src/adapters/infrastructure/pipeline/cli-quality-gate-verifier.mjs'
import { createCliStructuralScanner } from '../src/adapters/infrastructure/pipeline/cli-structural-scanner.mjs'
import { createCliStateWriter } from '../src/adapters/infrastructure/pipeline/cli-state-writer.mjs'
import { createTrackingDecisionStore } from '../src/adapters/infrastructure/pipeline/tracking-decision-store.mjs'
import { joinPath, claudeAgentId, walkFiles, askable } from '../src/adapters/infrastructure/claude-code-mod/mod-helpers.mjs'
import { parseSkraftArgs } from '../src/adapters/api/claude-code-mod/command-args.mjs'

/** @typedef {import('claude-code').Register} Register */

const PANE = 'skraft-pipeline'
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PHASES = ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER']
const IDLE = { slug: null, status: 'idle', phase: null, reason: '', log: [], checkpointKey: null }
const run = atom({ plugin: 'skraft', key: 'run' }, IDLE)

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

// The process runner every runProcess-based adapter receives.
async function processRun($, cwd, argv, { timeoutMs = 600_000, stdin } = {}) {
  try {
    const result = await $.process.run(argv, { cwd, timeoutMs: Math.min(timeoutMs, 600_000), ...(stdin === undefined ? {} : { stdin }) })
    return { exitCode: result.exitCode, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  } catch (error) {
    return { exitCode: 124, stdout: '', stderr: String(error?.message ?? error) }
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
  const pluginRoot = $.plugin.root
  const pluginName = $.plugin.name
  const time = createSystemTime()
  const runProcess = (argv, opts) => processRun($, cwd, argv, opts)
  const trackingDir = (s) => joinPath(trackingRoot, s)
  const relativeToCwd = (path) => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)
  const log = (line) => update($, run, (view) => ({ ...view, log: [...view.log, line].slice(-60) }))

  // TrackingStore on $.fs
  const trackingStore = {
    exists: (s, rel) => $.fs.exists(joinPath(trackingDir(s), rel)),
    read: (s, rel) => $.fs.read(joinPath(trackingDir(s), rel)),
    list: (s) => walkFiles((dir) => $.fs.list(dir), trackingDir(s)),
    write: (s, rel, text) => $.fs.write(joinPath(trackingDir(s), rel), text),
    prefix: (s) => `${relativeToCwd(trackingDir(s))}/`,
  }

  return {
    config,
    // StateReader on $.fs (ENOENT and CORRUPTED_STATE as the state service expects)
    stateReader: {
      read: async (s) => {
        const path = joinPath(trackingDir(s), 'state.json')
        if (!(await $.fs.exists(path))) throw Object.assign(new Error(`${path} absent`), { code: 'ENOENT' })
        try { return JSON.parse(await $.fs.read(path)) } catch (error) {
          throw Object.assign(new Error(error.message), { code: 'CORRUPTED_STATE' })
        }
      },
    },
    stateWriter: createCliStateWriter({ runProcess, pluginRoot, trackingRoot }),
    trackingStore,
    // RepositoryReader on $.fs
    repositoryReader: { read: async (rel) => { try { return await $.fs.read(joinPath(cwd, rel)) } catch { return null } } },
    // SourceControl: git through the process runner
    sourceControl: {
      headSha: async () => {
        const { exitCode, stdout } = await runProcess(['git', 'rev-parse', 'HEAD'], { timeoutMs: 10_000 })
        return exitCode === 0 ? stdout.trim() || null : null
      },
    },
    // AgentRunner on $.agent.spawn
    agentRunner: {
      run: async ({ agent, label, prompt }) => {
        const spawned = await $.agent.spawn({
          prompt,
          subagentType: claudeAgentId(agent, config, pluginName),
          description: label.slice(0, 60),
        })
        if (spawned.deny || !spawned.agentId) return { ok: false, text: spawned.deny ?? 'not started' }
        const answer = await waitForAgent(spawned.agentId)
        return { ok: answer.reason === 'answer' && answer.text.length > 0, text: answer.text }
      },
    },
    qualityGateVerifier: createCliQualityGateVerifier({ runProcess, pluginRoot, trackingStore }),
    structuralScanner: createCliStructuralScanner({ runProcess, pluginRoot, trackingStore }),
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

async function drive($, { slug, story }) {
  const cwd = await $.session.cwd()
  const config = JSON.parse(await $.fs.read(joinPath($.plugin.root, 'skraft-framework.config.json')))
  const dependencies = await pipelineDependencies($, { config, cwd, trackingRoot: await trackingRootOf($, cwd), slug })

  const outcome = await createRunPipeline(dependencies).run({ slug, story })
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
    $.ui.log(`Answer later: node "${$.plugin.root}/src/cli/decide.mjs" --slug ${slug} --key "${outcome.checkpoint.key}" --answer "<answer>", then /skraft ${slug}`)
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
      argumentHint: '<slug> [#issue] [title]',
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

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      const answer = { reason: e.reason, text: e.answer ?? '' }
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
    if (!args.slug) return { text: describe(await read($, run)) }
    const text = await start($, args)
    await $.ui.open({ id: PANE, title: 'Skraft' })
    return { text }
  })

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
