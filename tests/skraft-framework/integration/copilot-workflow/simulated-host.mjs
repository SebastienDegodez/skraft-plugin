// The simulated Copilot workflow runtime: a WorkflowContext whose ctx.agent journals each
// finished call by label + prompt and, on a resumed run given that journal, returns the
// memoised answer without running the agent again. The "LLM" is a scripted behaviour.
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** The absolute output paths a brief lists after "Fill each output in place". */
export const outputsOf = (prompt) => {
  const lines = prompt.split('\n')
  const start = lines.findIndex((line) => line.includes('Fill each output in place'))
  const outputs = []
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('- ')) break
    outputs.push(line.slice(2))
  }
  return outputs
}

/** A behaviour that fills every listed output with the template plus findings. */
export const fillsOutputs = (findings = 'Findings.\n') => async ({ outputs }) => {
  const template = await readFile(TEMPLATE_PATH, 'utf8')
  for (const path of outputs) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${template}${findings}`, 'utf8')
  }
  return 'research written'
}

/** A behaviour that writes nothing but still answers. */
export const writesNothing = async () => 'I could not find anything'

/**
 * @param {{
 *   args?: object,
 *   behaviours?: Array<(call: { prompt: string, label: string, agent: string, outputs: string[] }) => Promise<string | undefined>>,
 *   journal?: Array<{ label: string, prompt: string, text: string | undefined }>,
 *   agents?: Array<{ id?: string, name?: string, displayName?: string }> | 'fails',
 * }} [options] journal: the previous run's, for a resume; agents: what session.rpc.agent.list answers
 */
export const simulatedContext = ({ args = {}, behaviours = [], journal = [], agents } = {}) => {
  const queue = [...behaviours]
  const calls = []
  const logs = []
  const ctx = {
    args,
    log: (message) => logs.push(message),
    agent: async (prompt, options) => {
      const memoised = journal.find((entry) => entry.label === options.label && entry.prompt === prompt)
      if (memoised) return memoised.text
      const call = { prompt, label: options.label, agent: options.agent, outputs: outputsOf(prompt) }
      calls.push(call)
      const behaviour = queue.shift() ?? writesNothing
      const text = await behaviour(call)
      journal.push({ label: options.label, prompt, text })
      return text
    },
    ...(agents === undefined ? {} : {
      session: { rpc: { agent: { list: async () => {
        if (agents === 'fails') throw new Error('agent.list is not supported')
        return { agents }
      } } } },
    }),
  }
  return { ctx, calls, logs, journal }
}
