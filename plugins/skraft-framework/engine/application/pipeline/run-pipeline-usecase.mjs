import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { DEFAULT_ATTEMPTS, nextStep } from '../../domain/pipeline/next-step.mjs'
import { composeBrief, dispatchLabel } from '../../domain/pipeline/dispatch-brief.mjs'
import { dayOf, isFilled, outputPath } from '../../domain/pipeline/outputs.mjs'
import { isDocument, writtenDocuments } from '../../domain/pipeline/documents.mjs'
import { SCAN_FILE } from '../../domain/pipeline/structural-scan.mjs'
import { allowedPaths, makesCommits, roleOf } from '../../domain/pipeline/roles.mjs'
import { componentSkills } from '../../domain/pipeline/component-skills.mjs'
import { REPLAY_SHARE } from '../../domain/pipeline/commits.mjs'
import { RUN_REPORT_FILE, renderRunReport, runReport } from '../../domain/reporting/run-report.mjs'
import { statusLine } from '../../domain/reporting/run-status.mjs'
import { renderWorkflowView, WORKFLOW_FILE } from '../../domain/reporting/workflow-view.mjs'
import { aliveCount, groupSurvivors, isStalled, ROUNDS_WITHOUT_PROGRESS } from '../../domain/gates/mutation-report.mjs'
import { openActiveRun } from './active-run.mjs'
import { baseOf, loadConfig } from '../config/bases.mjs'
import { assignmentOf, modelOf, reviewAssignmentsOf } from '../config/agent-models.mjs'
import { runGates } from '../gates/gate-runs.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'
import { runReview } from '../review/review-runs.mjs'
import { boundInputs } from './review-inputs.mjs'
import { leave } from './run-routes.mjs'
import { askStep, escalate, settleEnvironment } from './run-questions.mjs'
import { publishStep } from './publish-step.mjs'
import { checkStep, headsOf } from './step-checks.mjs'
import { writeStructuralScan } from './structural-scan.mjs'

/**
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('../journal/run-journal.mjs').OpenJournal} OpenJournal
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/pipeline/next-step.mjs').WorkStep} WorkStep
 * @typedef {import('../../domain/pipeline/next-step.mjs').SkipStep} SkipStep
 * @typedef {import('../../domain/pipeline/next-step.mjs').BlockedStep} BlockedStep
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {{
 *   journal: import('../ports/run-journal-store.mjs').RunJournalStore,
 *   activePipeline: import('../ports/active-pipeline.mjs').ActivePipeline,
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   templates: import('../ports/template-library.mjs').TemplateLibrary,
 *   clock: import('../ports/clock.mjs').Clock,
 *   hasher: import('../ports/hasher.mjs').Hasher,
 *   agentRunner: import('../ports/agent-runner.mjs').AgentRunner,
 *   human: import('../ports/human-interaction.mjs').HumanInteraction,
 *   progress: import('../ports/pipeline-progress.mjs').PipelineProgress,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   commandRunner: import('../ports/command-runner.mjs').CommandRunner,
 *   commitReplay: import('../ports/commit-replay.mjs').CommitReplay,
 *   workflowSource: import('../ports/workflow-source.mjs').WorkflowSource,
 *   agentCatalog: import('../ports/agent-catalog.mjs').AgentCatalog,
 *   codeHost: import('../ports/code-host.mjs').CodeHost,
 * }} PipelineDeps
 * @typedef {{
 *   deps: PipelineDeps, slug: string, journal: OpenJournal, config: SkraftConfig,
 *   loaded: Extract<import('../workflow/load-workflow.mjs').WorkflowLoading, { ok: true }>,
 * }} Context
 */

/**
 * RunPipeline — runs the active pipeline along its workflow until it reaches the exit, is
 * blocked, or the host or the machine stops it. Every fact goes to the journal before the
 * next step is decided from it.
 * @param {PipelineDeps} deps
 */
export const createRunPipeline = (deps) => Object.freeze({
  /** @param {{ slug?: string | null }} [request] @returns {Promise<RunOutcome>} */
  run: async ({ slug: requested } = {}) => runActive(deps, requested),
})

/**
 * Opens the active run, its configuration and its workflow, then runs it.
 * @param {PipelineDeps} deps @param {string | null | undefined} requested
 * @returns {Promise<RunOutcome>}
 */
