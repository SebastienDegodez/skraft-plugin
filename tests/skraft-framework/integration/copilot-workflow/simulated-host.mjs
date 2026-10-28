// The simulated Copilot workflow runtime: a WorkflowContext whose ctx.agent journals each
// finished call by label + prompt and, on a resumed run given that journal, returns the
// memoised answer without running the agent again. The "LLM" is a scripted behaviour.
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { briefOf } from '../support/pipeline-repository.mjs'
import { createSkraftDecideTool } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-decide-tool.mjs'
import { createHostConfirmation } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/host-confirmation.mjs'

export const PLUGIN_ROOT = fileURLToPath(new URL('../../../../plugins/skraft-framework/', import.meta.url))
export const TEMPLATE_PATH = join(PLUGIN_ROOT, 'assets', 'templates', 'research.template.md')

/** What a repository that answered the consent to open its pull request holds: no pull request. */
export const ANSWERED = Object.freeze({ publish: Object.freeze({ pullRequest: false }) })

/** A fresh working copy whose skraft-config.json says only ANSWERED; `cleanup` removes it. */
export const workingCopy = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-copilot-workflow-'))
  await writeFile(join(cwd, 'skraft-config.json'), JSON.stringify(ANSWERED), 'utf8')
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) }
}

/**
 * Where the workflow runs: the working copy, the plugin, and a home folder of the test's own
 * beside the working copy, so that no test reads the developer's ~/.skraft/config.json.
 * @param {string} cwd @param {string} [pluginRoot]
 */
export const copilotHost = (cwd, pluginRoot = PLUGIN_ROOT) => ({ cwd, pluginRoot, home: `${cwd}-home` })

/**
 * A joined Copilot session whose person answers each confirmation as told; `asked` keeps each
 * dialog's text.
 * @param {{ answer?: unknown, mode?: unknown, elicitation?: boolean, confirm?: (message: string) => Promise<unknown>, modeGet?: () => Promise<unknown> }} [person]
 */
export const confirmingSession = ({ answer = true, mode = 'interactive', elicitation = true, confirm, modeGet } = {}) => {
  const asked = []
  return {
    asked,
    capabilities: { ui: { elicitation } },
    rpc: { mode: { get: modeGet ?? (async () => mode) } },
    ui: { confirm: confirm ?? (async (message) => { asked.push(message); return answer }) },
  }
}

/**
 * The skraft_decide tool of a session whose working directory is cwd, its person confirming
 * every decision unless told otherwise.
 * @param {string} cwd @param {object} [session] @param {object} [options] what createHostConfirmation takes besides the session
 */
export const decideTool = (cwd, session = confirmingSession(), options = {}) => createSkraftDecideTool({
  directory: () => cwd, pluginRoot: PLUGIN_ROOT, home: `${cwd}-home`, confirmation: createHostConfirmation({ session: () => session, ...options }),
})

export const trackingDir = (cwd, slug) => join(cwd, '.copilot-tracking', 'skraft-plans', slug)
export const eventsPath = (cwd, slug) => join(trackingDir(cwd, slug), 'events.jsonl')

/** @returns {Promise<string[]>} the raw lines of the journal */
export const journalLines = async (cwd, slug) =>
  (await readFile(eventsPath(cwd, slug), 'utf8')).split(/\r?\n/).filter((line) => line !== '')
export const journalEvents = async (cwd, slug) => (await journalLines(cwd, slug)).map((line) => JSON.parse(line))

/** The absolute output paths a brief lists after "Fill each output in place". @param {string} prompt */
export const outputsOf = (prompt) => briefOf(prompt).outputs

/** @param {string} path @param {string} text */
const write = async (path, text) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}

/** A behaviour that fills every listed output with the template plus findings, and writes its result. */
export const fillsOutputs = (findings = 'Findings.\n') => async ({ prompt, outputs }) => {
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  for (const path of outputs) await write(path, `${template.replace(/\{\{[^{}]*\}\}/g, 'filled in')}${findings}`)
  await write(/** @type {string} */ (briefOf(prompt).result), JSON.stringify({ status: 'done', summary: 'research written' }))
  return 'research written'
}

/** A behaviour that writes a blocked result and nothing else. */
export const stops = (summary = 'needs a decision on the payment provider') => async ({ prompt }) => {
  await write(/** @type {string} */ (briefOf(prompt).result), JSON.stringify({ status: 'blocked', summary }))
  return summary
}

