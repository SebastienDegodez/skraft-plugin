// A run of the whole pipeline under the Claude Code mod, on a real repository, with one failure
// injected for real: a Git hook, a test command that prints what tests print on a machine with no
// container runtime, a program the machine lacks, a crash, a flaky or a repeated gate failure. The
// person at the dialogs ratifies the ADR and approves the scenarios; any other dialog is closed,
// so the run stops there and says what it waits on. What a failure cost is read from the spawns
// and from the journal's `at`.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { actsAs, scriptedModHost } from '../../claude-mod/support/scripted-mod-host.mjs'
import { CHECK, SLUG, briefOf, fillOutputs, scriptedLlm, writeResult } from '../../support/pipeline-repository.mjs'
import { git, journal } from '../../support/workspace.mjs'

/** What the person answers, by dialog header; a header not here is closed. */
const ANSWERS = Object.freeze({ ADR: 'RATIFIED', Scenarios: 'APPROVED' })

/**
 * `/skraft checkout` on the repository, the scripted LLM answering every spawn, until the run
 * stops. `answers` overrides ANSWERS by header with an answer, or a function that gives it; null
 * closes the dialog. `dialogs` keeps each one with the number of spawns made before it. The
 * replay judge answers the next of `judges`, else accepts; `llm.judged` keeps its briefs.
 * @param {string} cwd
 * @param {{ acts?: Record<string, import('../../support/pipeline-repository.mjs').Act[]>, answers?: Record<string, string | null | (() => string | null)>, judges?: string[] }} [options]
 */
export const runOn = async (cwd, { acts, answers = {}, judges = [] } = {}) => {
  const llm = scriptedLlm({ cwd, acts, judges })
  const mod = await scriptedModHost({ cwd, otherwise: actsAs(llm) })
  /** @type {Array<{ header: string, question: string, spawns: number }>} */
  const dialogs = []
  mod.host.ask = async (question, options) => {
    dialogs.push({ header: options.header, question, spawns: mod.spawns.length })
    const scripted = { ...ANSWERS, ...answers }[options.header] ?? null
    const answer = typeof scripted === 'function' ? scripted() : scripted
    if (answer === null) throw new Error('dismissed')
    return answer
  }
  await mod.command(SLUG)
  return { mod, llm, dialogs, outcome: await mod.settled() }
}

/** `/skraft decide RETRY`, then the run until it stops again. @param {{ command: (args: string) => Promise<string>, settled: () => Promise<any> }} mod */
export const retry = async (mod) => {
  const text = await mod.command('decide RETRY')
  return { text, outcome: await mod.settled() }
}

/** The agent of each phase spawn, in order: lenses and the refuter left out. @param {Array<{ prompt: string }>} spawns */
export const agentsOf = (spawns) => spawns.map(({ prompt }) => briefOf(prompt).agent).filter((agent) => agent !== null)

/** The phase agents of the plugin's workflow, each dispatched once, in order. */
export const NOMINAL_AGENTS = Object.freeze(['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer', 'pr-writer'])

/** The journal's events. @param {string} cwd */
export const eventsOf = (cwd) => journal(cwd, SLUG)

/** The absolute path of a file of the run's folder. @param {string} cwd @param {string} path `/`-separated */
export const runFile = (cwd, path) => join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, ...path.split('/'))

/** The journal as written, every line of it. @param {string} cwd */
export const journalText = (cwd) => readFileSync(runFile(cwd, 'events.jsonl'), 'utf8')

/** Milliseconds between two journal events, by their `at`. @param {{ at: string }} from @param {{ at: string }} to */
export const elapsedMs = (from, to) => Date.parse(to.at) - Date.parse(from.at)

/** The last event of `type` (and `kind`, when given) in the journal. @param {object[]} events @param {string} type @param {string} [kind] */
export const lastOf = (events, type, kind) => events.findLast((event) => event.type === type && (kind === undefined || event.kind === kind))

/** The step.recorded events of a step. @param {object[]} events @param {string} step */
export const recorded = (events, step) => events.filter((event) => event.type === 'step.recorded' && event.step === step)

/** What the engine says of each cause the agent cannot fix. */
export const CAUSES = Object.freeze({
  environment: 'the machine: a program, a service, a permission or a Git hook it lacks or refuses',
  judge: 'what the replay judge read in the replay of a commit: nothing an agent can change fixes it',
})

/**
 * The text of the environment question of `step`: its reason, the cause of its owner, the log
 * when one exists, what each answer does, and the run report.
 * @param {string} cwd @param {string} step @param {{ reason: string, owner: keyof typeof CAUSES, log: string | null }} incident
 */
export const environmentText = (cwd, step, { reason, owner, log }) => [
  `${step} cannot run on this machine: ${reason}.`,
  `Cause: ${CAUSES[owner]}.`,
  ...(log === null ? [] : [`Output: ${log}`]),
  `Fix it, then RETRY: ${step} runs again where it stopped, using no new attempt; or ABORT: the run ends.`,
  `The run so far (commits, refusals, incidents): ${runFile(cwd, 'run-report.md')}`,
].join('\n')

/**
 * Installs a pre-commit hook that prints `message` on stderr and refuses every commit, where Git
 * looks for it whatever the machine's global configuration says; Git for Windows runs it with
 * its own sh. Returns its path.
 * @param {string} cwd @param {string} message
 */
export const refusingHook = (cwd, message) => {
  const hooks = join(cwd, '.git', 'hooks')
  mkdirSync(hooks, { recursive: true })
  writeFileSync(join(hooks, 'pre-commit'), `#!/bin/sh\necho "${message}" >&2\nexit 1\n`)
  chmodSync(join(hooks, 'pre-commit'), 0o755)
  git(cwd, 'config', 'core.hooksPath', hooks.replaceAll('\\', '/'))
  return join(hooks, 'pre-commit')
}

/**
 * CHECK with `first` run before it: statements that may use the namespaces `fs`, `path` and `os`.
 * @param {string} first
 */
export const checkWith = (first) => ["import * as fs from 'node:fs'", "import * as path from 'node:path'", "import * as os from 'node:os'", first, CHECK].join('\n')

/**
 * The condition, in a check, that it runs where the gates run it: in the working copy itself,
 * never in the worktree a commit is replayed in.
 * @param {string} cwd the working copy
 */
export const inWorkingCopy = (cwd) => `path.relative(fs.realpathSync.native(process.cwd()), fs.realpathSync.native(${JSON.stringify(cwd)})) === ''`

/**
 * The software engineer the gates sent back: it runs the tests, they pass on its machine, it
 * changes nothing and says so.
 * @type {import('../../support/pipeline-repository.mjs').Act}
 */
export const findsNothingToChange = (brief) => {
  fillOutputs(brief, 'The tests pass here; nothing to change.\n')
  writeResult(brief, { status: 'done', summary: 'nothing to change' })
}