const runActive = async (deps, requested) => {
  const opened = await openActiveRun(deps, requested)
  if (!opened.ok) return opened.outcome
  const { slug, journal } = opened
  const config = await loadConfig(deps)
  if (!config.ok) return blockedBeforeStart(slug, 'config-invalid', config.reason)
  const loaded = await loadWorkflow(deps, {})
  if (!loaded.ok) return blockedBeforeStart(slug, 'workflow-invalid', loaded.reason)
  return runGuarded({ deps, slug, journal, config: config.config, loaded })
}

/**
 * A journal another writer changed under the run blocks it.
 * @param {Context} context @returns {Promise<RunOutcome>}
 */
const runGuarded = async (context) => {
  try {
    return await runFrom(context)
  } catch (error) {
    if (!(error instanceof JournalConflict)) throw error
    return blockedBeforeStart(context.slug, 'journal-changed', error.message)
  }
}

/** @param {string} slug @param {string} code @param {string} reason @returns {RunOutcome} */
const blockedBeforeStart = (slug, code, reason) => ({ status: 'blocked', slug, phase: null, code, reason })

/** @param {Context} context @returns {Promise<RunOutcome>} */
const runFrom = async (context) => {
  /** @type {string | null} */
  let shown = null
  for (;;) {
    const run = deriveRun(context.journal.events)
    const next = nextStep(context.loaded.workflow, run)
    const outcome = await take(context, shown, run, next)
    await writeReports(context)
    if (outcome) return outcome
    shown = next.phase
  }
}

/**
 * run-report.md and WORKFLOW.md, written again from the journal after each step.
 * @param {Context} context
 */
const writeReports = async ({ deps, slug, journal, loaded }) => {
  const run = deriveRun(journal.events)
  await deps.files.write(slug, RUN_REPORT_FILE, renderRunReport({ slug, status: statusLine(run), report: runReport(journal.events) }))
  await deps.files.write(slug, WORKFLOW_FILE, renderWorkflowView({ slug, workflow: loaded.workflow, run }))
}

/**
 * One step of the run: its end, a phase to close, or a node to work.
 * @param {Context} context @param {string | null} shown the phase the developer was last shown
 * @param {RunState} run @param {import('../../domain/pipeline/next-step.mjs').NextStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const take = (context, shown, run, next) => {
  if (run.question?.kind === 'environment') return settleEnvironment(context, run, run.question)
  if (next.kind === 'done') return finish(context, run, next)
  if (next.kind === 'blocked') return finishBlocked(context, run, next)
  if (next.kind === 'close-phase') return closePhase(context, next)
  showPhase(context, shown, next.phase)
  return work(context, run, next)
}

/**
 * @param {Context} context @param {RunState} run @param {import('../../domain/pipeline/next-step.mjs').DoneStep} next
 * @returns {Promise<RunOutcome>}
 */
const finish = async ({ slug, journal }, run, { phase }) => {
  const reason = `${phase} closed`
  if (!run.finished) await journal.append('run.finished', { status: 'completed', reason })
  return { status: 'done', slug, phase, code: null, reason }
}

/** @param {Context} context @param {RunState} run @param {BlockedStep} next @returns {Promise<RunOutcome>} */
const finishBlocked = async (context, run, next) => {
  const { code, reason } = blockedBy(context, next)
  if (!run.finished) await context.journal.append('run.finished', { status: 'blocked', code, reason })
  return { status: 'blocked', slug: context.slug, phase: next.phase, code, reason }
}

/**
 * @param {Context} context @param {import('../../domain/pipeline/next-step.mjs').ClosePhaseStep} next
 * @returns {Promise<null>}
 */
const closePhase = async ({ deps, slug, journal }, { phase }) => {
  await journal.append('phase.closed', { phase })
  deps.progress.log(`${slug}: ${phase} closed`)
  return null
}

/** @param {Context} context @param {string | null} shown @param {string} phase */
const showPhase = ({ deps }, shown, phase) => {
  if (shown !== phase) deps.progress.phase(phase)
}

/**
 * @param {Context} context @param {RunState} run @param {WorkStep | SkipStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const work = (context, run, next) => {
  if (next.kind === 'skip') return skip(context, run, next)
  if (next.kind === 'gate') return gate(context, run, next)
  if (next.kind === 'review' || next.kind === 'call') return review(context, run, next)
  if (next.kind === 'ask') return askStep(context, run, next)
  if (next.kind === 'publish') return publishStep(context, run, next)
  return dispatch(context, run, next)
}

/**
 * @param {Context} context
 * @param {BlockedStep} next
 * @returns {{ code: string, reason: string }}
 */
