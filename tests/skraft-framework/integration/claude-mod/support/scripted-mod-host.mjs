// The Claude Code mod's `$` functions, scripted: a real temp working copy on Node's fs, the
// real plugin root, and subagents that are the simulated LLM. No mock library.
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClaudeModDriver } from '../../../../../plugins/skraft-framework/engine/drivers/claude-mod/claude-mod-driver.mjs'
import { briefOf } from '../../support/pipeline-repository.mjs'

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

/**
 * `$.process.run` as the mod runtime answers it: resolves with the exit code and output,
 * rejects when the program cannot be started.
 * @param {string[]} argv @param {{ cwd?: string }} [init]
 */
export const nodeModRun = ([program, ...args], init = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: init.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.once('error', reject)
  child.once('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
})

/** The absolute paths a brief lists as outputs, then as missing, and its result file. @param {string} prompt */
export const briefPaths = (prompt) => {
  const { outputs, missing, result } = briefOf(prompt)
  return { outputs, missing, result: /** @type {string} */ (result) }
}

/** @param {string} prompt @param {'done' | 'blocked'} status @param {string} summary */
const writeResult = (prompt, status, summary) => nodeModFs.write(briefPaths(prompt).result, JSON.stringify({ status, summary }))

/**
 * Subagent behaviours: each receives the spawn and the host, and answers what `$.agent.spawn`
 * would ({ agentId } or { deny }), or completes the turn itself.
 */
export const fillsItsOutputs = (text = '\n## Key discoveries\nThe cart lives in src/cart.\n') => async (spawn, host) => {
  for (const path of briefPaths(spawn.prompt).outputs) await nodeModFs.write(path, `${(await nodeModFs.read(path)).replace(/\{\{[^{}]*\}\}/g, 'filled in')}${text}`)
  await writeResult(spawn.prompt, 'done', 'research written')
  return host.answer(spawn)
}
export const writesNothing = () => async (spawn, host) => host.answer(spawn)
/** Writes a blocked result and nothing else. */
export const stops = (summary = 'needs a decision on the payment provider') => async (spawn, host) => {
  await writeResult(spawn.prompt, 'blocked', summary)
  return host.answer(spawn)
}
/** The host dies once the agent wrote its outputs and its result: its turn never completes. */
export const fillsThenHostDies = () => async (spawn, host) => {
  for (const path of briefPaths(spawn.prompt).outputs) await nodeModFs.write(path, 'Findings.\n')
  await writeResult(spawn.prompt, 'done', 'research written')
  return host.started(spawn)
}
/**
 * Every spawn answered by the scripted LLM of a pipeline repository: a phase agent's turn ends
 * with `done`, a lens's or the refuter's with its scripted final message.
 * @param {{ act: (prompt: string) => string | undefined }} llm
 */
export const actsAs = (llm) => async (spawn, host) => {
  const answer = llm.act(spawn.prompt)
  return host.answer(spawn, answer === undefined ? {} : { answer })
}

/**
 * @param {{
 *   cwd?: string, behaviours?: Array<(spawn: any, host: any) => Promise<object>>, costs?: Array<number | null>,
 *   otherwise?: (spawn: any, host: any) => Promise<object>, turnCostUsd?: number, answers?: Array<string | null>, home?: string | null,
 * }} [options]
 *   home: what `$.env.get('HOME')` answers, `<working copy>-home` by default, never the machine's.
 *   otherwise: the behaviour of a spawn once the queued ones are spent; without it such a spawn is rejected.
 *   turnCostUsd: what each completed turn adds to the session cost, which then starts at 0, in place of `costs`.
 *   answers: what the human picks or types in each `$.ui.ask` dialog, null for a dismissed one;
 *   once they are spent, the first option.
 * @returns timeline: `spawn <description>` when `$.agent.spawn` is called, `complete <description>`
 *   when that subagent's turn.complete reaches the driver, in the order they happen.
 */
