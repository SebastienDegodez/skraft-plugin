// SKRAFT pipeline as a Claude Code mod. A thin adapter: it builds the Claude Code ports
// and hands over to the host-neutral use case src/application/pipeline/run-pipeline.mjs —
// the same code the Copilot dynamic workflow runs
// (com.github.copilot/extensions/skraft-pipeline/extension.mjs).
//
//   /skraft <slug> [#issue] [title…]   start (or resume) the pipeline, progress in a pane
//   /skraft                            where the pipeline stands
//   mcp__skraft__run_pipeline          the same, for the main agent
//
// The ports are written in this file because the mods engine follows `$` only into
// functions declared in the same file. Each one translates; none decides.
//   agents       $.agent.spawn, the answer awaited on the subagent's turn.complete
//   commands     $.process.run (10-minute ceiling: long mutation runs stay in the
//                engineer's own Bash, run_in_background, as today)
//   state        read with $.fs, written through src/cli/state-io.mjs (the CLI's atomic
//                writer: temp file, backup, rename), which $.fs cannot do
//   interaction  a recorded decision first, else the engine's own question dialog
// The run outlives the command that started it: it is driven from a $.clock timer.
// The settings hooks (hooks.json `hooks`) keep enforcing G1–G9 meanwhile.
import { atom, read, update } from 'claude-code'
import { createRunPipeline } from '../src/application/pipeline/run-pipeline.mjs'
import { createDecisionInbox } from '../src/application/pipeline/decision-inbox.mjs'
import { stateBaseSegments, resolveTrackingLayout } from '../src/domain/tracking-layout-policy.mjs'
import {
  joinPath,
  claudeAgentId,
  walkFiles,
  parseSkraftArgs,
  askable,
} from '../src/adapters/hosts/claude-code-mod-helpers.mjs'

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

async function modPorts($, { config, cwd, trackingRoot, slug }) {
  const pluginRoot = $.plugin.root
  const pluginName = $.plugin.name
  const trackingDir = (s) => joinPath(trackingRoot, s)
  const relativeToCwd = (path) => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)
  const trackingFiles = {
    exists: (s, rel) => $.fs.exists(joinPath(trackingDir(s), rel)),
    read: (s, rel) => $.fs.read(joinPath(trackingDir(s), rel)),
    list: (s) => walkFiles((dir) => $.fs.list(dir), trackingDir(s)),
    write: (s, rel, text) => $.fs.write(joinPath(trackingDir(s), rel), text),
  }
  const inbox = createDecisionInbox({ trackingFiles, slug })
  const canAsk = async () => (await $.session.surfaces()).length > 0
  const log = (line) => update($, run, (view) => ({ ...view, log: [...view.log, line].slice(-60) }))

  return {
    config,
    pluginRoot,
    trackingPrefix: (s) => `${relativeToCwd(trackingDir(s))}/`,
    stateReader: {
      read: async (s) => {
        const path = joinPath(trackingDir(s), 'state.json')
        if (!(await $.fs.exists(path))) throw Object.assign(new Error(`${path} absent`), { code: 'ENOENT' })
        try { return JSON.parse(await $.fs.read(path)) } catch (error) {
          throw Object.assign(new Error(error.message), { code: 'CORRUPTED_STATE' })
        }
      },
    },
    stateWriter: {
      write: async (s, state) => {
        const result = await processRun($, cwd,
          ['node', `${pluginRoot}/src/cli/state-io.mjs`, 'write', '--root', trackingRoot, '--slug', s],
          { timeoutMs: 30_000, stdin: JSON.stringify(state) })
        return result.exitCode === 0
          ? { ok: true, value: state }
          : { ok: false, error: { code: 'IO_ERROR', reason: result.stderr.trim() || `state-io exit ${result.exitCode}` } }
      },
    },
    trackingFiles,
    repositoryFiles: { read: async (rel) => { try { return await $.fs.read(joinPath(cwd, rel)) } catch { return null } } },
    git: {
      headSha: async () => {
        const { exitCode, stdout } = await processRun($, cwd, ['git', 'rev-parse', 'HEAD'], { timeoutMs: 10_000 })
        return exitCode === 0 ? stdout.trim() || null : null
      },
    },
    agents: {
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
    commands: { run: (argv, opts) => processRun($, cwd, argv, opts) },
    interaction: {
      decide: async ({ key, question, options }) => {
        const recorded = await inbox.read(key)
        if (recorded) return recorded
        if (!(await canAsk())) return null
        try {
          const answer = await $.ui.ask(askable(question), { options: options.slice(0, 4), header: 'Skraft' })
          await inbox.write(key, answer)
          return answer
        } catch {
          return null
        }
      },
    },
    progress: {
      phase: (title) => {
        $.ui.status(`skraft ${slug} · ${title}`)
        void update($, run, (view) => ({ ...view, phase: title }))
      },
      log: (message) => void log(message),
    },
    clock: { today: () => new Date().toISOString().slice(0, 10), now: () => new Date().toISOString() },
  }
}

async function drive($, { slug, story }) {
  const cwd = await $.session.cwd()
  const config = JSON.parse(await $.fs.read(joinPath($.plugin.root, 'skraft-framework.config.json')))
  const ports = await modPorts($, { config, cwd, trackingRoot: await trackingRootOf($, cwd), slug })

  const outcome = await createRunPipeline(ports).run({ slug, story })
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
  })

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