const blockedBy = (context, next) => {
  if (next.cause === 'workflow-changed') return { code: 'workflow-changed', reason: `the workflow has no node ${next.missingNode} any more; restore the workflow the run started with` }
  const event = /** @type {import('../../domain/journal/run-state.mjs').RunEvent} */ (next.last)
  if (next.cause === 'route') return { code: event.code, reason: event.reason }
  return refusedBy(context, next, event)
}

/**
 * Why an agent blocks the run: it said so, it failed the same way twice, or it used its attempts.
 * @param {Context} context @param {BlockedStep} next @param {import('../../domain/journal/run-state.mjs').RunEvent} event
 * @returns {{ code: string, reason: string }}
 */
const refusedBy = (context, { cause, node, previous }, event) => {
  const agent = /** @type {{ agent: string }} */ (node).agent
  if (cause === 'agent-blocked') return { code: event.code, reason: `${agent} is blocked: ${event.failures[0]}` }
  const details = refusalDetails(context, event)
  return cause === 'breaker'
    ? { code: event.code, reason: `${agent} failed the same way on attempts ${/** @type {{ attempt: number }} */ (previous).attempt} and ${event.attempt}: ${details}` }
    : { code: event.code, reason: `${agent} still failed after ${event.attempt} attempts: ${details}` }
}

/** @param {Context} context @param {import('../../domain/journal/run-state.mjs').RunEvent} event */
const refusalDetails = ({ deps, slug }, event) => [
  ...(event.missing.length > 0 ? [`missing outputs: ${event.missing.map((/** @type {string} */ path) => deps.files.location(slug, path)).join(', ')}`] : []),
  ...event.failures,
].join('; ')

/**
 * @typedef {{
 *   agent: string, role: ReturnType<typeof roleOf>, outputs: string[], result: string,
 *   precreated: (string | null)[], scan: string | null, skills: string[],
 *   assignment: import('../../domain/config/model-assignment.mjs').ResolvedAssignment,
 * }} Job
 *   what an attempt of an agent node is asked to write, the templates it starts from, and the
 *   structural scan the engine wrote for it to read, and the SKILL.md files of its components it reads first;
 *   assignment: what it runs on, the one its open attempt journaled on a resume.
 */

/**
 * One attempt of an agent node: pre-create the outputs, start the agent unless a resumed
 * attempt already left them done, then check what it did.
 * @param {Context} context
 * @param {RunState} run
 * @param {WorkStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const dispatch = async (context, run, next) => {
  const job = await prepareJob(context, run, next)
  const heads = await openAttempt(context, run, next, job)
  context.deps.progress.log(`${context.slug}: ${job.agent}${passOf(next.visit)}, attempt ${next.attempt}`)
  const started = context.deps.clock.now()
  const asked = await runAgent(context, run, next, job)
  if (asked.outcome !== null) return asked.outcome
  return judgeAttempt(context, run, next, { job, heads, started, cost: asked.cost, model: asked.model })
}

/** @param {number} visit */
const passOf = (visit) => (visit > 1 ? `, pass ${visit}` : '')

/**
 * The outputs an attempt writes, kept from the node's first attempt, and their templates.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @returns {Promise<Job>}
 */
const prepareJob = async (context, run, next) => {
  const { deps, slug, config } = context
  const { node, visit, attempt, group } = next
  const agent = /** @type {string} */ (node.agent)
  const role = roleOf(node)
  const date = dayOf(deps.clock.now())
  const outputs = run.nodes[node.id]?.outputs ?? role.outputs.map((output) => outputPath(output.path, { date, slug }))
  const result = `results/${node.id}-${visit}${group === null ? '' : `-g${group}`}-${attempt}.json`
  const precreated = await Promise.all(role.outputs.map((output) => (output.template ? deps.templates.read(output.template) : null)))
  const scan = role.scan ? await writeStructuralScan(deps, { slug, path: outputPath(SCAN_FILE, { date, slug }), components: config.components }) : null
  return { agent, role, outputs, result, precreated, scan, skills: await skillPaths(deps, role, config.components), assignment: phaseAssignment(context, next) }
}

/**
 * What the agent of a node runs on: what its open attempt journaled when the run resumes it,
 * so that a configuration changed since does not change it, else what the configuration says.
 * @param {Context} context @param {WorkStep} next
 */
const phaseAssignment = ({ config, journal }, { node, resumed }) => {
  if (resumed) return openStart(journal).assignment
  return assignmentOf(config, { agent: /** @type {string} */ (node.agent), type: 'phase', named: node.model })
}

/** The step.started of the attempt a resumed run picks up: the last one journaled. @param {OpenJournal} journal */
const openStart = (journal) => /** @type {import('../../domain/journal/run-state.mjs').RunEvent} */ (journal.events.findLast((event) => event.type === 'step.started'))

