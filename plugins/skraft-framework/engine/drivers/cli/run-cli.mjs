import { createInit } from '../../application/pipeline/init-usecase.mjs'
import { createObserve } from '../../application/pipeline/observe-usecase.mjs'
import { createDecide } from '../../application/decisions/decide-usecase.mjs'
import { createConfigureComponents } from '../../application/config/configure-components-usecase.mjs'
import { createRunGate } from '../../application/gates/run-gate-usecase.mjs'
import { createDoctor } from '../../application/diagnostics/doctor-usecase.mjs'
import { createWorkflowCommands } from '../../application/workflow/workflow-commands-usecase.mjs'
import { createPublish } from '../../application/publish/publish-usecase.mjs'
import { createAdoptJournal } from '../../application/journal/adopt-usecase.mjs'
import { createMigrate } from '../../application/migration/migrate-usecase.mjs'
import { answersTable, costText, reportTable } from '../../domain/reporting/run-report.mjs'
import { decideUsage } from '../../domain/decisions/questions.mjs'
import { createAgentLoop } from './agent-loop.mjs'
import { reviewThroughLoop } from './review-loop.mjs'

/**
 * @typedef {{ out: (line: string) => void, err: (line: string) => void }} Console
 * @typedef {Parameters<typeof createInit>[0] & Parameters<typeof createRunGate>[0] & Parameters<typeof createDoctor>[0] & Parameters<typeof createConfigureComponents>[0] & Parameters<typeof createWorkflowCommands>[0] & import('./agent-loop.mjs').LoopAdapters & Parameters<typeof createPublish>[0] & Parameters<typeof createAdoptJournal>[0]} CliAdapters
 * @typedef {{ pluginVersion: () => string, workingCopyName: () => string, adapters: (agentHost?: 'copilot') => CliAdapters, command: () => string, confirm: (question: string) => Promise<boolean | null> }} CliServices
 *   adapters: for the host whose agents the run starts, none to check for both; command: how an
 *   agent runs this command line, `node "<absolute path of skraft.mjs>"`; confirm: the person's
 *   yes to a question asked at the terminal, null when no one can type there.
 * @typedef {(args: string[], services: CliServices, console: Console) => Promise<number> | number} Command
 * @typedef {ReturnType<typeof createWorkflowCommands>} WorkflowCommands
 * @typedef {(commands: WorkflowCommands, request: { json: boolean, services: CliServices }, console: Console) => Promise<number>} WorkflowAction
 */

/**
 * Every command, its handler and its usage lines, in one table: the dispatch, the usage the engine
 * prints and `skraft commands --json` (read by the `skraft` command of @skraft/cli for its help
 * and completion) all come from it, so they cannot drift apart.
 * @typedef {{ synopsis?: string, summary?: string }} UsageLine
 * @typedef {(args: string[], services: CliServices, console: Console) => number | Promise<number>} Handler
 */

const SUMMARY_COLUMN = 73

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

/** `journal adopt [--pr <number>]`, which takes the person's yes at their terminal first. @type {Command} */
const journalCommand = async (args, services, console) => {
  const target = adoptionTarget(args)
  if (target === undefined) return usage(console)
  const adoption = createAdoptJournal(services.adapters())
  const preview = await adoption.preview(target)
  if (!preview.ok) return answer(preview, console)
  const refusal = await adoptionRefused(services.confirm, preview)
  if (refusal !== null) return answer({ ok: false, reason: refusal }, console)
  return answer(await adoption.adopt(preview, target), console)
}

/**
 * The journal `journal adopt` names: the active pipeline's, or a pull request's review journal.
 * @param {string[]} args @returns {{ pr?: number } | undefined} undefined for a malformed line
 */
const adoptionTarget = (args) => {
  const options = args[0] === 'adopt' ? optionsOf(args.slice(1), { values: ['--pr'] }) : undefined
  if (options === undefined) return undefined
  if (options['--pr'] === undefined) return {}
  return /^[1-9]\d*$/.test(String(options['--pr'])) ? { pr: Number(options['--pr']) } : undefined
}

/**
 * Why nothing is adopted without the person's yes at the terminal to the lines it leaves
 * unverified; null once they gave it.
 * @param {CliServices['confirm']} confirm @param {{ slug: string, unverifiedLines: string }} preview
 */
