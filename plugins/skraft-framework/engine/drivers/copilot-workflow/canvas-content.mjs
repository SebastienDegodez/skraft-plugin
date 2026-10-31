import { createObserve } from '../../application/pipeline/observe-usecase.mjs'
import { createConfiguration } from '../../application/config/configuration-usecase.mjs'
import { lensesText } from '../../domain/reporting/review-passes.mjs'
import { agentText } from '../../domain/reporting/agent-models.mjs'
import { CONSENT_QUESTIONS, decideUsage } from '../../domain/decisions/questions.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { editedDigest } from './edited-files.mjs'

/**
 * What the `skraft-pipeline` canvas page draws: the Observe view of the active pipeline of the
 * session's directory, read again on each call, as text the page sets with `textContent`: the
 * workflow's phases and steps (the step under way is the open one), the reviews, the gates, the
 * labelled edges the run took, what each agent runs on and the question it waits on, with where
 * to answer it: in the chat, where Copilot puts it to the person, or in a terminal. It shows; it
 * takes no answer and decides nothing. The content carries the journal too, read through Observe
 * (the engine checks its hash chain): this file never reads events.jsonl. Every text is the engine's or fixed here; no exception text.
 *
 * @typedef {import('../../application/pipeline/observe-usecase.mjs').RunView} RunView
 * @typedef {import('../../domain/reporting/run-graph.mjs').GraphNode} GraphNode
 * @typedef {{ key: string, text: string, state: string }} Line
 * @typedef {{ key: string, text: string, state: string, steps: Line[] }} PhaseLines
 * @typedef {{ key: string, header: string, text: string, usage: string, how: string }} Question
 * @typedef {{ title: string, status: string, code?: string, reason: string, phases: PhaseLines[], details: Line[], question: Question | null }} PanelContent
 * @typedef {{ directory: () => string | null, pluginRoot: string, home: string }} ContentHost
 */

/** @typedef {{ digest: string | null, tabs: object | null, running: Promise<object> | null }} Memo */

const TITLE = 'skraft pipeline'
const MARKS = Object.freeze({ closed: '✓', open: '▶', pending: '·', done: '✓' })

/** @param {string} status @param {string} code names the fixed text, for the page to word it @param {string} reason @returns {PanelContent} */
const without = (status, code, reason) => Object.freeze({ title: TITLE, status, code, reason, phases: [], details: [], question: null })

const NO_DIRECTORY_TEXT = 'The Copilot session has no working directory yet.'
export const NO_DIRECTORY = without('no-directory', 'no-directory', NO_DIRECTORY_TEXT)
export const UNREADABLE = without('unreadable', 'pipeline-unreadable', 'skraft could not read the pipeline of this working copy; run skraft status in a terminal.')

/**
 * The content of the active pipeline in the session's directory now; fixed content while the
 * session has none, or when it cannot be read.
 * @param {ContentHost} host @returns {Promise<PanelContent>}
 */
export const pipelineContent = async ({ directory, pluginRoot, home }) => {
  const cwd = directory()
  if (cwd === null) return NO_DIRECTORY
  try {
    return contentOf(await createObserve(createNodeAdapters({ cwd, pluginRoot, home })).view())
  } catch {
    return UNREADABLE
  }
}

/**
 * What the page draws: the run, read on each call, with the configuration and the workflows
 * beside it, read again only when what a person edits changed (edited-files.mjs), when that
 * cannot be told, or when `fresh`: a page arrives and is given everything as the files say now.
 * One memo for each panel, kept between calls.
 * @param {ContentHost & { journalRows: number }} host
 * @returns {(read?: { fresh?: boolean }) => Promise<object>}
 */
export const createPanelContent = (host) => {
  const kept = { digest: /** @type {string | null} */ (null), tabs: /** @type {object | null} */ (null), running: /** @type {Promise<object> | null} */ (null) }
  return ({ fresh = false } = {}) => coalesced(host, kept, fresh)
}

/**
 * A read that starts while another runs awaits that one, so that polls never pile up behind a slow
 * read; a `fresh` one, which must see the files as they are now, runs once the other ended.
 * @param {ContentHost} host @param {Memo} kept @param {boolean} fresh
 */
const coalesced = (host, kept, fresh) => {
  if (kept.running !== null && !fresh) return kept.running
  const run = endOf(kept.running).then(() => panelContent(host, kept, fresh))
  const done = () => { if (kept.running === run) kept.running = null }
  kept.running = run
  run.then(done, done)
  return run
}

/** @param {Promise<object> | null} running @returns {Promise<void>} */
const endOf = (running) => (running === null ? Promise.resolve() : running.then(() => undefined, () => undefined))

