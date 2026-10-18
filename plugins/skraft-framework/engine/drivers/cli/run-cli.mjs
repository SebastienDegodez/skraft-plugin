import { createInit } from '../../application/init.mjs'
import { createObserve } from '../../application/observe.mjs'
import { createDecide } from '../../application/decide.mjs'
import { createConfigureComponents } from '../../application/configure-components.mjs'
import { createRunGate } from '../../application/run-gate.mjs'
import { createDoctor } from '../../application/doctor.mjs'
import { createWorkflowCommands } from '../../application/workflow.mjs'

/**
 * @typedef {{ out: (line: string) => void, err: (line: string) => void }} Console
 * @typedef {Parameters<typeof createInit>[0] & Parameters<typeof createRunGate>[0] & Parameters<typeof createDoctor>[0] & Parameters<typeof createConfigureComponents>[0] & Parameters<typeof createWorkflowCommands>[0]} CliAdapters
 * @typedef {{ pluginVersion: () => string, workingCopyName: () => string, adapters: () => CliAdapters }} CliServices
 * @typedef {(args: string[], services: CliServices, console: Console) => Promise<number> | number} Command
 * @typedef {ReturnType<typeof createWorkflowCommands>} WorkflowCommands
 * @typedef {(commands: WorkflowCommands, request: { json: boolean, services: CliServices }, console: Console) => Promise<number>} WorkflowAction
 */

export const USAGE = [
  'usage: skraft --version',
  '       skraft init [--add <folder>]...                                   detect the components into skraft-config.json',
  '       skraft init <slug> [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts]   start or resume a pipeline',
  '       skraft status [--json]',
  '       skraft decide [<key>] <answer> [--reason <text>]                answer the question the active pipeline waits on',
  '       skraft gate [--all] [--json]                                      run the gates of the changed components (all with --all)',
  '       skraft doctor [--run] [--base <ref>] [--json]                     check every command can run (--run: run each once)',
  '       skraft workflow eject                                             copy the plugin workflow into skraft-workflow.dot',
  '       skraft workflow check [--json]                                    validate the workflow a run follows',
  '       skraft workflow diff [--json]                                     compare the repository workflow with the plugin one',
].join('\n')

/**
 * @param {string[]} args command-line arguments after the script path
 * @param {CliServices} services
 * @param {Console} console
 * @returns {Promise<number>} exit code
 */
export const runCli = async ([command, ...rest], services, console) => (COMMANDS.get(command) ?? unknown)(rest, services, console)

/**
 * Options as `--name value` pairs and `--flag`s; undefined when one is unknown or repeated
 * without being listed as repeatable.
 * @param {string[]} args
 * @param {{ values?: string[], flags?: string[], repeated?: string[] }} spec
 * @returns {Record<string, string | string[] | true> | undefined}
 */
// Stryker disable next-line ArrayDeclaration: a default lists no option; a name it would hold matches no argument a caller passes
const optionsOf = (args, { values = [], flags = [], repeated = [] }) => {
  /** @type {Record<string, string | string[] | true>} */
  const options = {}
  for (let index = 0; index < args.length; ) {
    const name = args[index]
    if (name in options && !repeated.includes(name)) return undefined
    const option = readOption(args, index, { values, flags, repeated })
    if (option === undefined) return undefined
    options[name] = collected(options[name], option.value, repeated.includes(name))
    index += option.width
  }
  return options
}

/**
 * The option at `index`: true for a flag, else the next argument unless it is missing or an
 * option itself; `width` is how many arguments it takes. Undefined when it is unknown or lacks
 * its value.
 * @param {string[]} args
 * @param {number} index
 * @param {{ values: string[], flags: string[], repeated: string[] }} spec
 * @returns {{ value: string | true, width: number } | undefined}
 */
const readOption = (args, index, { values, flags, repeated }) => {
  const name = args[index]
  const next = args[index + 1]
  if (flags.includes(name)) return { value: true, width: 1 }
  const valued = next !== undefined && !next.startsWith('--')
  if (valued && (repeated.includes(name) || values.includes(name))) return { value: next, width: 2 }
  return undefined
}

/**
 * A repeatable option keeps every value in order; any other keeps its one value.
 * @param {string | string[] | true | undefined} previous @param {string | true} value @param {boolean} repeatable
 */
