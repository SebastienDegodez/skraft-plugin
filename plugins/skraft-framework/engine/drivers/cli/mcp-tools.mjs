import { UNFORESEEN_GUIDANCE } from '../../domain/decisions/unforeseen.mjs'

/**
 * The tools the MCP server offers: each one is a command line of this driver, built from
 * arguments a model wrote, except skraft_answer, which records
 * a native human reply directly.
 * The commands that take terminal consent (`publish`, `journal
 * adopt`, `review --publish`, `migrate` that writes) are not tools: a person runs them in a
 * terminal.
 *
 * @typedef {'string' | 'text' | 'code' | 'boolean' | 'count' | 'strings' | 'number'} Kind
 *   string: a word that does not start with `-`; code: any text, an empty one too; count: a positive whole number; strings: a list
 *   of such words.
 * @typedef {{ kind: Kind, description: string }} Parameter
 * @typedef {{
 *   name: string, title: string, description: string, parameters: Record<string, Parameter>,
 *   required: string[], annotations: Record<string, boolean>, argv: (args: Record<string, any>) => string[],
 *   loop?: boolean,
 * }} SkraftTool
 *   loop: the tool conducts the agent loop, which only a host without a skraft pipeline of its
 *   own is offered (see `offeredTools`).
 */

/** Every tool takes it: the root folder to work in when the host shares several. */
const WORKSPACE = Object.freeze({ kind: 'string', description: 'the working copy to work in: the absolute path of its root folder when the host shares no root folder; else a root folder of the host, by its path or its folder name, only needed when the host shares several' })

const READ_ONLY = Object.freeze({ readOnlyHint: true, openWorldHint: false })
const LOCAL = Object.freeze({ readOnlyHint: false, destructiveHint: false, openWorldHint: false })

/** `[name]` when the flag is on. @param {string} name @param {unknown} on */
const flag = (name, on) => (on === true ? [name] : [])

/** `[name, value]` when the value is given. @param {string} name @param {unknown} value */
const value = (name, value) => (value === undefined ? [] : [name, String(value)])

/** @param {Omit<SkraftTool, 'parameters' | 'required'> & { parameters?: Record<string, Parameter>, required?: string[] }} tool @returns {SkraftTool} */
const tool = ({ parameters = {}, required = [], ...rest }) => Object.freeze({ ...rest, parameters: { ...parameters, workspace: WORKSPACE }, required })