export const scriptedModHost = async ({ cwd, behaviours = [], costs = [], otherwise, turnCostUsd, answers = [], home } = {}) => {
  const root = cwd ?? (await answeredWorkingCopy())
  const homeFolder = home === undefined ? `${root}-home` : home
  const driver = createClaudeModDriver()
  /** @type {Array<{ prompt: string, subagentType: string, description: string }>} */
  const spawns = []
  const published = []
  const statuses = []
  const notes = []
  const timeline = []
  /** @type {Array<{ question: string, options: { options: readonly string[], header: string } }>} */
  const asked = []
  const replies = [...answers]
  const scripted = [...behaviours]
  const costQueue = [...costs]
  let agents = 0
  let started = 0
  let sessionCost = 0

  /** @param {any} spawn @param {string} agentId @param {object} turn */
  const complete = (spawn, agentId, turn) => {
    timeline.push(`complete ${spawn.description}`)
    if (turnCostUsd !== undefined) sessionCost += turnCostUsd
    driver.turnComplete({ agentId, answer: 'done', reason: 'answer', ...turn })
  }

  const control = {
    /** Starts the subagent and completes its turn before the spawn resolves. */
    answer: (spawn, turn = {}) => {
      const agentId = `agent-${++agents}`
      complete(spawn, agentId, turn)
      return { model: 'scripted', agentId }
    },
    /** Starts the subagent; its turn completes once `after` settles, after the spawn resolved. @param {Promise<unknown>} after */
    answerAfter: (spawn, after, turn = {}) => {
      const agentId = `agent-${++agents}`
      after.then(() => complete(spawn, agentId, turn))
      return { model: 'scripted', agentId }
    },
    /** Starts the subagent; its turn never completes. */
    started: () => ({ model: 'scripted', agentId: `agent-${++agents}` }),
  }

  const host = {
    fs: nodeModFs,
    cwd: async () => root,
    home: async () => homeFolder,
    pluginRoot: PLUGIN_ROOT,
    pluginName: 'skraft',
    run: nodeModRun,
    spawn: async (/** @type {any} */ args) => {
      spawns.push(args)
      timeline.push(`spawn ${args.description}`)
      const behaviour = scripted.shift() ?? otherwise
      if (!behaviour) throw new Error(`unexpected spawn ${args.description}`)
      const answer = await behaviour(args, control)
      started += 1
      return answer
    },
    ask: async (/** @type {string} */ question, /** @type {{ options: readonly string[], header: string }} */ options) => {
      asked.push({ question, options })
      const reply = replies.length > 0 ? replies.shift() : options.options[0]
      if (reply === null) throw new Error('dismissed')
      return reply
    },
    sessionCostUsd: async () => {
      if (turnCostUsd !== undefined) return sessionCost
      return costQueue.length > 0 ? costQueue.shift() ?? null : null
    },
    later: (/** @type {() => void} */ run) => run(),
    publish: async (/** @type {any} */ snapshot) => { published.push(snapshot) },
    status: (/** @type {string | undefined} */ text) => { statuses.push(text) },
    notify: (/** @type {string} */ line) => { notes.push(line) },
  }

  const tracking = join(root, '.copilot-tracking', 'skraft-plans')
  return {
    root,
    home: homeFolder,
    driver,
    host,
    spawns,
    published,
    statuses,
    notes,
    timeline,
    asked,
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
    cleanup: async () => {
      await rm(root, { recursive: true, force: true })
      if (homeFolder !== null) await rm(homeFolder, { recursive: true, force: true })
    },
  }
}

/** A fresh working copy whose skraft-config.json has answered the consent to open a pull request: no. */
const answeredWorkingCopy = async () => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-mod-'))
  await writeFile(join(root, 'skraft-config.json'), JSON.stringify({ publish: { pullRequest: false } }), 'utf8')
  return root
}

/** Lets the work a timer started run until `done()` holds. @param {() => boolean} done */
export const until = async (done) => {
  const deadline = Date.now() + 10_000
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
  if (!done()) throw new Error('condition never held')
}