/** A behaviour that writes nothing but still answers. */
export const writesNothing = async () => 'I could not find anything'

/**
 * A behaviour for every call: the scripted LLM of a pipeline repository. A phase agent answers
 * `done`, a lens or the refuter its scripted final message.
 * @param {{ act: (prompt: string) => string | undefined }} llm
 */
export const actsAs = (llm) => async ({ prompt }) => llm.act(prompt) ?? 'done'

/**
 * @param {{
 *   args?: object,
 *   behaviours?: Array<(call: { prompt: string, label: string, agent: string, outputs: string[] }) => Promise<string | undefined>>,
 *   journal?: Array<{ label: string, prompt: string, text: string | undefined }>,
 *   agents?: Array<{ id?: string, name?: string, displayName?: string }> | 'fails',
 *   otherwise?: (call: { prompt: string, label: string, agent: string, outputs: string[] }) => Promise<string | undefined>,
 *   paused?: Set<string>,
 *   signal?: AbortSignal,
 *   maxConcurrentSubagents?: number,
 * }} [options] journal: the previous run's, for a resume; agents: what session.rpc.agent.list answers;
 *   otherwise: the behaviour of a call once the queued ones are spent (writesNothing by default);
 *   paused: the keys the run already paused at, for a resume; signal: the run's cancellation signal;
 *   maxConcurrentSubagents: the run's limit, as the SDK documents it (@github/copilot-sdk
 *   docs/factories.md): a ctx.agent call beyond it waits in a queue until a running agent answers,
 *   and fails nothing; none by default
 * @returns timeline: `call <label>` when ctx.agent starts an agent, `answer <label>` when its
 *   answer comes back, in the order they happen; a call the limit queues is in neither calls nor
 *   timeline until it starts.
 */
export const simulatedContext = ({ args = {}, behaviours = [], journal = [], agents, otherwise = writesNothing, paused = new Set(), signal, maxConcurrentSubagents = Infinity } = {}) => {
  const queue = [...behaviours]
  const calls = []
  const logs = []
  const timeline = []
  const slots = { running: 0, waiting: /** @type {Array<() => void>} */ ([]) }
  const started = async () => {
    while (slots.running >= maxConcurrentSubagents) await new Promise((resolve) => slots.waiting.push(resolve))
    slots.running += 1
  }
  const answered = () => {
    slots.running -= 1
    slots.waiting.shift()?.()
  }
  // Each attempt gets a fresh signal, as the SDK gives each execution its own controller; a pause
  // aborts it, as the host does once the run pauses. A test's own signal cancels every attempt.
  let attempt = new AbortController()
  const attemptSignal = () => (signal === undefined ? attempt.signal : AbortSignal.any([signal, attempt.signal]))
  let current = attemptSignal()
  const ctx = {
    args,
    get signal() {
      if (attempt.signal.aborted) {
        attempt = new AbortController()
        current = attemptSignal()
      }
      return current
    },
    log: (message) => logs.push(message),
    /** A durable pause: the first time at a key it aborts the run and stops it (AbortError); resumed, it returns. */
    pause: async (key) => {
      if (paused.has(key)) return
      paused.add(key)
      const error = new Error(`paused at ${key}`)
      error.name = 'AbortError'
      attempt.abort(error)
      throw error
    },
    agent: async (prompt, options) => {
      const memoised = journal.find((entry) => entry.label === options.label && entry.prompt === prompt)
      if (memoised) return memoised.text
      await started()
      const call = {
        prompt, label: options.label, agent: options.agent,
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
        outputs: outputsOf(prompt),
      }
      calls.push(call)
      timeline.push(`call ${options.label}`)
      const behaviour = queue.shift() ?? otherwise
      try {
        const text = await behaviour(call)
        journal.push({ label: options.label, prompt, text })
        timeline.push(`answer ${options.label}`)
        return text
      } finally {
        answered()
      }
    },
    ...(agents === undefined ? {} : {
      session: { rpc: { agent: { list: async () => {
        if (agents === 'fails') throw new Error('agent.list is not supported')
        return { agents }
      } } } },
    }),
  }
  return { ctx, calls, logs, journal, timeline, paused }

}