/** @type {readonly SkraftTool[]} */
export const TOOLS = Object.freeze([
  tool({
    name: 'skraft_answer', title: 'Record a human reply or host judgment',
    description: `Read the pending question from skraft_status. For unforeseen only: ${UNFORESEEN_GUIDANCE} For every other kind, ask its exact text and options through the offered native ask_user or askQuestions tool; request a refusal reason there. Relay only the returned human reply here, omitting by and usage, then resume the SAME workflow run ID (skraft_next for the MCP loop). If the native tool is unavailable or dismissed, report the blocker, leave the run paused and record nothing.`,
    parameters: {
      key: { kind: 'string', description: 'the exact pending question key' },
      answer: { kind: 'text', description: 'the native human reply, or one exact offered action for unforeseen' },
      reason: { kind: 'text', description: 'the human refusal reason, or the bounded inert note for RETRY_WITH_NOTE' },
      by: { kind: 'text', description: 'host-llm for a model judgment; omit for a native human reply' },
      model: { kind: 'text', description: 'observed model of this judgment, metadata only, never a model selector' },
      cost: { kind: 'number', description: 'observed cost of this judgment, not the session total' },
      costUnit: { kind: 'text', description: 'USD or nano-AIU as observed, never converted' },
    },
    required: ['key', 'answer'], annotations: LOCAL,
    // Stryker disable next-line ArrayDeclaration: skraft_answer calls Decide directly; no caller reads this argv
    argv: () => [],
  }),
  tool({
    name: 'skraft_doctor', title: 'Check skraft is ready',
    description: 'Checks the repository is ready for skraft: skraft-config.json, each component command, the workflow and the model of each agent. Call it before the first prompt in a repository; when its config check fails, set skraft up with skraft_init and the skraft-init skill.',
    annotations: { ...LOCAL, idempotentHint: true }, argv: () => ['doctor', '--json'],
  }),
  tool({
    name: 'skraft_init', title: 'Detect the components',
    description: 'Detects the components of the repository into skraft-config.json; never overwrites a value the file holds. Then settle the rest of the configuration with the skraft-init skill.',
    parameters: { add: { kind: 'strings', description: 'folders to detect beyond the ones found' } },
    annotations: { ...LOCAL, idempotentHint: true }, argv: (args) => ['init', ...(args.add ?? []).flatMap((/** @type {string} */ folder) => ['--add', folder])],
  }),
  tool({
    name: 'skraft_start', title: 'Start or resume a pipeline',
    description: 'For the Skraft - Orchestrator agent only. Starts the pipeline of one refined story, or resumes it; then call skraft_next. Any other agent hands the story to that agent instead.',
    parameters: {
      slug: { kind: 'string', description: 'the kebab-case scope of the story' },
      issue: { kind: 'count', description: 'the issue of the story; never invent one' },
      title: { kind: 'string', description: 'the title of the story' },
      base: { kind: 'string', description: 'the ref the story starts from' },
      fromArtifacts: { kind: 'boolean', description: 'start from the artifacts already in the working copy' },
    },
    required: ['slug'], annotations: LOCAL, loop: true,
    argv: (args) => ['init', args.slug, ...value('--issue', args.issue), ...value('--title', args.title), ...value('--base', args.base), ...flag('--from-artifacts', args.fromArtifacts)],
  }),
  tool({
    name: 'skraft_next', title: 'Run the pipeline',
    description: 'For the Skraft - Orchestrator agent only. Runs the active pipeline until it needs agents or a person. On dispatch, start each listed agent with exactly its prompt, one after the other, write its final reply unchanged to its reply file, then do what then says.',
    annotations: LOCAL, loop: true, argv: () => ['next', '--json'],
  }),
  tool({
    name: 'skraft_record', title: 'Record the agent replies',
    description: 'For the Skraft - Orchestrator agent only. Hands the saved agent replies to the run, then goes on as skraft_next does.',
    annotations: LOCAL, loop: true, argv: () => ['record', '--json'],
  }),
  tool({
    name: 'skraft_status', title: 'Pipeline status',
    description: 'The active pipeline: its status, its phases, the step it stands on and the question it waits on.',
    annotations: READ_ONLY, argv: () => ['status', '--json'],
  }),
  tool({
    name: 'skraft_report', title: 'Pipeline report',
    description: 'Time, cost and retries of each step of the active pipeline.',
    annotations: READ_ONLY, argv: () => ['report', '--json'],
  }),
  tool({
    name: 'skraft_journal', title: 'Pipeline journal',
    description: "The active pipeline's journal: the state of its chain, then its last steps and decisions.",
    parameters: { last: { kind: 'count', description: 'how many entries, 20 when absent' } },
    annotations: READ_ONLY, argv: (args) => ['journal', 'show', ...value('--last', args.last), '--json'],
  }),
  tool({
    name: 'skraft_precheck', title: 'Pre-check what the open attempt has written',
    description: 'Runs, inside your own attempt, the mechanical checks the engine runs when you submit — your outputs, your write scope, the records your role keeps, the prose you write, the scenarios your plan names, the lifecycle of the decisions you touched: it answers every anomaly with the check that found it, the artefact and the rule it breaks, so you correct them now instead of being sent back. It reads no result file and no commit, since you write them last. It starts no agent, changes nothing you wrote, and approves nothing: the engine runs these checks again at the submission, and the review still happens.',
    annotations: LOCAL, argv: () => ['precheck', '--json'],
  }),
  tool({
    name: 'skraft_repl', title: 'Run the project commands in the attempt REPL',
    description: "A JavaScript REPL (node) bound to your open attempt. Every command whose result counts as proof (build, format, lint, test, architecture, coverage, e2e) runs here, never in Bash: the engine reads the runs this tool records under logs/runs/ and nothing else. Variables persist between calls and a cell may await at its top level. In a cell: run(command, { cwd = '.', timeout = 600, gate, label }) starts a program and returns a handle at once: command is an argv array (no shell) or a string (run by sh -c; Git Bash or PowerShell under Windows); cwd is relative to the working copy; timeout is in seconds, 7200 at most. The handle has id, command, running, tail(n = 50), output(), poll() (the result, or null while it runs), kill(signal = 'SIGTERM', grace = 5) (SIGTERM, SIGINT or SIGKILL; grace 0 to 30 whole seconds) and is awaited: await handle gives { exitCode, output, durationMs, head, log } (head: the HEAD of the repository holding cwd when the program ended). gate(name, command, options) is run with the gate named (build, format, lint, test, architecture, coverage, e2e); absent(gate, component, reason) declares that the project's AGENTS.md names no such gate. console.log, console.error, process.stdout.write and process.stderr.write print into the result. A cell that runs past 90 seconds answers with what it printed while its runs go on: call again with empty code to wait for it. One call at a time: a second call while a cell runs is refused. To end the kernel and its runs, even mid-cell, call skraft_repl_reset, then skraft_repl: the next call runs in a fresh kernel whose variables are gone. The tool works only inside an open attempt, and the runs outlive neither the attempt nor the session. Commits are not recorded: chain the add and the commit in one cell all the same.",
    parameters: {
      code: { kind: 'code', description: 'the JavaScript of the cell; empty to wait for the cell still running' },
    },
    required: ['code'], annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    // Stryker disable next-line ArrayDeclaration: skraft_repl calls the REPL use case directly; no caller reads this argv
    argv: () => [],
  }),
  tool({
    name: 'skraft_repl_reset', title: 'End the kernel of the attempt REPL',
    description: "Ends the kernel of skraft_repl in your open attempt and the runs it started, even while a cell runs: the cell in flight answers repl-reset, its variables are gone, and the next skraft_repl starts a fresh kernel whose runs take the next ids. It waits for no other call and is never refused as busy. With no kernel running, it ends nothing and says so. The tool works only inside an open attempt.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    // Stryker disable next-line ArrayDeclaration: skraft_repl_reset calls the REPL use case directly; no caller reads this argv
    argv: () => [],
  }),
  tool({
    name: 'skraft_review', title: 'Review a pull request',
    description: 'Reviews one pull request with the review workflow. On dispatch, start each listed agent as skraft_next asks, then do what then says. Publishing the verdict takes a person: skraft review --publish in a terminal.',
    parameters: { pr: { kind: 'count', description: 'the pull request number' }, record: { kind: 'boolean', description: 'hand the saved agent replies to the review' } },
    required: ['pr'], annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }, loop: true,
    argv: (args) => ['review', '--pr', String(args.pr), ...flag('--record', args.record), '--json'],
  }),
  tool({
    name: 'skraft_workflow_check', title: 'Check the workflow',
    description: 'Validates the workflow a run follows.',
    annotations: READ_ONLY, argv: () => ['workflow', 'check', '--json'],
  }),
  tool({
    name: 'skraft_workflow_diff', title: 'Compare the workflow',
    description: "Compares the repository's ejected workflow with the plugin's.",
    annotations: READ_ONLY, argv: () => ['workflow', 'diff', '--json'],
  }),
  tool({
    name: 'skraft_workflow_eject', title: 'Eject the workflow',
    description: "Copies the plugin's pipeline workflow into .skraft/ for the repository to edit.",
    parameters: { review: { kind: 'boolean', description: 'eject the review workflow alone' } },
    annotations: { readOnlyHint: false, openWorldHint: false }, argv: (args) => ['workflow', 'eject', ...flag('review', args.review)],
  }),
  tool({
    name: 'skraft_migrate', title: 'Preview the V2 migration',
    description: 'Shows what turning the v1 runs in progress and skraft-config.json into V2 ones would write. The migration itself takes a person: skraft migrate in a terminal.',
    annotations: READ_ONLY, argv: () => ['migrate', '--dry-run', '--json'],
  }),
])