/**
 * The skills of the components the agent drives that the plugin or the working copy ships, each
 * once; the agent loads its own skills by name.
 * @param {PipelineDeps} deps @param {Job['role']} role
 * @param {import('../../domain/config/skraft-config.mjs').Component[]} components
 */
const skillPaths = async ({ agentCatalog }, role, components) => {
  const shipped = await Promise.all(componentSkills(role, components).map((name) => agentCatalog.skill(name)))
  return [...new Set(shipped.flatMap((file) => (file === null ? [] : [file.path])))]
}

/**
 * Opens the attempt in the journal, with its outputs pre-created, unless a resumed attempt is
 * already open; returns the heads the attempt started from.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job
 */
const openAttempt = async (context, run, next, job) => {
  if (next.resumed?.heads) return next.resumed.heads
  await precreate(context, job)
  await context.deps.files.write(context.slug, snapshotOf(job.result), JSON.stringify(await documentHashes(context)))
  const heads = await headsOf(context.deps, run.base)
  const { phase, node, visit, attempt, missing, feedback, sentBy } = next
  const { agent, outputs, result, assignment } = job
  await context.journal.append('step.started', { step: node.id, phase, agent, visit, attempt, outputs, result, missing, feedback, ...(sentBy === null ? {} : { sentBy }), ...groupFields(next), heads, assignment })
  return heads
}

/**
 * The group of surviving mutants an attempt works on; the visit's first attempt also lists them all.
 * @param {WorkStep} next
 */
const groupFields = ({ group, groups, attempt }) => {
  if (group === null) return {}
  return group === 1 && attempt === 1 ? { group, groups } : { group }
}

/** Where an attempt keeps the documents of the tracking folder as it found them. @param {string} result the attempt's result file */
const snapshotOf = (result) => result.replace(/\.json$/, '.documents.json')

/** Each document of the tracking folder with the hash of its content. @param {Context} context */
const documentHashes = async ({ deps, slug }) => {
  /** @type {Record<string, string>} */
  const hashes = {}
  for (const path of (await deps.files.list(slug, '')).filter(isDocument)) hashes[path] = await deps.hasher.sha256(/** @type {string} */ (await deps.files.read(slug, path)))
  return hashes
}

/**
 * The documents of the attempt: those it wrote in the tracking folder, against what it found
 * there, and the structural scan the engine wrote for it.
 * @param {Context} context @param {Job} job
 */
const documentsWritten = async (context, { result, scan }) => {
  const before = await context.deps.files.read(context.slug, snapshotOf(result))
  const written = writtenDocuments(before === null ? {} : JSON.parse(before), await documentHashes(context))
  return [...new Set([...written, ...(scan === null ? [] : [scan])])].sort()
}

/** Writes each output that has a template and does not exist yet. @param {Context} context @param {Job} job */
const precreate = async ({ deps, slug }, { outputs, precreated }) => {
  for (const [index, path] of outputs.entries()) {
    const text = precreated[index]
    if (text !== null && (await deps.files.read(slug, path)) === null) await deps.files.write(slug, path, text)
  }
}

/**
 * Whether an output is still missing or left as its template, or the result is not written.
 * @param {Context} context @param {Job} job
 */
const pending = async ({ deps, slug }, { outputs, precreated, result }) => {
  const texts = await Promise.all(outputs.map((path) => deps.files.read(slug, path)))
  const left = outputs.filter((_, index) => !isFilled(texts[index], precreated[index]))
  return left.length > 0 || (await deps.files.read(slug, result)) === null
}

/**
 * Starts the agent, unless a resumed attempt already left its work done.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job
 * @returns {Promise<{ outcome: RunOutcome | null, cost?: number, model?: string | null }>}
 */
const runAgent = async (context, run, next, job) => {
  if (next.resumed && !(await pending(context, job))) return { outcome: null }
  return askAgent(context, run, next, job)
}

/**
 * The agent's answer: the run stops when the agent could not start, or stopped with its work
 * not done.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job
 * @returns {Promise<{ outcome: RunOutcome | null, cost?: number, model?: string | null }>}
 */
const askAgent = async (context, run, next, job) => {
  const { agent } = job
  const answer = await context.deps.agentRunner.run(agentCall(context, run, next, job))
  if (answer.unavailable) return { outcome: await stop(context, next.phase, 'agent-unavailable', answer.error ?? `${agent} could not be started`) }
  const unfinished = !answer.ok && (await pending(context, job))
  if (unfinished) return { outcome: await stop(context, next.phase, 'agent-failed', `${agent} stopped without finishing: ${answer.error ?? 'no answer'}`) }
  return { outcome: null, cost: answer.costUsd, model: answer.model ?? null }
}