const adoptionRefused = async (confirm, { slug, unverifiedLines }) => {
  const yes = await confirm(`skraft journal adopt: sign the journal of ${slug} on from here with a key of this machine, leaving unverified ${unverifiedLines}? [y/N] `)
  if (yes === null) return 'skraft journal adopt takes a person\'s yes: run it yourself in an interactive terminal; nothing was adopted'
  return yes ? null : 'not confirmed; nothing was adopted'
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

/** @param {string[]} args @param {CliServices} services @param {Console} console */
const report = async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--json'] })
  if (options === undefined) return usage(console)
  const shown = await createObserve(services.adapters()).report()
  print(options['--json'] === true, shown, reportLines, console)
  return shown.status === 'tampered' ? 1 : 0
}

/** @param {Awaited<ReturnType<ReturnType<typeof createObserve>['report']>>} shown */
const reportLines = (shown) => [
  `${skraftOf(shown.slug)}: ${shown.status}`,
  ...(shown.steps.length > 0 ? reportTable(shown) : []),
  ...(shown.answers.length > 0 ? answersTable(shown.answers) : []),
  ...(shown.reason ? [shown.reason] : []),
]

/** @param {Awaited<ReturnType<ReturnType<typeof createObserve>['view']>>} view */
const statusLines = (view) => [
  `${skraftOf(view.slug)}: ${view.status}`,
  ...view.phases.map(({ phase, state }) => `${phase}  ${state}`),
  ...(view.current ? [currentLine(view.current)] : []),
  ...(view.question ? [answerLine(view.question)] : []),
  ...(view.costUsd !== null ? [`cost: ${costText(view.costUsd)}`] : []),
  ...(view.reason ? [view.reason] : []),
]

/**
 * The node the run stands on: a gate node by its gates, a question node by its question, an
 * agent node by its agent and attempt.
 * @param {NonNullable<import('../../application/pipeline/observe-usecase.mjs').RunView['current']>} current
 */
const currentLine = ({ step, agent, gates, question, visit, attempt }) => {
  const pass = visit > 1 ? `, pass ${visit}` : ''
  if (agent !== null) return `agent: ${agent} (${step}${pass}, attempt ${attempt})`
  return question ? `question: ${question} (${step}${pass})` : `gates: ${/** @type {string[]} */ (gates).join(', ')} (${step}${pass})`
}

/** How to answer the question the run waits on. @param {NonNullable<import('../../application/pipeline/observe-usecase.mjs').RunView['question']>} question */
const answerLine = (question) =>
  // Stryker disable next-line StringLiteral: no question has more than one refusal, so the separator is never printed
  `answer: skraft decide ${question.key} ${decideUsage(question)}${question.refusals.length > 0 ? ` (--reason <text> with ${question.refusals.join(' or ')})` : ''}`

/** `decide [<key>] <answer> [--reason <text>]`. @param {string[]} args @param {CliServices} services @param {Console} console */
const decide = async (args, services, console) => {
  const asked = decisionOf(args)
  if (asked === undefined) return usage(console)
  const { key, given, options } = asked
  const confirmation = terminalConfirmation(services.confirm)
  return answer(await createDecide({ ...services.adapters(), confirmation }).decide({ key, answer: given, reason: options['--reason'] ?? null }), console)
}

/**
 * The DecisionConfirmation of the command line: the person confirms the answer at an
 * interactive terminal prompt; without one, or without a yes, nothing is recorded.
 * @param {CliServices['confirm']} confirm
 * @returns {import('../../application/ports/decision-confirmation.mjs').DecisionConfirmation}
 */
const terminalConfirmation = (confirm) => ({
  by: 'cli-tty',
  confirm: async ({ key, answer: given }) => confirmedOf(await confirm(`skraft decide: record ${given} for ${key}? [y/N] `)),
})

/**
 * The key, the answer and the options of `decide`; undefined when malformed.
 * @param {string[]} args
 */
const decisionOf = (args) => {
  const flag = args.findIndex((arg) => arg.startsWith('--'))
  const words = flag < 0 ? args : args.slice(0, flag)
  const options = optionsOf(args.slice(words.length), { values: ['--reason'] })
  if (options === undefined || words.length < 1 || words.length > 2) return undefined
  const [key, given] = words.length === 2 ? words : [null, words[0]]
  return { key, given, options }
}

/** `publish`: no argument. @param {string[]} args @param {CliServices} services @param {Console} console */
const publish = async (args, services, console) => {
  if (args.length > 0) return usage(console)
  return answer(await createPublish(services.adapters()).publish(), console)
}