/**
 * The tools a host is offered: the agent loop only to one that conducts it.
 * @param {boolean} loop @returns {readonly SkraftTool[]}
 */
export const offeredTools = (loop) => TOOLS.filter((each) => loop || each.loop !== true)

/** The JSON Schema of each kind. @type {Record<Kind, object>} */
const SCHEMAS = Object.freeze({
  string: { type: 'string', minLength: 1 },
  text: { type: 'string', minLength: 1 },
  code: { type: 'string', maxLength: 200_000 },
  boolean: { type: 'boolean' },
  count: { type: 'integer', minimum: 1 },
  number: { type: 'number' },
  strings: { type: 'array', items: { type: 'string', minLength: 1 } },
})

/** The tool as `tools/list` shows it, without what only the server reads. @param {SkraftTool} tool */
export const toolListing = ({ name, title, description, parameters, required, annotations }) => ({
  name, title, description, annotations: { title, ...annotations },
  inputSchema: {
    type: 'object', additionalProperties: false, required,
    properties: Object.fromEntries(Object.entries(parameters).map(([key, { kind, description: about }]) => [key, { ...SCHEMAS[kind], description: about }])),
  },
})

/** What each kind requires, as a refusal says it. @type {Record<Kind, string>} */
const KIND_TEXT = Object.freeze({
  string: 'a non-empty text that does not start with -', boolean: 'true or false',
  text: 'a non-empty text',
  code: 'a text of at most 200000 characters',
  number: 'a finite number',
  count: 'a positive whole number', strings: 'a list of non-empty texts that do not start with -',
})

/** @param {unknown} given */
const isWord = (given) => typeof given === 'string' && given.length > 0 && !given.startsWith('-')

/** Whether the value is of the kind. @type {Record<Kind, (given: unknown) => boolean>} */
const CHECKS = Object.freeze({
  string: isWord,
  text: (given) => typeof given === 'string' && given.trim().length > 0,
  code: (given) => typeof given === 'string' && given.length <= 200_000,
  boolean: (given) => typeof given === 'boolean',
  count: (given) => Number.isSafeInteger(given) && /** @type {number} */ (given) >= 1,
  number: (given) => typeof given === 'number' && Number.isFinite(given),
  strings: (given) => Array.isArray(given) && given.every(isWord),
})

/**
 * Why the tool refuses these arguments; null when it takes them. A refusal never quotes what the
 * model wrote, only the names the tool declares.
 * @param {SkraftTool} tool @param {unknown} args @returns {string | null}
 */
export const refusalOf = (tool, args) => {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return `${tool.name} takes its arguments as an object`
  const names = Object.keys(tool.parameters)
  if (Object.keys(args).some((key) => !names.includes(key))) return `${tool.name} takes only these arguments: ${names.join(', ')}`
  const wrong = Object.entries(args).find(([key, given]) => !CHECKS[tool.parameters[key].kind](given))
  if (wrong !== undefined) return `the argument ${wrong[0]} of ${tool.name} must be ${KIND_TEXT[tool.parameters[wrong[0]].kind]}`
  const missing = tool.required.find((key) => !(key in args))
  return missing === undefined ? null : `${tool.name} needs the argument ${missing}`
}