/** @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job */
const agentCall = (context, run, next, job) => ({
  agent: job.agent,
  source: context.loaded.sources[job.agent],
  label: dispatchLabel({ slug: context.slug, step: next.node.id, visit: next.visit, attempt: next.attempt, group: next.group === null ? null : { index: next.group, of: next.groups.length } }),
  prompt: composeBrief(briefOf(context, run, next, job)),
  ...modelOf(job.assignment),
})

/** @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job */
const briefOf = (context, run, next, job) => ({
  agent: job.agent, phase: next.phase, slug: context.slug, story: run.story, visit: next.visit, attempt: next.attempt,
  maxAttempts: next.node.maxAttempts ?? DEFAULT_ATTEMPTS,
  ...briefPaths(context, run, next, job),
  ...briefStack(context, run, job.role),
  missing: next.missing.map((path) => context.deps.files.location(context.slug, path)),
  feedback: next.feedback,
  sentBy: next.sentBy,
  acceptance: acceptanceCommits(context),
  mutants: next.group === null ? null : { ...next.groups[next.group - 1], group: next.group, of: next.groups.length },
})

/**
 * The red commits the last attempt of each pass of an acceptance step confirmed: what an agent
 * committing failing tests only left for the TDD cycles after it.
 * @param {Context} context
 * @returns {string[]} `<sha> "<subject>"`, each once
 */
const acceptanceCommits = ({ journal, loaded }) => {
  const checked = journal.events.filter((event) => event.type === 'commits.checked' && isAcceptanceStep(loaded.workflow.nodes[event.step]))
  const last = [...new Map(checked.map((event) => [`${event.step} ${event.visit}`, event])).values()]
  // A pass that went on refused none of its commits, so every red it lists was replayed red.
  const reds = last.flatMap((event) => event.commits.filter((/** @type {{ kind: string }} */ commit) => commit.kind === 'red'))
  return [...new Set(reds.map((/** @type {{ sha: string, subject: string }} */ commit) => `${commit.sha.slice(0, 7)} "${commit.subject}"`))]
}

/** An agent node that commits failing tests only. @param {import('../../domain/workflow/workflow.mjs').WorkflowNode | undefined} node */
const isAcceptanceStep = (node) => node?.kind === 'agent' && roleOf(node).tdd === 'red'

/** @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job */
const briefPaths = ({ deps, slug, config }, run, next, { role, outputs, result, scan, skills }) => {
  const at = (/** @type {string} */ path) => deps.files.location(slug, path)
  return {
    skills,
    inputs: [...inputsOf(run, next.node.id), ...(scan === null ? [] : [scan])].map(at),
    outputs: outputs.map(at),
    result: at(result),
    allowed: allowedPaths(role, { slug, components: config.components }),
  }
}

/** What the other nodes and the story left for an agent to read. @param {RunState} run @param {string} id */
const inputsOf = (run, id) => [...run.artifacts, ...Object.entries(run.nodes).filter(([other]) => other !== id).flatMap(([, state]) => state.outputs)]

/**
 * The components an agent that writes code works in, and how it drives its tests.
 * @param {Context} context @param {RunState} run @param {Job['role']} role
 */
const briefStack = ({ config }, run, role) => ({
  components: (role.components.length > 0 ? config.components : []).map(({ name, root, stack, mocking, contractTesting, commands }) => ({ name, root, stack, mocking: mocking.strategy, contractTesting, test: testLine(commands.test, baseOf(run.base, name)?.sha) })),
  tdd: role.tdd,
  commits: makesCommits(role),
})

/**
 * Checks what the attempt did and records it, unless the machine stopped it.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ job: Job, heads: any, started: Date, cost?: number, model?: string | null }} attempt
 * @returns {Promise<RunOutcome | null>}
 */
const judgeAttempt = async (context, run, next, attempt) => {
  const checked = await checkAttempt(context, run, next, attempt)
  if (checked.commits.length > 0) await context.journal.append('commits.checked', { step: next.node.id, visit: next.visit, attempt: next.attempt, commits: checked.commits })
  if (checked.environment !== null) return escalate(context, next, checked.environment)
  await recordAttempt(context, run, next, { ...attempt, checked })
  await warnSlowReplay(context, next.phase)
  return null
}

/**
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ job: Job, heads: any }} attempt
 */
