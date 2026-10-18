// The simulated Copilot workflow runtime: a WorkflowContext whose ctx.agent journals each
// finished call by label + prompt and, on a resumed run given that journal, returns the
// memoised answer without running the agent again. The "LLM" is a scripted behaviour.
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { briefOf } from '../support/pipeline-repository.mjs'

export const PLUGIN_ROOT = fileURLToPath(new URL('../../../../plugins/skraft-framework/', import.meta.url))
export const TEMPLATE_PATH = join(PLUGIN_ROOT, 'assets', 'templates', 'research.template.md')

/** A fresh working copy; `cleanup` removes it. */
export const workingCopy = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skraft-copilot-workflow-'))
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) }
}

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
 * }} [options] journal: the previous run's, for a resume; agents: what session.rpc.agent.list answers;
 *   otherwise: the behaviour of a call once the queued ones are spent (writesNothing by default)
 * @returns timeline: `call <label>` when ctx.agent starts an agent, `answer <label>` when its
 *   answer comes back, in the order they happen.
 */
export const simulatedContext = ({ args = {}, behaviours = [], journal = [], agents, otherwise = writesNothing } = {}) => {
  const queue = [...behaviours]
  const calls = []
  const logs = []
  const timeline = []
  const ctx = {
    args,
    log: (message) => logs.push(message),
    agent: async (prompt, options) => {
      const memoised = journal.find((entry) => entry.label === options.label && entry.prompt === prompt)
      if (memoised) return memoised.text
      const call = { prompt, label: options.label, agent: options.agent, ...(options.model === undefined ? {} : { model: options.model }), outputs: outputsOf(prompt) }
      calls.push(call)
      timeline.push(`call ${options.label}`)
      const behaviour = queue.shift() ?? otherwise
      const text = await behaviour(call)
      journal.push({ label: options.label, prompt, text })
      timeline.push(`answer ${options.label}`)
      return text
    },
    ...(agents === undefined ? {} : {
      session: { rpc: { agent: { list: async () => {
        if (agents === 'fails') throw new Error('agent.list is not supported')
        return { agents }
      } } } },
    }),
  }
  return { ctx, calls, logs, journal, timeline }
}