/** @param {ContentHost} host @param {Memo} kept @param {boolean} fresh */
const panelContent = async (host, kept, fresh) => {
  const cwd = host.directory()
  const same = { ...host, directory: () => cwd }
  return { ...await pipelineContent(same), ...await editedTabs(same, kept, fresh), journal: await journalContent(same) }
}

/** The journal the page shows when it cannot read one: the chain's state and a fixed text the page words by its code. @param {string} state @param {string} code @param {string} reason */
const unshown = (state, code, reason) => Object.freeze({ slug: null, chain: Object.freeze({ state, code, reason, lines: 0, unverified: 0 }), entries: [], total: 0 })
const NO_DIRECTORY_JOURNAL = unshown('none', 'no-directory', NO_DIRECTORY_TEXT)
const UNREADABLE_JOURNAL = unshown('unreadable', 'pipeline-unreadable', UNREADABLE.reason)

/**
 * The Journal tab: the active pipeline's journal, its last `journalRows` entries, read on every
 * call, outside the digest; fixed content when it cannot be read.
 * @param {ContentHost & { journalRows: number }} host
 */
export const journalContent = async (host) => {
  const cwd = host.directory()
  if (cwd === null) return NO_DIRECTORY_JOURNAL
  try {
    return await createObserve(adaptersIn(host, cwd)).journal({ last: host.journalRows })
  } catch {
    return UNREADABLE_JOURNAL
  }
}

/**
 * The digest is taken before the tabs are read: an edit between the two gives another digest on
 * the next call, and so another read. Tabs a read could not draw are kept under no digest: the
 * next call reads again, though nothing a person edits changed.
 * @param {ContentHost} host @param {Memo} kept @param {boolean} fresh
 */
const editedTabs = async (host, kept, fresh) => {
  const digest = await digestOf(host)
  if (fresh || digest === null || digest !== kept.digest) Object.assign(kept, await readKept(host, digest))
  return kept.tabs
}

/** @param {ContentHost} host @param {string | null} digest */
const readKept = async (host, digest) => {
  const { tabs, failed } = await readTabs(host)
  return { digest: failed ? null : digest, tabs }
}

/** @param {ContentHost} host @returns {Promise<string | null>} */
const digestOf = async (host) => {
  const cwd = host.directory()
  return cwd === null ? null : editedDigest({ cwd, home: host.home })
}

/** @param {ContentHost} host */
const readTabs = async (host) => {
  const configuration = await configurationContent(host)
  const { workflows, threw } = await workflowsContent(host)
  return { tabs: { configuration, workflows }, failed: configuration.status === 'unreadable' || threw }
}

const UNREADABLE_CONFIGURATION = 'skraft could not read the configuration of this working copy; run skraft doctor in a terminal.'
const UNSAVED = 'skraft could not save the configuration; run skraft doctor in a terminal.'

/**
 * The Configuration tab: what the files say, or why it cannot be shown, in the engine's words.
 * @param {ContentHost} host
 */
export const configurationContent = async (host) => {
  const cwd = host.directory()
  if (cwd === null) return { status: 'no-directory', code: 'no-directory', reason: NO_DIRECTORY_TEXT }
  try {
    const view = await createConfiguration(adaptersIn(host, cwd)).view()
    return view.ok ? { status: 'ok', reason: '', ...view } : { status: 'invalid', reason: view.reason }
  } catch {
    return { status: 'unreadable', code: 'configuration-unreadable', reason: UNREADABLE_CONFIGURATION }
  }
}

/**
 * The edit the page sends, saved by the engine; refused with why.
 * @param {ContentHost} host @param {unknown} edit @returns {Promise<{ ok: boolean, reason: string, code?: string }>}
 */
export const saveConfiguration = async (host, edit) => {
  const cwd = host.directory()
  if (cwd === null) return { ok: false, code: 'no-directory', reason: NO_DIRECTORY_TEXT }
  try {
    return await createConfiguration(adaptersIn(host, cwd)).save(edit)
  } catch {
    return { ok: false, code: 'unsaved', reason: UNSAVED }
  }
}

/**
 * The Workflow tab: each workflow a run can follow, none when they cannot be read; `threw` tells a
 * read that threw (the journal cannot be read) from the engine's own none: a workflow it refuses (a
 * syntax error, a locked gate dropped) is no failure, the files say so and the digest tells when
 * they change.
 * @param {ContentHost} host @returns {Promise<{ workflows: import('../../domain/reporting/workflow-drawing.mjs').WorkflowDrawing[], threw: boolean }>}
 */