const checkAttempt = ({ deps, slug, config, journal }, run, { node, attempt, feedback, sentBy }, { job, heads }) => {
  const inState = attempt > 1
  const { role, outputs, precreated, result } = job
  return checkStep({ deps, slug, config, base: run.base, story: run.story }, {
    role, outputs, precreated, result, known: knownCommits(journal),
    visitHeads: inState ? run.nodes[node.id].heads : heads,
    redByGateFailure: inState ? run.nodes[node.id].redByGateFailure : feedback.length > 0 && sentBy !== 'review' && sentBy !== 'ask',
  })
}

/** The commits the journal already judged, by sha. @param {OpenJournal} journal */
const knownCommits = (journal) => new Map(journal.events
  .filter((event) => event.type === 'commits.checked')
  .flatMap((event) => event.commits.map((/** @type {{ sha: string, verdict: string, replay: any }} */ commit) => [commit.sha, commit])))

/**
 * Records the attempt: refused, or done with the node it leads to.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ job: Job, started: Date, cost?: number, model?: string | null, checked: Awaited<ReturnType<typeof checkStep>> }} attempt
 */
const recordAttempt = async (context, run, { node, visit, attempt, group, groups }, { job, started, cost, model, checked }) => {
  const failed = checked.missing.length > 0 || checked.failures.length > 0
  const routed = failed ? { next: null } : routeDone(context, run, { node, group, groups })
  await context.journal.append('step.recorded', {
    step: node.id, visit, attempt, ...(group === null ? {} : { group }), documents: await documentsWritten(context, job),
    outcome: failed ? 'failed' : 'done',
    code: failed ? checked.code : routed.code ?? null,
    missing: checked.missing, failures: checked.failures,
    next: routed.next, reason: routed.reason, model, // undefined on a resume that did not start the agent
    ...spent(context, started, checked.replayMs, cost),
  })
}

/**
 * Where a done attempt leads: a group of surviving mutants hands over to the next one of its
 * visit, the last one leaves the node.
 * @param {Context} context @param {RunState} run @param {Pick<WorkStep, 'node' | 'group' | 'groups'>} next
 * @returns {{ next: string | null, code?: string, reason?: string }}
 */
const routeDone = (context, run, { node, group, groups }) => (group !== null && group < groups.length ? { next: null } : leave(context, run, node.id, null, []))

/** @param {Context} context @param {Date} started @param {number | undefined} replayMs @param {number | undefined} cost */
const spent = ({ deps }, started, replayMs, cost) => ({
  durationMs: deps.clock.now().getTime() - started.getTime(),
  replayMs,
  cost, // undefined when the host reports none: the journal line leaves it out
})

/**
 * A test command as the agent can run it: the base the run diffs against in place of `{baseSha}`.
 * @param {string | undefined} line @param {string | undefined} sha
 */
const testLine = (line, sha) => (line === undefined ? null : sha ? line.replaceAll('{baseSha}', sha) : line)

/**
 * Tells the developer once per phase that replaying red commits takes more than its share of
 * the phase, while every red commit is replayed.
 * @param {Context} context @param {string} phase
 */
const warnSlowReplay = async ({ deps, slug, journal, config }, phase) => {
  if (config.tdd.replay !== 'all') return
  const run = deriveRun(journal.events)
  const replayMs = run.replayMs[phase] ?? 0
  const phaseMs = deps.clock.now().getTime() - Date.parse(run.phaseStarted[phase])
  if (run.replayWarned.includes(phase) || replayMs <= REPLAY_SHARE * phaseMs) return
  await journal.append('tdd.replay-slow', { phase, replayMs, phaseMs })
  deps.progress.log(
    `${slug}: replaying test commits took ${Math.round((100 * replayMs) / phaseMs)}% of ${phase}; ` +
    `set "tdd": { "replay": "last-red" } in ${CONFIG_FILE} to replay only the last test commit of each story`,
  )
}

/**
 * A gate node: the gates of the components the story touched, then for a goal gate those of
 * every other component.
 * @param {Context} context
 * @param {RunState} run
 * @param {WorkStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const gate = async (context, run, next) => {
  const { phase, node } = next
  await openGate(context, next)
  if (context.config.components.length === 0) return stop(context, phase, 'no-components', `${CONFIG_FILE} lists no component, so ${node.id} has nothing to run; run skraft init to detect them`)
  const started = context.deps.clock.now()
  const { gates, failure } = await gateResults(context, run, node)
  const failures = gates.filter((result) => result.status === 'fail').map((result) => `${result.component}/${result.gate}: ${result.reason} (evidence: ${result.evidence})`)
  if (failure === 'environment') return escalate(context, next, failures.join('; '))
  await recordGate(context, run, next, { failure, failures, started, survivors: groupSurvivors(gates.flatMap((result) => result.survivors ?? [])) })
  return null
}

/** @param {Context} context @param {WorkStep} next */
const openGate = async ({ deps, slug, journal }, { phase, node, visit, attempt, sentBy, resumed }) => {
  if (!resumed) await journal.append('step.started', { step: node.id, phase, gates: node.gates, visit, attempt, ...(sentBy === null ? {} : { sentBy }) })
  deps.progress.log(`${slug}: ${node.id} (${node.gates.join(', ')})${passOf(visit)}`)
}