/**
 * @param {boolean | null} confirmed null when no one can type at this terminal
 * @returns {import('../../application/ports/decision-confirmation.mjs').Confirmed}
 */
const confirmedOf = (confirmed) => {
  if (confirmed === true) return { ok: true }
  return confirmed === null
    ? { ok: false, code: 'no-terminal', reason: 'skraft decide records a person\'s answer: run it yourself in an interactive terminal; nothing was recorded' }
    : { ok: false, code: 'not-confirmed', reason: 'not confirmed; nothing was recorded' }
}

/**
 * `next` or `record` of the agent loop, the VS Code fallback, on the agents of Copilot.
 * @param {'next' | 'record'} step @returns {Command}
 */
const loopStep = (step) => async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--json'] })
  if (options === undefined) return usage(console)
  const loop = createAgentLoop({ adapters: services.adapters('copilot'), command: services.command(), log: console.err })
  const done = await loop[step]()
  print(options['--json'] === true, done, loopLines, console)
  return done.status === 'blocked' || done.status === 'refused' ? 1 : 0
}

/** @param {import('./agent-loop.mjs').LoopStep} step */
const loopLines = ({ status, slug, phase, code, reason, dispatches, then }) => [
  `${skraftOf(slug)}: ${status}${code ? ` (${code})` : ''}${phase ? ` in ${phase}` : ''} — ${reason}`,
  ...dispatches.flatMap(dispatchLines),
  ...(then === null ? [] : [`then: ${then}`]),
]

/** @param {import('./agent-loop.mjs').LoopDispatch} dispatch @param {number} index */
const dispatchLines = ({ agent, model, prompt, reply }, index) => [
  `agent ${index + 1}: ${agent} on ${model ?? "the session's model"}`,
  `  prompt: ${prompt}`,
  `  reply: ${reply}`,
]

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
  const checked = await createDoctor(services.adapters()).check({ run: options['--run'] === true, base: /** @type {string | undefined} */ (options['--base']) ?? null })
  const report = { plugin: services.pluginVersion(), ...checked }
  print(options['--json'] === true, report, doctorLines, console)
  return report.ok ? 0 : 1
}

/** How a doctor line starts, by the status of its check. */
const DOCTOR_MARKS = Object.freeze({ ok: 'ok  ', warn: 'WARN', fail: 'FAIL' })

/** @typedef {Awaited<ReturnType<ReturnType<typeof createDoctor>['check']>>} DoctorReport */

/** The plugin's version first: the version the person runs, whatever launched it. @param {DoctorReport & { plugin: string }} report */
const doctorLines = (report) => [
  `${DOCTOR_MARKS.ok}  plugin: skraft ${report.plugin}`,
  ...report.checks.map(({ subject, status: state, detail }) => `${DOCTOR_MARKS[state]}  ${subject}: ${detail}`),
  ...assignmentLines(report.assignments),
  doctorSummary(report),
]

const TABLE_HEAD = Object.freeze(['step', 'agent', 'type', 'family', 'tier', 'model', 'effort', 'source (family/model/effort)'])

/** One table per host of what each dispatched agent runs on; `-` where the host decides. @param {DoctorReport['assignments']} assignments */
const assignmentLines = (assignments) => (assignments === null ? [] : Object.entries(assignments).flatMap(([host, rows]) => [
  `models on ${host}:`,
  ...aligned([[...TABLE_HEAD], ...rows.map(cellsOf)]),
]))

/** @param {NonNullable<DoctorReport['assignments']>[string][number]} row */
const cellsOf = ({ step, agent, type, family, tier, model, effort, source }) =>
  [step, agent, type, family ?? '-', tier ?? '-', model?.join(' → ') ?? '-', effort ?? '-', `${source.family}/${source.model}/${source.effort}`]

/** Each row indented, its columns padded to the widest cell. @param {string[][]} rows */
const aligned = (rows) => {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)))
  return rows.map((row) => `  ${row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd()}`)
}

/** @param {DoctorReport} report */
const doctorSummary = ({ ok, checks }) => {
  const counted = (/** @type {string} */ status) => checks.filter((check) => check.status === status).length
  if (!ok) return `skraft doctor: ${counted('fail')} checks failed`
  return counted('warn') === 0 ? 'skraft doctor: every check passed' : `skraft doctor: no check failed, ${counted('warn')} with a warning`
}

