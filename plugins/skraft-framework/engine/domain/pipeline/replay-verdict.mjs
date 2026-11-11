import { parseAnswerYaml } from '../review/answer-yaml.mjs'

/**
 * What the replay judge answers on a red or a green commit, and the brief that asks it. The judge
 * reads the logs of the replays itself: the engine reads no test report and no runner's output.
 *
 * @typedef {'accept' | 'send-back' | 'retry' | 'ask-human'} Decision
 *   accept: the red fails on its scenario's assertion, the green makes its scenario pass;
 *   send-back: the agent has to change its commit, the note says what; retry: the replay failed
 *   for a reason that passes, run it again once; ask-human: nothing an agent can do, a human has to.
 * @typedef {{ component: string, line: string, sha: string, exitCode: number | null, error?: string, log: string }} ReplayFact
 *   one command the engine replayed: at a commit, its exit code (null when it did not start or
 *   was stopped, error then saying why) and the absolute path of what it printed.
 * @typedef {{
 *   kind: 'red' | 'green', sha: string, subject: string, repository: string, files: string[],
 *   scenario: { index: number, title: string } | null, replays: ReplayFact[], parents: ReplayFact[],
 *   red: { sha: string, log: string, parentLog: string, tests: string[] } | null, retried: boolean,
 * }} JudgeRequest
 *   parents: the failing commands of a red, replayed at its parent; red: on a green, the red of its
 *   scenario, where its replay printed at the red and at its parent, and the acceptance-test files
 *   it committed; retried: the commands ran again after a retry.
 */

/** The agent that judges a replayed red or green. */
export const REPLAY_JUDGE = 'replay-judge'

const DECISIONS = Object.freeze(/** @type {Decision[]} */ (['accept', 'send-back', 'retry', 'ask-human']))
const KEYS = Object.freeze(['decision', 'note'])
const FENCE = /^[ \t]*```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm

/** The document the brief asks for. */
const VERDICT_SHAPE = [
  'decision: send-back    # accept | send-back | retry | ask-human',
  'note: "<what the logs show, and what the agent or the human has to do>"',
].join('\n')

/**
 * The judge's decision, from the last fenced block of its final message (the whole message when
 * it has none); its note stays in the answer, which the engine keeps as written.
 * @param {string} answer @returns {{ ok: true, decision: Decision } | { ok: false, error: string }}
 */
export const readVerdict = (answer) => {
  const source = ([...answer.matchAll(FENCE)].at(-1)?.[1] ?? answer).trim()
  const parsed = parseAnswerYaml(source)
  if (!parsed.ok || !isMapping(parsed.value)) return { ok: false, error: 'the answer is not the YAML document the brief shows' }
  return verdictOf(parsed.value)
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isMapping = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** @param {Record<string, unknown>} value @returns {{ ok: true, decision: Decision } | { ok: false, error: string }} */
const verdictOf = (value) => {
  const unknown = Object.keys(value).find((key) => !KEYS.includes(key))
  if (unknown !== undefined) return { ok: false, error: `the key ${unknown} is not in the contract; the keys are ${KEYS.join(', ')}` }
  const decision = /** @type {Decision} */ (String(value.decision).toLowerCase())
  if (!DECISIONS.includes(decision)) return { ok: false, error: `decision is not one of ${DECISIONS.join(', ')}` }
  return typeof value.note === 'string' && value.note.trim() !== '' ? { ok: true, decision } : { ok: false, error: 'a verdict needs its note: what the logs show' }
}

/**
 * The brief of the judge: the commit, its scenario, each command replayed and where it printed;
 * the rules of the judgement are the judge's own.
 * @param {JudgeRequest} request @param {string | null} retry why its last answer could not be read
 */
export const judgeBrief = (request, retry) => [
  ...commitLines(request),
  'The engine replayed, each in a throwaway checkout, from the component root:',
  ...request.replays.map((fact) => factLine(fact, 'the commit')),
  ...request.parents.map((fact) => factLine(fact, 'its parent')),
  ...(request.retried ? ['These replays ran again after your retry: a second retry asks a human.'] : []),
  ...(retry === null ? [] : [`Your last answer could not be read: ${retry}.`]),
  'End your final message with this YAML document, in a fenced block:',
  '```yaml', VERDICT_SHAPE, '```',
].join('\n')

/** The commit, its scenario, where it lives and what it changes; on a green, its scenario's red. @param {JudgeRequest} request */
const commitLines = (request) => [
  `Judge the ${request.kind} commit ${request.sha} "${request.subject}"${scenarioText(request.scenario)}.`,
  `Its repository: ${request.repository}`,
  `Its files: ${request.files.join(', ')}`,
  ...(request.red === null ? [] : redLines(request.red)),
]

/** On a green: its scenario's red, where its replay printed, and its acceptance tests. @param {NonNullable<JudgeRequest['red']>} red */
const redLines = ({ sha, log, parentLog, tests }) => [
  `The red of its scenario is ${sha}; its replay printed to ${log}, and at its parent to ${parentLog}`,
  `The acceptance tests of its scenario: ${tests.join(', ')}`,
]

/** @param {JudgeRequest['scenario']} scenario */
const scenarioText = (scenario) => (scenario === null ? '' : `, for scenario ${scenario.index} "${scenario.title}"`)

/** @param {ReplayFact} fact @param {string} where */
const factLine = ({ component, line, sha, exitCode, error, log }, where) => `- ${component}: \`${line}\` at ${where} ${sha.slice(0, 7)}: ${exitCode === null ? error : `exit ${exitCode}`}; printed to ${log}`