/**
 * The gates of the touched components, then for a goal gate that passed them, those of the others.
 * @param {Context} context @param {RunState} run @param {WorkStep['node']} node
 */
const gateResults = async ({ deps, slug, journal, config }, run, node) => {
  const request = { slug, journal, components: config.components, base: run.base, only: node.gates }
  const touched = await runGates(deps, { ...request, scope: 'touched' })
  if (touched.conflict !== null) throw new JournalConflict(touched.conflict)
  if (touched.failure === null && node.goal) return withOtherComponents(deps, request, touched)
  return touched
}

/**
 * @param {PipelineDeps} deps @param {Omit<Parameters<typeof runGates>[1], 'scope'>} request
 * @param {Awaited<ReturnType<typeof runGates>>} touched
 */
const withOtherComponents = async (deps, request, touched) => {
  const rest = await runGates(deps, { ...request, scope: 'all', skip: touched.components })
  return { gates: [...touched.gates, ...rest.gates], failure: rest.failure }
}

/**
 * Records the gate node: passed or failed, with the node it leads to.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ failure: string | null, failures: string[], started: Date, survivors: import('../../domain/gates/mutation-report.mjs').SurvivorGroup[] }} outcome
 *   survivors: the mutants the node's mutation runs left alive, by file
 */
const recordGate = async (context, run, { node, visit, attempt }, { failure, failures, started, survivors }) => {
  const routed = gateRoute(context, run, node.id, { failed: failure !== null, failures, survivors })
  await context.journal.append('step.recorded', {
    step: node.id, visit, attempt,
    outcome: failure === null ? 'pass' : 'fail',
    code: routed.code ?? null,
    failures,
    survivors,
    next: routed.next, reason: routed.reason,
    durationMs: context.deps.clock.now().getTime() - started.getTime(),
  })
}

/**
 * Where a gate node goes: a failed one that left as many mutants alive for its last rounds stops
 * the run; a blocked route names the mutants that remain.
 * @param {Context} context @param {RunState} run @param {string} id
 * @param {{ failed: boolean, failures: string[], survivors: import('../../domain/gates/mutation-report.mjs').SurvivorGroup[] }} outcome
 * @returns {{ next: string | null, code?: string, reason?: string }}
 */
const gateRoute = (context, run, id, { failed, failures, survivors }) => {
  const named = survivors.flatMap(({ mutants }) => mutants)
  if (failed && named.length > 0 && isStalled([...survivorCounts(context.journal, id), named.length])) {
    return { next: null, code: 'mutation-stalled', reason: `${id} left as many mutants alive for ${ROUNDS_WITHOUT_PROGRESS} rounds; ${aliveCount(named.length)}: ${named.join('; ')}` }
  }
  return leave(context, run, id, failed ? 'FAIL' : 'PASS', [...failures, ...named])
}

/**
 * How many mutants each failed pass of a gate node left alive since the node last passed; a pass
 * that named none is no round of the loop.
 * @param {OpenJournal} journal @param {string} id
 */
const survivorCounts = (journal, id) => {
  const passes = journal.events.filter((event) => event.type === 'step.recorded' && event.step === id)
  const since = passes.slice(passes.findLastIndex((event) => event.outcome !== 'fail') + 1)
  return since.map((event) => event.survivors.reduce((/** @type {number} */ total, /** @type {{ mutants: string[] }} */ group) => total + group.mutants.length, 0)).filter((count) => count > 0)
}