/** `workflow eject [review]`, `workflow check [--json]`, `workflow diff [--json]`. @param {string[]} args @param {CliServices} services @param {Console} console */
const workflow = async (args, services, console) => {
  const [action, ...rest] = args[0] === 'eject' && args[1] === 'review' ? ['eject review', ...args.slice(2)] : args
  const options = optionsOf(rest, { flags: action?.startsWith('eject') ? [] : ['--json'] })
  const run = WORKFLOW_ACTIONS.get(action)
  if (options === undefined || run === undefined) return usage(console)
  return run(createWorkflowCommands(services.adapters()), { json: options['--json'] === true, services }, console)
}

/** What each `workflow` action runs. @type {Map<string | undefined, WorkflowAction>} */
const WORKFLOW_ACTIONS = new Map([
  ['eject', async (commands, { services }, console) => answer(await commands.eject({ pluginVersion: services.pluginVersion() }), console)],
  ['eject review', async (commands, { services }, console) => answer(await commands.eject({ pluginVersion: services.pluginVersion(), workflow: 'review' }), console)],
  ['check', async (commands, { json }, console) => workflowReport(await commands.check(), json, console)],
  ['diff', async (commands, { json, services }, console) => workflowReport(await commands.diff({ pluginVersion: services.pluginVersion() }), json, console)],
])

/**
 * A check or a diff: indented JSON with `--json`; else its changes, its warnings, then its
 * reason on stdout, or its reason on stderr when it failed.
 * @param {{ ok: boolean, reason: string, changes?: string[], warnings?: string[] }} outcome @param {boolean} json @param {Console} console
 */
const workflowReport = (outcome, json, console) => {
  if (json) console.out(JSON.stringify(outcome, null, 2))
  else if (outcome.ok) for (const line of [...(outcome.changes ?? []), ...(outcome.warnings ?? []).map((warning) => `warning: ${warning}`), outcome.reason]) console.out(line)
  else console.err(outcome.reason)
  return outcome.ok ? 0 : 1
}

/** `review --pr <number> [--publish] [--record] [--json]`. @param {string[]} args @param {CliServices} services @param {Console} console */
const review = async (args, services, console) => {
  const options = optionsOf(args, { values: ['--pr'], flags: ['--publish', '--record', '--json'] })
  if (options === undefined || !/^[1-9]\d*$/.test(String(options['--pr']))) return usage(console)
  const deps = { adapters: services.adapters('copilot'), command: services.command(), log: console.err, confirm: services.confirm }
  const step = await reviewThroughLoop(deps, { number: Number(options['--pr']), publish: options['--publish'] === true, record: options['--record'] === true, workingCopyName: services.workingCopyName() })
  print(options['--json'] === true, step, reviewLines, console)
  return step.status === 'APPROVED' || step.status === 'dispatch' ? 0 : 1
}

/** @param {import('./review-loop.mjs').ReviewStep} step */
const reviewLines = ({ status, number, pass, code, reason, reasons, details, file, comment, unpublished, dispatches, then }) => [
  `skraft review #${number}: ${status}${code ? ` (${code})` : ''}${pass === null ? '' : `, pass ${pass}`} — ${reason}`,
  ...reasons.map((line) => `  to address: ${line}`),
  ...details.map((line) => `  ${line}`),
  ...(file === null ? [] : [`  details: ${file}`]),
  ...(comment === null ? [] : [`  comment: ${comment}`]),
  ...(unpublished === null ? [] : [`  ${unpublished}`]),
  ...dispatches.flatMap(dispatchLines),
  ...(then === null ? [] : [`then: ${then}`]),
]

/** `migrate [--dry-run] [--json]`. @param {string[]} args @param {CliServices} services @param {Console} console */
const migrate = async (args, services, console) => {
  const options = optionsOf(args, { flags: ['--dry-run', '--json'] })
  if (options === undefined) return usage(console)
  const request = { dryRun: options['--dry-run'] === true, workingCopyName: services.workingCopyName() }
  const outcome = await createMigrate(services.adapters()).migrate(request)
  print(options['--json'] === true, outcome, migrateLines, console)
  return outcome.ok ? 0 : 1
}

/** @typedef {Awaited<ReturnType<ReturnType<typeof createMigrate>['migrate']>>} MigrateOutcome */

