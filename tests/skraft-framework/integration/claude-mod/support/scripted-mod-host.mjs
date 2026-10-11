// The Claude Code mod's `$` functions, scripted: a real temp working copy on Node's fs, the
// real plugin root, and subagents that are the simulated LLM. No mock library.
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClaudeModDriver } from '../../../../../plugins/skraft-framework/engine/drivers/claude-mod/claude-mod-driver.mjs'

export const PLUGIN_ROOT = fileURLToPath(new URL('../../../../../plugins/skraft-framework/', import.meta.url))
export const RESEARCH_TEMPLATE = await readFile(join(PLUGIN_ROOT, 'assets', 'templates', 'research.template.md'), 'utf8')

/** Node fs as `$.fs` answers: read rejects when missing, write creates the folders. */
export const nodeModFs = Object.freeze({
  read: (/** @type {string} */ path) => readFile(path, 'utf8'),
  write: async (/** @type {string} */ path, /** @type {string} */ text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text, 'utf8')
  },
  exists: (/** @type {string} */ path) => access(path).then(() => true, () => false),
})

/** The absolute paths a brief lists as outputs, then as missing. @param {string} prompt */
export const briefPaths = (prompt) => {
  const lines = prompt.split('\n')
  const listed = (/** @type {number} */ from) => {
    const paths = []
    for (const line of lines.slice(from)) {
      const path = line.startsWith('- ') ? line.slice(2) : null
      if (path === null || !isAbsolute(path)) break
      paths.push(path)
    }
    return paths
  }
  const fill = lines.findIndex((line) => line.startsWith('- Fill each output'))
  const missing = lines.findIndex((line) => line.startsWith('Missing outputs from'))
  return { outputs: fill < 0 ? [] : listed(fill + 1), missing: missing < 0 ? [] : listed(missing + 1) }
}

/**
 * Subagent behaviours: each receives the spawn and the host, and answers what `$.agent.spawn`
 * would ({ agentId } or { deny }), or completes the turn itself.
 */
export const fillsItsOutputs = (text = '\n## Key discoveries\nThe cart lives in src/cart.\n') => async (spawn, host) => {
  for (const path of briefPaths(spawn.prompt).outputs) await nodeModFs.write(path, `${await nodeModFs.read(path)}${text}`)
  return host.answer(spawn)
}
export const writesNothing = () => async (spawn, host) => host.answer(spawn)
/** The host dies once the agent wrote its outputs: its turn never completes. */
export const fillsThenHostDies = () => async (spawn, host) => {
  for (const path of briefPaths(spawn.prompt).outputs) await nodeModFs.write(path, 'Findings.\n')
  return host.started(spawn)
}

/**
 * @param {{ cwd?: string, behaviours?: Array<(spawn: any, host: any) => Promise<object>>, costs?: Array<number | null> }} [options]
 */
export const scriptedModHost = async ({ cwd, behaviours = [], costs = [] } = {}) => {
  const root = cwd ?? (await mkdtemp(join(tmpdir(), 'skraft-mod-')))
  const driver = createClaudeModDriver()
  /** @type {Array<{ prompt: string, subagentType: string, description: string }>} */
  const spawns = []
  const published = []
  const statuses = []
  const notes = []
  const scripted = [...behaviours]
  const costQueue = [...costs]
  let agents = 0
  let started = 0

  const control = {
    /** Starts the subagent and completes its turn before the spawn resolves. */
    answer: (spawn, turn = {}) => {
      const agentId = `agent-${++agents}`
      driver.turnComplete({ agentId, answer: 'done', reason: 'answer', ...turn })
      return { model: 'scripted', agentId }
    },
    /** Starts the subagent; its turn never completes. */
    started: () => ({ model: 'scripted', agentId: `agent-${++agents}` }),
  }

  const host = {
    fs: nodeModFs,
    cwd: async () => root,
    pluginRoot: PLUGIN_ROOT,
    pluginName: 'skraft',
    spawn: async (/** @type {any} */ args) => {
      spawns.push(args)
      const behaviour = scripted.shift()
      if (!behaviour) throw new Error(`unexpected spawn ${args.description}`)
      const answer = await behaviour(args, control)
      started += 1
      return answer
    },
    sessionCostUsd: async () => (costQueue.length > 0 ? costQueue.shift() ?? null : null),
    later: (/** @type {() => void} */ run) => run(),
    publish: async (/** @type {any} */ snapshot) => { published.push(snapshot) },
    status: (/** @type {string | undefined} */ text) => { statuses.push(text) },
    notify: (/** @type {string} */ line) => { notes.push(line) },
  }

  const tracking = join(root, '.copilot-tracking', 'skraft-plans')
  return {
    root,
    driver,
    host,
    spawns,
    published,
    statuses,
    notes,
    behaviours: scripted,
    command: (/** @type {string} */ args) => driver.command(host, args),
    tool: (/** @type {any} */ input) => driver.tool(host, input),
    settled: () => driver.settled(),
    /** How many spawns the host answered. */
    started: () => started,
    journalPath: (/** @type {string} */ slug) => join(tracking, slug, 'events.jsonl'),
    journal: async (/** @type {string} */ slug) =>
      (await readFile(join(tracking, slug, 'events.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    activeSlugPath: join(tracking, '.active-slug'),
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

/** Lets the work a timer started run until `done()` holds. @param {() => boolean} done */
export const until = async (done) => {
  const deadline = Date.now() + 10_000
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
  if (!done()) throw new Error('condition never held')
}