/**
 * A review node: its lenses and the refuter answer, the verdict decides the edge it leaves by.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const review = async (context, run, next) => {
  const assignments = await openReview(context, next)
  const started = context.deps.clock.now()
  const { deps, slug, journal, loaded, config } = context
  const inputs = boundInputs(next.node, { workflow: loaded.workflow, run, phase: next.phase, components: config.components, events: journal.events })
  const reviewed = await runReview({ deps, slug, journal, assignments, sources: loaded.sources, step: next, inputs })
  if ('stop' in reviewed) return stop(context, next.phase, reviewed.stop.code, reviewed.stop.reason)
  await recordReview(context, run, next, { reviewed, started })
  return null
}

/**
 * Opens the review unless the run resumes it; returns what its lenses and its refuter run on,
 * as its step.started journals them.
 * @param {Context} context @param {WorkStep} next
 * @returns {Promise<import('../config/agent-models.mjs').ReviewAssignments>}
 */
const openReview = async ({ deps, slug, journal, config }, { phase, node, visit, resumed }) => {
  if (!resumed) {
    const { lenses, refuter } = reviewAssignmentsOf(config, node)
    await journal.append('step.started', { step: node.id, phase, lenses: node.lenses, visit, attempt: 1, assignments: lenses, refuter })
  }
  deps.progress.log(`${slug}: ${node.id} (${node.lenses.join(', ')})${passOf(visit)}`)
  const { assignments, refuter } = openStart(journal)
  return { lenses: assignments, refuter }
}

/**
 * Records the review: its verdict with the node it leads to, or the lenses that block it.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ reviewed: Exclude<Awaited<ReturnType<typeof runReview>>, { stop: unknown }>, started: Date }} review
 */
const recordReview = async (context, run, { node, visit }, { reviewed, started }) => {
  const fields = reviewed.verdict.status === 'BLOCKED' ? blockedReview(reviewed.verdict) : recordedFieldsOf(context, run, node.id, reviewed.verdict)
  await context.journal.append('step.recorded', {
    step: node.id, visit, attempt: 1, ...fields,
    durationMs: context.deps.clock.now().getTime() - started.getTime(),
    cost: reviewed.costUsd,
  })
  context.deps.progress.log(`${context.slug}: ${node.id} ${fields.outcome === 'blocked' ? `blocked (${fields.code})` : fields.reason}`)
  for (const line of detailLines(reviewed)) context.deps.progress.log(line)
}

/**
 * What a human reads under a review's verdict: each refuted finding and each note, then where
 * the verdict file is; nothing when every finding counted or none was given.
 * @param {{ verdict: import('../../domain/review/verdict.mjs').ReviewVerdict, file: string }} reviewed
 */
const detailLines = ({ verdict, file }) => (verdict.details.length === 0 ? [] : [...verdict.details.map((line) => `  ${line}`), `  details: ${file}`])

/**
 * A lens that answered inconclusive, or failed naming nothing to fix, blocks the node for good,
 * as the breaker does for an agent: a new run of the same slug stays blocked.
 * @param {import('../../domain/review/verdict.mjs').ReviewVerdict} verdict
 */
const blockedReview = ({ code, summary }) => ({ outcome: 'blocked', code, failures: [], next: null, reason: summary })

/**
 * @param {Context} context @param {RunState} run @param {string} from
 * @param {import('../../domain/review/verdict.mjs').ReviewVerdict} verdict
 */
const recordedFieldsOf = (context, run, from, { status, reasons, summary }) => {
  const routed = leave(context, run, from, status, reasons)
  return { outcome: status === 'APPROVED' ? 'approved' : 'needs-rework', code: routed.code ?? null, failures: reasons, next: routed.next, reason: routed.reason ?? summary }
}

/**
 * A locked gate the repository's workflow unlocked: journaled with its reason, then passed.
 * @param {Context} context @param {RunState} run @param {SkipStep} next
 * @returns {Promise<null>}
 */
const skip = async (context, run, { phase, node, visit, resumed }) => {
  const { deps, slug, journal } = context
  const reason = /** @type {string} */ (node.unlock)
  if (!resumed) await journal.append('step.started', { step: node.id, phase, gates: node.gates, visit, attempt: 1 })
  const routed = leave(context, run, node.id, 'PASS', [])
  await journal.append('step.recorded', { step: node.id, visit, attempt: 1, outcome: 'skipped', code: routed.code ?? null, failures: [], next: routed.next, reason: routed.reason ?? `unlocked: ${reason}`, durationMs: 0 })
  deps.progress.log(`${slug}: ${node.id} skipped, unlocked: ${reason}`)
  return null
}

/**
 * The host or the machine stopped the run: the step stays open, and the next run picks it up.
 * @param {Context} context @param {string} phase @param {string} code @param {string} reason
 * @returns {Promise<RunOutcome>}
 */
const stop = async ({ slug, journal }, phase, code, reason) => {
  await journal.append('run.stopped', { code, reason })
  return { status: 'blocked', slug, phase, code, reason }
}