const workflowsContent = async (host) => {
  const cwd = host.directory()
  if (cwd === null) return { workflows: [], threw: false }
  try {
    return { workflows: await createObserve(adaptersIn(host, cwd)).workflows(), threw: false }
  } catch {
    return { workflows: [], threw: true }
  }
}

/** @param {ContentHost} host @param {string} cwd */
const adaptersIn = ({ pluginRoot, home }, cwd) => createNodeAdapters({ cwd, pluginRoot, home })

/** @param {RunView} view @returns {PanelContent} */
const contentOf = (view) => ({
  title: view.slug === null ? TITLE : `skraft ${view.slug}`,
  status: view.status,
  reason: view.reason,
  phases: view.phases.map(({ phase, state }) => ({ key: `phase-${phase}`, text: `${MARKS[state]} ${phase}`, state, steps: stepsOf(view, phase) })),
  details: [...reviewLines(view), ...gateLines(view), ...loopLines(view), ...agentLines(view)],
  question: questionOf(view.question),
})

/** The workflow's steps of one phase. @param {RunView} view @param {string} phase @returns {Line[]} */
const stepsOf = (view, phase) => view.graph.nodes
  .filter((node) => node.phase === phase)
  .map((node) => ({ key: `step-${node.id}`, text: stepText(node), state: node.state }))

/**
 * `✓ design — solution-architect: done, pass 2`: the step, what it runs, what it came to. No
 * cost: Copilot reports credits, never USD (ctx-agent-runner.mjs).
 * @param {GraphNode} node
 */
const stepText = (node) => {
  const what = node.what === null ? '' : ` — ${node.what}`
  const details = [outcomeText(node), node.visits > 1 ? `pass ${node.visits}` : null].filter((detail) => detail !== null)
  return `${MARKS[node.state]} ${node.id}${what}${details.length > 0 ? `: ${details.join(', ')}` : ''}`
}

/**
 * What a step came to; a consent the run asked nobody, for the configuration holds its answer,
 * says so.
 * @param {GraphNode} node
 */
const outcomeText = ({ kind, what, outcome }) => (kind === 'ask' && outcome === 'skipped' && CONSENT_QUESTIONS.includes(/** @type {any} */ (what)) ? 'answered by the configuration' : outcome)

/** The last pass of each review step. @param {RunView} view @returns {Line[]} */
const reviewLines = ({ reviews }) => reviews.map(({ step, visit, verdict, lenses }) => ({
  key: `review-${step}`,
  text: `review ${step}: ${verdict ?? 'in progress'}${visit > 1 ? `, pass ${visit}` : ''} — ${lensesText(lenses)}`,
  state: verdict === null ? 'open' : 'done',
}))

/** One line per component, each gate's last result; never its command nor its evidence. @param {RunView} view @returns {Line[]} */
const gateLines = ({ gates }) => [...new Set(gates.map((gate) => gate.component))].map((component) => ({
  key: `gates-${component}`,
  text: `gates ${component}: ${gates.filter((gate) => gate.component === component).map(gateText).join(', ')}`,
  state: 'done',
}))

/** @param {import('../../domain/reporting/run-facts.mjs').GateFact} gate */
const gateText = ({ gate, status, survivors }) => `${gate} ${status}${typeof survivors === 'number' ? ` (${survivors} survivors)` : ''}`

/** The labelled edges the run took: where it went back or branched. @param {RunView} view @returns {Line[]} */
const loopLines = ({ graph }) => graph.edges
  .filter((edge) => edge.label !== null && edge.taken > 0)
  .map(({ from, to, label, taken }) => ({ key: `edge-${from}-${to}`, text: `${from} → ${to} (${label}) ×${taken}`, state: 'done' }))

/** What each agent started runs on under the host that started it. @param {RunView} view @returns {Line[]} */
const agentLines = ({ agents }) => agents.map((row) => ({ key: `agent-${row.step}-${row.agent}`, text: agentText(row), state: 'done' }))

/**
 * The question the run waits on, and where the person answers it: the page has no answer of its own.
 * @param {RunView['question']} question @returns {Question | null}
 */
const questionOf = (question) => (question === null ? null : withUsage(question, decideUsage(question)))

/**
 * The question with what to type after `skraft decide <key>`; `how` is the English sentence the
 * model reads, the page words it in the person's language from `usage`.
 * @param {{ key: string, header: string, text: string }} question @param {string} usage @returns {Question}
 */
const withUsage = ({ key, header, text }, usage) => ({ key, header, text, usage, how: `Answer it in the Copilot chat, where Copilot puts it to you; or type skraft decide ${key} ${usage} in a terminal.` })