const collected = (previous, value, repeatable) =>
  repeatable ? [.../** @type {string[]} */ (previous ?? []), /** @type {string} */ (value)] : value

/** @type {Command} */
const version = (_args, services, console) => {
  console.out(services.pluginVersion())
  return 0
}

/** `init` with no argument or an option first configures the components; with a slug it starts a pipeline. @type {Command} */
const initOrConfigure = (args, services, console) =>
  args.length === 0 || args[0].startsWith('--') ? configure(args, services, console) : init(args, services, console)

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const configure = async (args, services, console) => {
  const options = optionsOf(args, { repeated: ['--add'] })
  if (options === undefined) return usage(console)
  const folders = /** @type {string[]} */ (options['--add'] ?? [])
  return answer(await createConfigureComponents(services.adapters()).configure({ workingCopyName: services.workingCopyName(), folders }), console)
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const init = async ([slug, ...rest], services, console) => {
  const options = optionsOf(rest, { values: ['--issue', '--title', '--base'], flags: ['--from-artifacts'] })
  if (options === undefined || !isIssueNumber(options['--issue'])) return usage(console)
  const request = { slug: slug ?? null, story: storyOf(options), base: options['--base'] ?? null, fromArtifacts: options['--from-artifacts'] === true }
  return answer(await createInit(services.adapters()).init(request), console)
}

/** `--issue`, when given, is a positive whole number with no leading zero. @param {string | string[] | true | undefined} issue */
const isIssueNumber = (issue) => issue === undefined || /^[1-9]\d*$/.test(String(issue))

/** The story `--issue` and `--title` name; null with neither. @param {Record<string, string | string[] | true>} options */
const storyOf = (options) => {
  const issue = options['--issue']
  const title = /** @type {string | undefined} */ (options['--title'])
  return issue === undefined && title === undefined ? null : { issue: Number(issue) || null, title: title ?? null }
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const status = async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--json'] })
  if (options === undefined) return usage(console)
  const view = await createObserve(services.adapters()).view()
  print(options['--json'] === true, view, statusLines, console)
  return view.status === 'tampered' ? 1 : 0
}

/** @param {Awaited<ReturnType<ReturnType<typeof createObserve>['view']>>} view */
const statusLines = (view) => [
  `${skraftOf(view.slug)}: ${view.status}`,
  ...view.phases.map(({ phase, state }) => `${phase}  ${state}`),
  ...(view.current ? [currentLine(view.current)] : []),
  ...(view.question ? [answerLine(view.question)] : []),
  ...(view.costUsd !== null ? [`cost: ${view.costUsd.toFixed(2)} USD`] : []),
  ...(view.reason ? [view.reason] : []),
]

/**
 * The node the run stands on: a gate node by its gates, a question node by its question, an
 * agent node by its agent and attempt.
 * @param {NonNullable<import('../../application/observe.mjs').RunView['current']>} current
 */
const currentLine = ({ step, agent, gates, question, visit, attempt }) => {
  const pass = visit > 1 ? `, pass ${visit}` : ''
  if (agent !== null) return `agent: ${agent} (${step}${pass}, attempt ${attempt})`
  return question ? `question: ${question} (${step}${pass})` : `gates: ${/** @type {string[]} */ (gates).join(', ')} (${step}${pass})`
}

/** How to answer the question the run waits on. @param {NonNullable<import('../../application/observe.mjs').RunView['question']>} question */
const answerLine = ({ key, options, refusals }) =>
  `answer: skraft decide ${key} ${options.join('|')}${refusals.length > 0 ? ` (--reason <text> with ${refusals.join(' or ')})` : ''}`

/** `decide [<key>] <answer> [--reason <text>]`. @param {string[]} args @param {CliServices} services @param {Console} console */
const decide = async (args, services, console) => {
  const flag = args.findIndex((arg) => arg.startsWith('--'))
  const words = flag < 0 ? args : args.slice(0, flag)
  const options = optionsOf(args.slice(words.length), { values: ['--reason'] })
  if (options === undefined || words.length < 1 || words.length > 2) return usage(console)
  const [key, given] = words.length === 2 ? words : [null, words[0]]
  return answer(await createDecide(services.adapters()).decide({ key, answer: given, reason: options['--reason'] ?? null }), console)
}

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const gate = async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--all', '--json'] })
  if (options === undefined) return usage(console)
  const outcome = await createRunGate(services.adapters()).run({ scope: options['--all'] ? 'all' : 'touched' })
  print(options['--json'] === true, outcome, gateLines, console)
  return outcome.status === 'passed' ? 0 : 1
}

