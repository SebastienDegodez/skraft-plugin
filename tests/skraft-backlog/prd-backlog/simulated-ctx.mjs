// A simulated Copilot dynamic-workflow runtime for the PRD backlog workflow: ctx.agent memoises
// each call by label + prompt in a journal, ctx.step journals by key, ctx.pause stops the attempt
// until the test resumes with that key passed. The "LLM" is a scripted behaviour per agent.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PASSING_LENS, storyFile, storyMap } from './fixtures/backlog-data.mjs'

export const FIXTURE_PRD = fileURLToPath(new URL('./fixtures/eligibilite-prd.md', import.meta.url))

export class Paused extends Error {
  constructor(key) { super(`paused at ${key}`); this.key = key }
}

/** A fresh repository-like working copy holding the fixture PRD at docs/prd/eligibilite.md. */
export const workingCopy = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-prd-backlog-'))
  await mkdir(join(cwd, 'docs', 'prd'), { recursive: true })
  await writeFile(join(cwd, 'docs', 'prd', 'eligibilite.md'), await readFile(FIXTURE_PRD, 'utf8'))
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) }
}

/** The path after "Write only: " in a brief. @param {string} prompt */
export const outputOf = (prompt) => /Write only: (\S+)/.exec(prompt)?.[1] ?? ''

/** @param {string} path @param {unknown} value */
export const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/**
 * The default scripted agents: the slicer writes the fixture map, a writer the fixture story file,
 * every lens passes. Override one by its agent file id.
 * @param {Record<string, (call: { prompt: string, label: string, agent: string, attempt: number }) => Promise<string>>} [overrides]
 */
export const scriptedAgents = (overrides = {}) => async (call) => {
  const id = call.agent.replace(/^[^:]+:/, '')
  if (overrides[id]) return overrides[id](call)
  if (id === 'backlog-slicer') {
    await writeJson(outputOf(call.prompt), storyMap())
    return '2 epics, 4 stories'
  }
  if (id === 'story-writer') {
    const storyId = /Write story (\S+) of epic (\S+)/.exec(call.prompt)
    const planned = storyMap().epics.flatMap((e) => e.stories.map((s) => ({ ...s, epic: e.id }))).find((s) => s.id === storyId?.[1])
    await writeJson(outputOf(call.prompt), storyFile(/** @type {any} */ (planned)))
    return `${storyId?.[1]} written`
  }
  return PASSING_LENS(id.replace(/-lens$/, ''))
}

/**
 * @param {{ args?: object, agents?: ReturnType<typeof scriptedAgents>, journal?: Map<string, unknown>, resumed?: Set<string> }} [options]
 */
export const simulatedContext = ({ args = {}, agents = scriptedAgents(), journal = new Map(), resumed = new Set() } = {}) => {
  const calls = []
  const logs = []
  const phases = []
  const ctx = {
    args,
    log: (message) => logs.push(message),
    phase: (title) => phases.push(title),
    agent: async (prompt, options) => {
      const key = `agent|${options.label}|${prompt}`
      if (journal.has(key)) return journal.get(key)
      const attempt = Number(/attempt (\d+)/.exec(options.label)?.[1] ?? 1)
      calls.push({ prompt, label: options.label, agent: options.agent, model: options.model, attempt })
      const text = await agents({ prompt, label: options.label, agent: options.agent, attempt })
      journal.set(key, text)
      return text
    },
    step: async (key, produce) => {
      const stepKey = `step|${key}`
      if (journal.has(stepKey)) return structuredClone(journal.get(stepKey))
      const value = await produce()
      journal.set(stepKey, structuredClone(value))
      return value
    },
    parallel: async (thunks) => Promise.all(thunks.map(async (thunk) => {
      try { return await thunk() } catch (error) { if (error instanceof Paused) throw error; return null }
    })),
    pause: async (key) => {
      if (!resumed.has(key)) throw new Paused(key)
    },
  }
  return { ctx, calls, logs, phases, journal, resumed }
}

/**
 * Runs the workflow until it stops; a pause is reported as `{ paused: key }`.
 * @param {(ctx: object) => Promise<object>} run
 * @param {ReturnType<typeof simulatedContext>} simulated
 */
export const attempt = async (run, simulated) => {
  try {
    return await run(simulated.ctx)
  } catch (error) {
    if (error instanceof Paused) return { paused: error.key }
    throw error
  }
}