/** @param {MigrateOutcome} outcome */
const migrateLines = ({ config, pipelines, reason }) => [config.reason, ...configText(config), ...pipelines.flatMap(pipelineLines), reason]

/** What a dry run would write to skraft-config.json. @param {MigrateOutcome['config']} config */
const configText = ({ text }) => (text === undefined ? [] : ['would write skraft-config.json:', ...text.trimEnd().split('\n').map((line) => `  ${line}`)])

/** @param {MigrateOutcome['pipelines'][number]} pipeline */
const pipelineLines = ({ status: state, reason, events = [] }) => [`${state}  ${reason}`, ...events.map((event) => `  would append: ${JSON.stringify(event)}`)]

/** @type {Command} */
const unknown = (_args, _services, console) => usage(console)

/** What each first argument runs; any other is a usage error. @type {Map<string | undefined, Command>} */
/** @type {[string, Handler, UsageLine[]][]} */
const TABLE = [
  ['--version', version, [{}]],
  ['init', initOrConfigure, [
    { synopsis: '[--add <folder>]...', summary: 'detect the components into skraft-config.json' },
    { synopsis: '<slug> [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts]', summary: 'start or resume a pipeline' },
  ]],
  ['status', status, [{ synopsis: '[--json]' }]],
  ['report', report, [{ synopsis: '[--json]', summary: 'time, cost and retries of each step of the active pipeline' }]],
  ['decide', decide, [{ synopsis: '[<key>] <answer> [--reason <text>]', summary: 'answer the question the active pipeline waits on' }]],
  ['publish', publish, [{ summary: 'push the branch and open or update the pull request of the completed run' }]],
  ['journal', journalCommand, [{ synopsis: 'adopt [--pr <number>]', summary: "sign a journal this machine cannot verify with a key of this machine (--pr: a pull request's review journal)" }]],
  ['migrate', migrate, [{ synopsis: '[--dry-run] [--json]', summary: 'turn the v1 runs in progress and skraft-config.json into V2 ones' }]],
  ['next', loopStep('next'), [{ synopsis: '[--json]', summary: 'run the active pipeline until it needs agents or a human' }]],
  ['record', loopStep('record'), [{ synopsis: '[--json]', summary: 'hand the saved agent replies to the run, then go on' }]],
  ['gate', gate, [{ synopsis: '[--all] [--json]', summary: 'run the gates of the changed components (all with --all)' }]],
  ['doctor', doctor, [{ synopsis: '[--run] [--base <ref>] [--json]', summary: 'check every command can run (--run: run each once)' }]],
  ['review', review, [{ synopsis: '--pr <number> [--publish] [--record] [--json]', summary: 'review one pull request with the review workflow (--publish: keep its verdict in a comment)' }]],
  ['workflow', workflow, [
    { synopsis: 'eject [review]', summary: 'copy the plugin pipeline into .skraft/ (review: the review alone)' },
    { synopsis: 'check [--json]', summary: 'validate the workflow a run follows' },
    { synopsis: 'diff [--json]', summary: 'compare the repository workflow with the plugin one' },
  ]],
  ['commands', commands, [{ synopsis: '--json', summary: 'every command, its synopsis and summary, as JSON (help and completion of the skraft command)' }]],
]

const COMMANDS = new Map(TABLE.map(([name, handler]) => [name, handler]))

/** @returns {{ command: string, synopsis?: string, summary?: string }[]} every usage line, in order */
const usageLines = () => TABLE.flatMap(([command, , lines]) => lines.map((line) => ({ command, ...line })))

/** @param {{ command: string, synopsis?: string, summary?: string }} line @param {number} index */
const usageLine = ({ command, synopsis, summary }, index) => {
  const left = `${index === 0 ? 'usage: ' : '       '}skraft ${[command, synopsis].filter(Boolean).join(' ')}`
  if (summary === undefined) return left
  return left.length < SUMMARY_COLUMN - 1 ? `${left.padEnd(SUMMARY_COLUMN)}${summary}` : `${left}   ${summary}`
}

export const USAGE = usageLines().map(usageLine).join('\n')

/** `commands --json`: the usage lines as data, schema 1. @param {string[]} args @param {CliServices} _services @param {Console} console */
function commands(args, _services, console) {
  if (args.length !== 1 || args[0] !== '--json') return usage(console)
  console.out(JSON.stringify({ schema: 1, commands: usageLines() }, null, 2))
  return 0
}

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