/** @param {Awaited<ReturnType<ReturnType<typeof createRunGate>['run']>>} outcome */
const gateLines = (outcome) => [
  ...outcome.gates.map((result) =>
    result.status === 'pass'
      ? `pass  ${result.component}/${result.gate}`
      : `fail (${result.failure})  ${result.component}/${result.gate}: ${result.reason}`,
  ),
  `${skraftOf(outcome.slug)}: gates ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''} — ${outcome.reason}`,
]

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const doctor = async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--run', '--json'], values: ['--base'] })
  if (options === undefined) return usage(console)
  const report = await createDoctor(services.adapters()).check({ run: options['--run'] === true, base: /** @type {string | undefined} */ (options['--base']) ?? null })
  print(options['--json'] === true, report, doctorLines, console)
  return report.ok ? 0 : 1
}

/** @param {Awaited<ReturnType<ReturnType<typeof createDoctor>['check']>>} report */
const doctorLines = (report) => [
  ...report.checks.map(({ subject, status: state, detail }) => `${state === 'ok' ? 'ok  ' : 'FAIL'}  ${subject}: ${detail}`),
  report.ok ? 'skraft doctor: every check passed' : `skraft doctor: ${report.checks.filter((check) => check.status === 'fail').length} checks failed`,
]

/** `workflow eject`, `workflow check [--json]`, `workflow diff [--json]`. @param {string[]} args @param {CliServices} services @param {Console} console */
const workflow = async ([action, ...args], services, console) => {
  const options = optionsOf(args, { flags: action === 'eject' ? [] : ['--json'] })
  const run = WORKFLOW_ACTIONS.get(action)
  if (options === undefined || run === undefined) return usage(console)
  return run(createWorkflowCommands(services.adapters()), { json: options['--json'] === true, services }, console)
}

/** What each `workflow` action runs. @type {Map<string | undefined, WorkflowAction>} */
const WORKFLOW_ACTIONS = new Map([
  ['eject', async (commands, { services }, console) => answer(await commands.eject({ pluginVersion: services.pluginVersion() }), console)],
  ['check', async (commands, { json }, console) => workflowReport(await commands.check(), json, console)],
  ['diff', async (commands, { json, services }, console) => workflowReport(await commands.diff({ pluginVersion: services.pluginVersion() }), json, console)],
])

/**
 * A check or a diff: indented JSON with `--json`; else its changes then its reason on stdout,
 * or its reason on stderr when it failed.
 * @param {{ ok: boolean, reason: string, changes?: string[] }} outcome @param {boolean} json @param {Console} console
 */
const workflowReport = (outcome, json, console) => {
  if (json) console.out(JSON.stringify(outcome, null, 2))
  else if (outcome.ok) for (const line of [...(outcome.changes ?? []), outcome.reason]) console.out(line)
  else console.err(outcome.reason)
  return outcome.ok ? 0 : 1
}

/** @type {Command} */
const unknown = (_args, _services, console) => usage(console)

/** What each first argument runs; any other is a usage error. @type {Map<string | undefined, Command>} */
const COMMANDS = new Map([
  ['--version', version],
  ['init', initOrConfigure],
  ['status', status],
  ['decide', decide],
  ['gate', gate],
  ['doctor', doctor],
  ['workflow', workflow],
])

/** `skraft` followed by the slug, when there is one. @param {string | null | undefined} slug */
const skraftOf = (slug) => `skraft${slug ? ` ${slug}` : ''}`

/**
 * The value as indented JSON with `--json`, else as the lines a human reads.
 * @template T
 * @param {boolean} json @param {T} value @param {(value: T) => string[]} linesOf @param {Console} console
 */
const print = (json, value, linesOf, console) => {
  for (const line of json ? [JSON.stringify(value, null, 2)] : linesOf(value)) console.out(line)
}

/** A use case's reason: on stdout with 0 when ok, on stderr with 1 otherwise. @param {{ ok: boolean, reason: string }} outcome @param {Console} console */
const answer = ({ ok, reason }, console) => {
  if (!ok) {
    console.err(reason)
    return 1
  }
  console.out(reason)
  return 0
}

/** @param {Console} console */
const usage = (console) => {
  console.err(USAGE)
  return 2
}
