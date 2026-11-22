import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { DEFAULT_ATTEMPTS, causeFields, nextStep } from '../../domain/pipeline/next-step.mjs'
import { composeBrief, dispatchLabel } from '../../domain/pipeline/dispatch-brief.mjs'
import { dayOf, isFilled, outputPath, templateName } from '../../domain/pipeline/outputs.mjs'
import { isDocument, writtenDocuments } from '../../domain/pipeline/documents.mjs'
import { callsOf, callsPath } from '../../domain/pipeline/precheck-calls.mjs'
import { SCAN_FILE } from '../../domain/pipeline/structural-scan.mjs'
import { allowedPaths, checklistsOf, delivers, makesCommits, roleFolders, roleOf, writesScenarios } from '../../domain/pipeline/roles.mjs'
import { writesComponentTests } from '../../domain/pipeline/component-skills.mjs'
import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'
import { RUN_REPORT_FILE, renderRunReport, runReport } from '../../domain/reporting/run-report.mjs'
import { assignmentsText, modelText, onHost } from '../../domain/reporting/agent-models.mjs'
import { QA_REPORT_FILE, renderQaReport } from '../../domain/reporting/qa-report.mjs'
import { statusLine } from '../../domain/reporting/run-status.mjs'
import { renderWorkflowView, WORKFLOW_FILE } from '../../domain/reporting/workflow-view.mjs'
import { openActiveRun } from './active-run.mjs'
import { holdRun, LockLost, writingWhileHeld } from './run-lock.mjs'
import { gatesOf } from '../../domain/evidence/gate-names.mjs'
import { baseOf, loadConfig } from '../config/bases.mjs'
import { assignmentOf, modelOf, reviewAssignmentsOf } from '../config/agent-models.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { policyLines } from '../../domain/config/infrastructure-policy.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'
import { runReview } from '../review/review-runs.mjs'
import { boundInputs } from './review-inputs.mjs'
import { leave } from './run-routes.mjs'
import { answerOrWait, askStep, blockQuestion, escalate, refusalLines, settleEnvironment, settleUnforeseen } from './run-questions.mjs'
import { confirmConfiguration } from './configuration-question.mjs'
import { cannotStart } from './initialised.mjs'
import { publishStep } from './publish-step.mjs'
import { reportProgress } from '../publish/issue-progress.mjs'
import { storyLanguage } from '../publish/story-language.mjs'
import { checkStep, engineHashes, headsOf } from './step-checks.mjs'
import { runsFolder } from '../../domain/evidence/run-trace.mjs'
import { acceptanceFiles, scenarioPassOf } from './scenario-checks.mjs'
import { commitForAgent } from './agent-commits.mjs'
import { writeStructuralScan } from './structural-scan.mjs'
import { findComponentSkills } from './component-skills.mjs'
import { proposedAdrs } from '../decisions/adr-ratification.mjs'
import { failureSignatureInput, REPEATED_FAILURES, signatureOccurrences } from '../../domain/pipeline/failure-signature.mjs'
import { ownerOfCause } from '../../domain/pipeline/incidents.mjs'

/**
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('../journal/run-journal.mjs').OpenJournal} OpenJournal
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/pipeline/next-step.mjs').WorkStep} WorkStep
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
 *   workflowSource: import('../ports/workflow-source.mjs').WorkflowSource,
 *   agentCatalog: import('../ports/agent-catalog.mjs').AgentCatalog,
 *   forges: import('../config/forge.mjs').ForgeDeps['forges'],
 *   runLock: import('../ports/run-lock.mjs').RunLock,
 *   timer: import('../ports/timer.mjs').Timer,
 * }} PipelineDeps
 * @typedef {{
 *   deps: PipelineDeps, slug: string, journal: OpenJournal, config: SkraftConfig,
 *   loaded: Extract<import('../workflow/load-workflow.mjs').WorkflowLoading, { ok: true }>,
 *   confirm: import('./configuration-question.mjs').Confirm,
 * }} Context
 *   confirm: whether the driver asks a person to confirm the configuration before anything starts.
 * @typedef {{ slug: string, journal: OpenJournal, confirm: import('./configuration-question.mjs').Confirm }} OpenedRun
 */

/**
 * RunPipeline — runs the active pipeline along its workflow until it reaches the exit, is
 * blocked, or the host or the machine stops it. Every fact goes to the journal before the
 * next step is decided from it.
 * @param {PipelineDeps} deps
 */
export const createRunPipeline = (deps) => Object.freeze({
  /**
   * @param {{ slug?: string | null, handedBack?: boolean, confirmConfiguration?: 'once' | 'always' }} [request] handedBack: the run takes back
   *   the agents it handed over (`skraft record`), and the lease it left with them; confirmConfiguration:
   *   a person confirms the configuration before anything starts, once per working copy or at each start
   * @returns {Promise<RunOutcome>}
   */
  run: async ({ slug: requested, handedBack = false, confirmConfiguration = null } = {}) => runActive(deps, { requested, handedBack, confirm: confirmConfiguration }),
})

/**
 * Opens the active run and runs it while this session holds its lease.
 * @param {PipelineDeps} deps
 * @param {{ requested: string | null | undefined, handedBack: boolean, confirm: import('./configuration-question.mjs').Confirm }} request
 * @returns {Promise<RunOutcome>}
 */
const runActive = async (deps, { requested, handedBack, confirm }) => {
  const opened = await openActiveRun(deps, requested)
  if (!opened.ok) return opened.outcome
  const lock = await holdRun(deps, opened.slug, { handedBack })
  if (!lock.ok) return lock.outcome
  return runHeld(deps, { slug: opened.slug, journal: writingWhileHeld(opened.journal, lock.held, opened.slug, deps.progress), confirm }, { held: lock.held, handedBack })
}

/**
 * The run, then the lease ended; a run whose agents were handed over leaves it for them: the
 * lease renewed for them no longer holds what the release would remove.
 * @param {PipelineDeps} deps @param {OpenedRun} opened
 * @param {{ held: import('./run-lock.mjs').HeldRun, handedBack: boolean }} lease
 * @returns {Promise<RunOutcome>}
 */
const runHeld = async (deps, opened, { held, handedBack }) => {
  try {
    await tellHeld(deps, held, handedBack)
    return await runOpened(deps, opened)
  } catch (error) {
    await leftForAgents(deps, held, error)
    throw error
  } finally {
    await held.release()
  }
}

/**
 * Tells the agent runner the run holds its lease. A take-back whose runner fails then (the loop
 * cannot mark its agents taken) leaves the lease as a hand-over again, for a retry to take back.
 * @param {PipelineDeps} deps @param {import('./run-lock.mjs').HeldRun} held @param {boolean} handedBack
 */
const tellHeld = async (deps, held, handedBack) => {
  try {
    await deps.agentRunner.held?.()
  } catch (error) {
    if (handedBack) await held.handOver(1)
    throw error
  }
}

/**
 * When the error is the agent runner's hand-over, the lease is left for its agents.
 * @param {PipelineDeps} deps @param {import('./run-lock.mjs').HeldRun} held @param {unknown} error
 */
const leftForAgents = async (deps, held, error) => {
  const agents = deps.agentRunner.handedOver?.(error) ?? null
  if (agents !== null) await held.handOver(agents)
}

/**
 * Loads the run's configuration and its workflow, then runs it.
 * @param {PipelineDeps} deps @param {OpenedRun} opened
 * @returns {Promise<RunOutcome>}
 */
const runOpened = async (deps, { slug, journal, confirm }) => {
  const config = await loadConfig(deps)
  if (!config.ok) return blockedBeforeStart(slug, 'config-invalid', config.reason)
  const loaded = await loadWorkflow(deps, {})
  if (!loaded.ok) return blockedBeforeStart(slug, 'workflow-invalid', loaded.reason)
  return runGuarded({ deps, slug, journal, config: config.config, loaded, confirm })
}

/**
 * A journal another writer changed under the run, or a lease another session took, blocks it.
 * @param {Context} context @returns {Promise<RunOutcome>}
 */
const runGuarded = async (context) => {
  try {
    return await confirmedThenRun(context)
  } catch (error) {
    if (error instanceof LockLost) return blockedBeforeStart(context.slug, 'lock-lost', error.message)
    if (!(error instanceof JournalConflict)) throw error
    return blockedBeforeStart(context.slug, 'journal-changed', error.message)
  }
}

/** @param {string} slug @param {string} code @param {string} reason @returns {RunOutcome} */
const blockedBeforeStart = (slug, code, reason) => ({ status: 'blocked', slug, phase: null, code, reason })

/**
 * Nothing starts before a person the driver asks confirms the configuration, and nothing starts on
 * one `/skraft-init` has not settled. The confirmation comes first: it is where the person fixes
 * the configuration, so the run reads it as they leave it.
 * @param {Context} context @returns {Promise<RunOutcome>}
 */
const confirmedThenRun = async (context) => (await confirmConfiguration(context, deriveRun(context.journal.events), context.confirm))
  ?? (await cannotStart(context))
  ?? perGroupJournal(context)
  ?? runFrom(context)

/**
 * A journal an engine that delivered one group per pass wrote, stopped between two groups, is not
 * resumed: this engine delivers every group in one pass, and such a story starts again.
 * @param {Context} context @returns {RunOutcome | null}
 */
const perGroupJournal = ({ slug, journal }) => {
  const { scenarios } = deriveRun(journal.events)
  const partial = scenarios !== null && scenarios.delivered > 0 && scenarios.delivered < scenarios.groups.length
  return partial ? blockedBeforeStart(slug, 'delivery-shape', 'this run was started by an engine that delivered one group per pass; start the story again') : null
}

/** @param {Context} context @returns {Promise<RunOutcome>} */
const runFrom = async (context) => {
  /** @type {string | null} */
  let shown = null
  for (;;) {
    const run = deriveRun(context.journal.events)
    const next = nextStep(context.loaded.workflow, run)
    const outcome = await take(context, shown, run, next)
    await writeReports(context)
    await tellIssue(context)
    if (outcome) return outcome
    shown = next.phase
  }
}

/**
 * run-report.md, qa-report.md and WORKFLOW.md, written again from the journal after each step.
 * @param {Context} context
 */
const writeReports = async ({ deps, slug, journal, loaded }) => {
  const run = deriveRun(journal.events)
  const status = statusLine(run)
  await deps.files.write(slug, RUN_REPORT_FILE, renderRunReport({ slug, status, report: runReport(journal.events) }))
  await deps.files.write(slug, QA_REPORT_FILE, renderQaReport({ slug, status, events: journal.events }))
  await deps.files.write(slug, WORKFLOW_FILE, renderWorkflowView({ slug, workflow: loaded.workflow, run }))
}

/**
 * One step of the run: its end, a phase to close, or a node to work.
 * @param {Context} context @param {string | null} shown the phase the developer was last shown
 * @param {RunState} run @param {import('../../domain/pipeline/next-step.mjs').NextStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const take = (context, shown, run, next) => {
  if (run.question?.kind === 'unforeseen') return settleUnforeseen(context, run, run.question)
  if (run.question?.kind === 'environment') return settleEnvironment(context, run, run.question)
  if (next.kind === 'done') return finish(context, run, next)
  if (next.kind === 'blocked') return block(context, run, next)
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

/**
 * A block a human can lift asks them first and waits for the answer; STOP, or a block no
 * instruction lifts, ends the run.
 * @param {Context} context @param {RunState} run @param {BlockedStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const block = async (context, run, next) => {
  const asked = await blockQuestion(context, run, next)
  if (asked === null || asked.answer !== null) return finishBlocked(context, run, next)
  return answerOrWait(context, asked, next.phase)
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

/**
 * The transitions the story's issue was not told yet, kept on it, right after the step that
 * journaled them.
 * @param {Context} context
 */
const tellIssue = ({ deps, slug, journal, config, loaded }) => reportProgress(deps, { slug, journal, config, workflow: loaded.workflow })

/** @param {Context} context @param {string | null} shown @param {string} phase */
const showPhase = ({ deps }, shown, phase) => {
  if (shown !== phase) deps.progress.phase(phase)
}

/**
 * @param {Context} context @param {RunState} run @param {WorkStep | SkipStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const work = (context, run, next) => {
  if (next.kind === 'review' || next.kind === 'call') return review(context, run, next)
  if (next.kind === 'ask') return askStep(context, run, next)
  if (next.kind === 'publish') return publishStep(context, run, next)
  return noScenarioComponent(context, next) ?? dispatch(context, run, next)
}

/**
 * The node that writes the story's scenarios and the one that delivers them stop the run when
 * the configuration lists no component to write them in; null when it lists one, or for any other node.
 * @param {Context} context @param {WorkStep} next
 * @returns {Promise<RunOutcome> | null}
 */
const noScenarioComponent = (context, { node, phase }) => ((writesScenarios(node) || delivers(node)) && context.config.components.length === 0
  ? stop(context, phase, 'no-components', `${CONFIG_FILE} lists no component, so ${node.id} has no component to write the story's scenarios in; run skraft init to detect them`)
  : null)

/**
 * @param {Context} context
 * @param {BlockedStep} next
 * @returns {{ code: string, reason: string }}
 */
const blockedBy = (context, next) => {
  if (next.cause === 'node-retired') return { code: 'node-retired', reason: `the node ${next.missingNode} was retired: skraft runs no gate and no mutation any more. The software engineer runs the gates through skraft_repl, and the DELIVER review reads the traced runs of its attempt; start the story again with the plugin's workflow` }
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
  if (event.code === 'repeated-failure' || event.code === 'unknown-failure') return { code: event.code, reason: event.reason }
  const details = refusalLines(context, event).join('; ')
  return cause === 'breaker'
    ? { code: event.code, reason: `${agent} failed the same way on attempts ${/** @type {{ attempt: number }} */ (previous).attempt} and ${event.attempt}: ${details}` }
    : { code: event.code, reason: `${agent} still failed after ${event.attempt} attempts: ${details}` }
}

/**
 * @typedef {{
 *   agent: string, role: ReturnType<typeof roleOf>, outputs: string[], result: string,
 *   precreated: (string | null)[], scan: string | null, skills: import('./component-skills.mjs').FoundSkills, drafts: string[],
 *   assignment: import('../../domain/config/model-assignment.mjs').ResolvedAssignment,
 *   language: import('../../domain/reporting/language.mjs').Language, checklists: string[],
 * }} Job
 *   what an attempt of an agent node is asked to write, the templates it starts from, and the
 *   structural scan the engine wrote for it to read, and the skills of its components: the SKILL.md files it reads first, those found nowhere;
 *   assignment: what it runs on, the one its open attempt journaled on a resume; drafts: the Proposed ADRs an agent keeping the DESIGN records rewrites in place;
 *   language: the story's, which its templates are in and the prose of the pull request is written in;
 *   checklists: the SKILL.md files whose gates the review of its phase judges its outputs by, those found.
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
  const { heads, engine } = await openAttempt(context, run, next, job)
  context.deps.progress.log(`${context.slug}: ${job.agent}${passOf(next.visit)}, attempt ${next.attempt} — ${modelText(onHost(job.assignment, context.deps.agentRunner.host))}`)
  const started = context.deps.clock.now()
  const asked = await runAgent(context, run, next, job)
  if (asked.outcome !== null || asked.asked) return asked.outcome
  return judgeAttempt(context, run, next, { job, heads, engine, started, cost: asked.cost, model: asked.model })
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
  const { node, visit, attempt } = next
  const agent = /** @type {string} */ (node.agent)
  const role = roleOf(node)
  const date = dayOf(deps.clock.now())
  const language = await storyLanguage(deps, slug, run)
  const { outputs, precreated } = await outputsOf(context, run, next, { role, language })
  const result = `results/${node.id}-${visit}-${attempt}.json`
  const scan = role.scan ? await writeStructuralScan(deps, { slug, path: outputPath(SCAN_FILE, { date, slug }), components: config.components }) : null
  return { agent, role, outputs, result, precreated, scan, skills: await skillsOf(deps, role, config.components), drafts: await draftsOf(deps, role), assignment: phaseAssignment(context, next), language, checklists: await checklistsFound(deps, agent) }
}

/**
 * The outputs of an attempt and what the engine writes in each before it: kept from the node's
 * first attempt, with their templates in the story's language.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {Pick<Job, 'role' | 'language'>} job
 * @returns {Promise<Pick<Job, 'outputs' | 'precreated'>>}
 */
const outputsOf = async ({ deps, slug }, run, next, { role, language }) => {
  const date = dayOf(deps.clock.now())
  return {
    outputs: run.nodes[next.node.id]?.outputs ?? role.outputs.map((output) => outputPath(output.path, { date, slug })),
    precreated: await Promise.all(role.outputs.map((output) => (output.template ? deps.templates.read(templateName(output.template, language)) : null))),
  }
}

/**
 * The Proposed ADRs of the working copy, for an agent that keeps the DESIGN records; none when
 * the ADR folder cannot be listed: checking the attempt asks a human to fix that.
 * @param {PipelineDeps} deps @param {Job['role']} role
 * @returns {Promise<string[]>}
 */
const draftsOf = async (deps, role) => {
  const adrs = role.records ? await proposedAdrs(deps) : []
  return typeof adrs === 'string' ? [] : adrs
}

/**
 * The SKILL.md files whose gates the review of the agent's phase judges its outputs by, those the
 * plugin or the working copy provides.
 * @param {PipelineDeps} deps @param {string} agent
 */
const checklistsFound = async ({ agentCatalog }, agent) => (await Promise.all(checklistsOf(agent).map((name) => agentCatalog.skill(name)))).flatMap((file) => (file === null ? [] : [file.path]))

/**
 * The skills of the components, for an agent that writes tests against their code; the agent
 * loads its own skills by name.
 * @param {PipelineDeps} deps @param {Job['role']} role
 * @param {import('../../domain/config/skraft-config.mjs').Component[]} components
 */
const skillsOf = ({ agentCatalog }, role, components) => findComponentSkills(agentCatalog, writesComponentTests(role) ? components : [])

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
 * Opens the attempt in the journal, with its outputs pre-created, unless a resumed attempt is
 * already open; returns the heads the attempt started from and the engine files as it found them.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job
 */
const openAttempt = async (context, run, next, job) => {
  if (next.resumed?.heads) return { heads: next.resumed.heads, engine: await engineAsFound(context, run, next) }
  await prepareAttempt(context, run, next, job)
  const heads = await headsOf(context.deps, run.base)
  const engine = await engineAsFound(context, run, next)
  const { phase, node, visit, attempt, missing, feedback } = next
  const { agent, outputs, result, assignment } = job
  await context.journal.append('step.started', { step: node.id, phase, agent, visit, attempt, outputs, result, missing, feedback, ...causeFields(next), heads, engine, assignment, host: context.deps.agentRunner.host })
  return { heads, engine }
}

/**
 * Clears the temporary files, creates the role's folders and pre-creates the outputs, then takes
 * the snapshot of the documents the attempt starts from.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job
 */
const prepareAttempt = async (context, run, next, job) => {
  await context.deps.files.clearTemporary(context.slug)
  await createRoleFolders(context, run, next.node)
  await precreate(context, job)
  await context.deps.files.write(context.slug, snapshotOf(job.result), JSON.stringify(await documentHashes(context)))
}

/**
 * What the engine files looked like when the attempt began: as the previous attempt of the visit
 * found them when it was refused for changing one and no one resumed the run since, so that a
 * change the agent left stays refused; else as they stand now, a person's change before this
 * attempt or before the run resumed not being the agent's.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 */
const engineAsFound = async ({ deps, journal }, run, next) => {
  const now = await engineHashes(deps)
  const started = refusedForEngine(run, next) ? lastStarted(journal, next.node.id) : undefined
  return started?.engine ?? now
}

/**
 * Whether the previous attempt of the visit was refused for changing an engine file, the run not
 * resumed since. @param {RunState} run @param {WorkStep} next
 */
const refusedForEngine = (run, { node, resumed, attempt }) =>
  !resumed && attempt > 1 && Boolean(run.nodes[node.id]?.last?.failures?.some((/** @type {string} */ line) => ENGINE_REFUSALS.has(line)))

/** The last step.started of a step. @param {OpenJournal} journal @param {string} step */
const lastStarted = (journal, step) => journal.events.findLast((/** @type {import('../../domain/journal/run-state.mjs').RunEvent} */ event) => event.type === 'step.started' && event.step === step)

/** The refusals of an engine file. */
const ENGINE_REFUSALS = new Set([`out of write scope: ${CONFIG_FILE}`])

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
 * What the attempt leaves in the tracking folder: the documents it wrote, and the pre-checks it
 * ran inside it, read from the trail each call appends to; no `prechecks` when it ran none.
 * @param {Context} context @param {Job} job @param {{ step: string, visit: number, attempt: number }} of
 */
const attemptFiles = async (context, job, of) => {
  const prechecks = callsOf(await context.deps.files.read(context.slug, callsPath(of.step)), of)
  return { documents: await documentsWritten(context, job), ...(prechecks.length === 0 ? {} : { prechecks }) }
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

/**
 * Creates each folder of the node's role that the working copy does not have yet, with an empty
 * `.gitkeep` so that git keeps it, and commits them alone before the attempt takes its heads: the
 * working copy stays clean whatever the agent's tools, and the folders reach the review and the
 * pull request as the engine's commit, never as the agent's changes. DESIGN on a fresh repository
 * writes its first ADR, event model and context map there. A folder the machine cannot list is
 * left to the checks that ask a human. A commit Git refuses leaves the files uncommitted, dirty
 * before the attempt, so never held against the agent.
 * @param {Context} context @param {RunState} run @param {WorkStep['node']} node
 */
const createRoleFolders = async ({ deps, config }, run, node) => {
  const created = await missingFolders(deps, roleFolders(node, config.components))
  if (created.length === 0) return
  await deps.sourceControl.commitFiles('.', created, engineMessage(`chore: create the folders ${node.agent} writes in`, issueOf(run.story)))
}

/**
 * Writes an empty `.gitkeep` in each folder the working copy does not have; returns those files.
 * @param {PipelineDeps} deps @param {readonly string[]} folders @returns {Promise<string[]>}
 */
const missingFolders = async ({ workspace }, folders) => {
  const created = []
  for (const folder of folders) {
    if (!(await isMissing(workspace, folder))) continue
    await workspace.write(`${folder}/.gitkeep`, '')
    created.push(`${folder}/.gitkeep`)
  }
  return created
}

/**
 * Whether the working copy lacks the folder; a folder the machine cannot list is not known to be missing.
 * @param {PipelineDeps['workspace']} workspace @param {string} folder
 */
const isMissing = (workspace, folder) => workspace.list(folder).then(
  (entries) => entries === null,
  // Stryker disable next-line ArrowFunction: undefined skips the folder as false does
  () => false,
)

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
 * The agent's answer: the run stops when the host could not start the agent (a host loads a
 * plugin's agents when its session starts, so no retry in this session finds it), or when a person
 * stopped it with its work not done; an agent that stopped by itself with its work not done is an
 * unforeseen incident, whose recovery the run asks for.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job
 * @returns {Promise<{ outcome: RunOutcome | null, asked?: boolean, cost?: number, model?: string | null }>}
 */
const askAgent = async (context, run, next, job) => {
  const { agent } = job
  const answer = await context.deps.agentRunner.run(agentCall(context, run, next, job))
  if (answer.unavailable) return { outcome: await stop(context, next.phase, 'agent-unavailable', answer.error ?? `${agent} could not be started`) }
  const unfinished = !answer.ok && (await pending(context, job))
  if (unfinished) return unfinishedAgent(context, next, `${agent} stopped without finishing: ${answer.error ?? 'no answer'}`, answer)
  return { outcome: null, cost: answer.costUsd, model: answer.model ?? null }
}

/**
 * A person who stopped the agent stops the run; an agent that stopped by itself is an incident
 * of unknown cause, asked about with its signature.
 * @param {Context} context @param {WorkStep} next @param {string} reason
 * @param {{ interrupted?: boolean }} answer
 */
const unfinishedAgent = async (context, next, reason, { interrupted }) => {
  if (interrupted) return { outcome: await stop(context, next.phase, 'agent-failed', reason) }
  return { outcome: await askRecovery(context, next, { category: 'agent-failed', reason }), asked: true }
}

/**
 * Asks how to recover from a failure of unknown cause: its reason goes to a log the question
 * names, with the failure's signature and how often the run met it.
 * @param {Context} context @param {WorkStep} next @param {{ category: string, reason: string }} failure
 */
const askRecovery = async (context, next, { category, reason }) => {
  const { deps, slug, journal } = context
  const signature = await deps.hasher.sha256(failureSignatureInput({ step: next.node.id, cause: category, proof: reason, root: repositoryRoot(deps.files, slug), slug }))
  const log = await incidentLog(context, `logs/incident-${next.node.id}-${signature.slice(0, 7)}.log`, reason)
  const incident = { category, owner: /** @type {const} */ ('unknown'), argv: [], exitCode: null, attempts: signatureOccurrences(journal.events, signature) + 1, signature, log }
  return escalate(context, next, reason, { owner: 'unknown', log }, [incident])
}

/** Writes the reason of an incident where its question points. @param {Context} context @param {string} path @param {string} reason */
const incidentLog = async ({ deps, slug }, path, reason) => {
  await deps.files.write(slug, path, `${reason}\n`)
  return deps.files.location(slug, path)
}

/** @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job */
const agentCall = (context, run, next, job) => ({
  agent: job.agent,
  source: context.loaded.sources[job.agent],
  label: dispatchLabel({ slug: context.slug, step: next.node.id, visit: next.visit, attempt: next.attempt }),
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
  ...briefFeedback(next),
  ...briefRole(next, job),
  ...briefScenarioOf(context, run, next),
})

/**
 * The scenario a pass works on, and for a pass that writes acceptance tests the infrastructure
 * policy of every component.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 */
const briefScenarioOf = (context, run, next) => {
  const scenario = briefScenario(context, run, next)
  return { scenario, policy: scenario?.kind === 'plan' ? context.config.components.flatMap(policyLines) : [] }
}

/**
 * The scenarios a pass works on as the brief tells them: on the plan's pass where it sends the
 * output of its run of the acceptance tests, on a delivery pass every group with the test command
 * the story's commit chains to, and the reds whose files no later pass changes; null for a pass on none.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @returns {import('../../domain/pipeline/dispatch-brief.mjs').BriefScenario | null}
 */
const briefScenario = ({ config, deps, slug }, run, { node, visit }) => {
  const pass = scenarioPassOf(run, node)
  if (pass === null) return null
  const groups = pass.groups.map((group) => briefGroup(group, { of: pass.groups.length, test: scenarioTest(config, run, group.scenarios[0]?.component ?? null) }))
  const oracles = pass.kind === 'plan' ? [] : pass.reds.map((red) => oracleTold(red, config.components))
  return { kind: pass.kind, groups, oracles, skeleton: pass.skeleton !== null, redRun: pass.kind === 'plan' }
}

/** @param {import('./scenario-checks.mjs').PassGroup} group @param {{ of: number, test: string | null }} told */
const briefGroup = ({ index, scenarios }, { of, test }) => ({
  index, of, test,
  scenarios: scenarios.map(({ index: number, title, component, tags }) => ({ index: number, title, component, tags })),
})

/**
 * A red of an acceptance test as the engineer is told it: the files it never changes.
 * @param {import('../../domain/journal/run-state.mjs').Oracle} oracle @param {import('../../domain/config/skraft-config.mjs').Component[]} components
 */
const oracleTold = (oracle, components) => ({ sha: oracle.sha, subject: oracle.subject, files: acceptanceFiles(oracle, components) })

/**
 * The test command of the scenario's component, the run's base in place of `{baseSha}`; null for a
 * scenario not listed yet.
 * @param {import('../../domain/config/skraft-config.mjs').SkraftConfig} config @param {RunState} run @param {string | null} name
 */
const scenarioTest = (config, run, name) => {
  const component = config.components.find((candidate) => candidate.name === name)
  return component === undefined ? null : testLine(component.commands.test, baseOf(run.base, component.name)?.sha)
}

/** What the agent is told sent it there: the failures, a human's instruction, the kind of node. @param {WorkStep} next */
const briefFeedback = ({ feedback, instruction, sentBy }) => ({ feedback, instruction, sentBy })

/**
 * The Proposed ADRs it rewrites, the language an agent writing the pull request's prose writes in, and
 * the gates it checks its outputs against.
 * @param {WorkStep} next @param {Job} job
 */
const briefRole = (_next, { role, drafts, language, checklists }) => ({
  drafts,
  language: role.prose ? language : null,
  checklists,
})

/** @param {Context} context @param {RunState} run @param {WorkStep} next @param {Job} job */
const briefPaths = ({ deps, slug, config }, run, next, { role, outputs, result, scan, skills }) => {
  const at = (/** @type {string} */ path) => deps.files.location(slug, path)
  return {
    skills: skills.paths,
    nowhere: skills.nowhere,
    inputs: [...inputsOf(run, next.node.id), ...(scan === null ? [] : [scan])].map(at),
    outputs: outputs.map(at),
    result: at(result),
    scratch: { logs: at('logs/'), tmp: at('.tmp/') },
    allowed: allowedPaths(role, { slug, folder: deps.files.folder, components: config.components }),
  }
}

/** What the other nodes and the story left for an agent to read. @param {RunState} run @param {string} id */
const inputsOf = (run, id) => [...run.artifacts, ...Object.entries(run.nodes).filter(([other]) => other !== id).flatMap(([, state]) => state.outputs)]

/**
 * The components an agent that writes code works in, and how it drives its tests.
 * @param {Context} context @param {RunState} run @param {Job['role']} role
 */
const briefStack = ({ config }, run, role) => ({
  components: (role.components.length > 0 ? config.components : []).map((component) => briefComponent(component, baseOf(run.base, component.name)?.sha)),
  tdd: role.tdd,
  commits: makesCommits(role),
})

/**
 * A component as the brief tells it: its test command and its gate commands, in the order a developer runs them, each with the run's base in place of `{baseSha}`.
 * @param {import('../../domain/config/skraft-config.mjs').Component} component @param {string | undefined} sha
 * @returns {import('../../domain/pipeline/dispatch-brief.mjs').BriefComponent}
 */
const briefComponent = (component, sha) => {
  const { name, root, stack, mocking, contractTesting, bddPaths, commands } = component
  const gates = gatesOf(component).map((gate) => ({ gate, line: withBase(commands[gate], sha) }))
  return { name, root, stack, mocking: mocking.strategy, contractTesting, bdd: bddPaths, test: testLine(commands.test, sha), gates }
}

/**
 * Checks what the attempt did and records it, unless the machine stopped it.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ job: Job, heads: any, engine: Array<{ path: string, hash: string | null }>, started: Date, cost?: number, model?: string | null }} attempt
 * @returns {Promise<RunOutcome | null>}
 */
const judgeAttempt = async (context, run, next, attempt) => {
  const checked = await checkAttempt(context, run, next, attempt)
  if (checked.commits.length > 0) await context.journal.append('commits.checked', { step: next.node.id, visit: next.visit, attempt: next.attempt, commits: checked.commits })
  if (checked.environment !== null) return escalate(context, next, checked.environment)
  await keepEvidence(context, next, checked)
  const committed = await commitDone(context, run, next, checked)
  if (committed !== null && 'environment' in committed) return escalate(context, next, committed.environment, committed.incident, committed.incidents)
  await recordAttempt(context, run, next, { ...attempt, checked, committed })
  return null
}

/**
 * The runs a delivering attempt traced, journaled by id and hash for the DELIVER review and the run view.
 * @param {Context} context @param {WorkStep} next @param {Extract<Awaited<ReturnType<typeof checkStep>>, { environment: null }>} checked
 */
const keepEvidence = async ({ journal }, { node, visit, attempt }, checked) => {
  if (checked.evidence === undefined || checked.evidence === null || failedCheck(checked)) return
  await journal.append('evidence.checked', { step: node.id, visit, attempt, ...(checked.red === true ? { red: true } : {}), runs: checked.evidence })
}

/**
 * The engine's commit of what a done attempt of an agent with no shell changed in its scope.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {Extract<Awaited<ReturnType<typeof checkStep>>, { environment: null }>} checked
 */
const commitDone = ({ deps, slug, journal }, run, next, checked) => (failedCheck(checked)
  ? null
  : commitForAgent({ ...deps, journal }, { slug, step: next.node.id, story: run.story }, /** @type {import('./step-checks.mjs').UncommittedFile[]} */ (checked.uncommitted)))

/** @param {{ missing: string[], failures: string[] }} checked */
const failedCheck = ({ missing, failures }) => missing.length > 0 || failures.length > 0

/**
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ job: Job, heads: any, engine: Array<{ path: string, hash: string | null }> }} attempt
 */
const checkAttempt = ({ deps, slug, config, journal }, run, { node, visit, attempt }, { job, heads, engine }) => {
  const inState = attempt > 1
  const scenario = scenarioPassOf(run, node)
  const { role, outputs, precreated, result } = job
  return checkStep({ deps, slug, config, base: run.base, story: run.story }, {
    role, outputs, precreated, result, scenario,
    visitHeads: inState ? run.nodes[node.id].heads : heads,
    ...whatTheAttemptLeft(journal, { run, scenario, engine }, { node, visit, attempt }),
  })
}

/**
 * What the checks read besides the working copy: the commits earlier visits carried, the engine files as the attempt
 * found them, and where its runs are traced.
 * @param {{ events: any[] }} journal @param {{ run: RunState, scenario: any, engine: Array<{ path: string, hash: string | null }> }} state @param {Pick<WorkStep, 'node' | 'visit' | 'attempt'>} at
 */
const whatTheAttemptLeft = ({ events }, { run, scenario, engine }, { node, visit, attempt }) => ({
  carried: carriedOf(scenario, run.nodes[node.id], { events, step: node.id, visit }),
  engineBefore: engine,
  evidence: { folder: runsFolder(node.id, visit, attempt), events },
})

/**
 * Records the attempt: refused, or done with the node it leads to.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ job: Job, started: Date, cost?: number, model?: string | null, checked: Awaited<ReturnType<typeof checkStep>>, committed: import('./agent-commits.mjs').EngineCommit | null }} attempt
 *   committed: the engine's commit of what an agent with no shell changed, journaled with the step
 */
const recordAttempt = async (context, run, next, attempt) => context.journal.append(
  'step.recorded', await attemptRecord(context, run, next, attempt),
)

/** @param {Context} context @param {RunState} run @param {WorkStep} next @param {Parameters<typeof recordAttempt>[3]} attempt */
const attemptRecord = async (context, run, { node, visit, attempt }, { job, started, cost, model, checked, committed }) => {
  const failed = failedCheck(checked)
  const incidents = failed ? await attemptIncidents(context, node.id, checked) : []
  const routed = failed ? repeatedAttemptRoute(node.id, incidents) : leave(context, run, node.id, null, [])
  return {
    step: node.id, visit, attempt, ...await attemptFiles(context, job, { step: node.id, visit, attempt }),
    outcome: failed ? 'failed' : 'done', code: attemptCode(failed, checked, routed),
    missing: checked.missing, failures: checked.failures, incidents,
    next: routed.next, ceiling: routed.ceiling, reason: routed.reason, model,
    ...spent(context, started, cost), ...(committed ? { committed } : {}), ...(failed ? {} : checked.scenario),
  }
}

/** @param {boolean} failed @param {{ code: string | null }} checked @param {{ code?: string }} routed */
const attemptCode = (failed, checked, routed) => (failed ? routed.code ?? checked.code : routed.code ?? null)

/** @param {Context} context @param {string} step @param {Extract<Awaited<ReturnType<typeof checkStep>>, { environment: null }>} checked */
const attemptIncidents = async ({ deps, slug, journal }, step, checked) => {
  const signature = await deps.hasher.sha256(failureSignatureInput({
    step, cause: checked.code ?? 'agent', proof: [...checked.missing, ...checked.failures].join('\n'),
    root: repositoryRoot(deps.files, slug), slug,
  }))
  const category = checked.code ?? 'agent'
  return [{ category, owner: ownerOfCause(category), argv: [], exitCode: null, attempts: signatureOccurrences(journal.events, signature) + 1, signature, log: null }]
}

/** @param {string} step @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} incidents */
const repeatedAttemptRoute = (step, incidents) => {
  const unknown = incidents.find(({ owner }) => owner === 'unknown')
  if (unknown) return unknownFailureRoute(step, unknown)
  const repeated = incidents.find(({ attempts }) => attempts >= REPEATED_FAILURES)
  return repeated ? repeatedFailureRoute(step, repeated) : { next: null }
}

/**
 * What a delivery pass of a visit a human reopened after a block counts besides its own commits:
 * the commits the attempts of the visits before made, since the node's first visit. A commit a
 * person made while the run waited is none of them, and is never judged as the engineer's.
 * @param {import('./scenario-checks.mjs').ScenarioPass | null} scenario
 * @param {import('../../domain/journal/run-state.mjs').NodeState | undefined} state
 * @param {{ events: import('../../domain/journal/run-state.mjs').RunEvent[], step: string, visit: number }} at
 * @returns {import('./step-checks.mjs').Carried | null}
 */
const carriedOf = (scenario, state, { events, step, visit }) => {
  if (scenario?.kind !== 'delivery' || state === undefined || visit === 1) return null
  const earlier = events.filter((event) => event.type === 'commits.checked' && event.step === step && event.visit < visit)
  return { heads: state.firstHeads, shas: earlier.flatMap((event) => event.commits.map((/** @type {{ sha: string }} */ commit) => commit.sha)) }
}

/** @param {Context} context @param {Date} started @param {number | undefined} cost */
const spent = ({ deps }, started, cost) => ({
  durationMs: deps.clock.now().getTime() - started.getTime(),
  cost, // undefined when the host reports none: the journal line leaves it out
})

/**
 * A test command as the agent can run it: the base the run diffs against in place of `{baseSha}`.
 * @param {string | undefined} line @param {string | undefined} sha
 */
const testLine = (line, sha) => (line === undefined ? null : withBase(line, sha))

/** A command line with the base the run diffs against in place of `{baseSha}`. @param {string} line @param {string | undefined} sha */
const withBase = (line, sha) => (sha ? line.replaceAll('{baseSha}', sha) : line)

/** @param {import('../ports/tracking-files.mjs').TrackingFiles} files @param {string} slug */
const repositoryRoot = (files, slug) => {
  const path = files.location(slug, 'events.jsonl').replaceAll('\\', '/')
  const suffix = `/${files.folder}/${slug}/events.jsonl`
  return path.endsWith(suffix) ? path.slice(0, -suffix.length) : ''
}

/** @param {string} step @param {{ attempts: number, signature: string, log: string | null }} incident */
const repeatedFailureRoute = (step, incident) => ({
  next: null, code: 'repeated-failure',
  reason: `${step} stopped after ${incident.attempts} occurrences of failure signature ${incident.signature}; evidence: ${incident.log ?? 'unavailable'}`,
})

/** @param {string} step @param {import('../../domain/pipeline/incidents.mjs').FailureIncident} incident */
const unknownFailureRoute = (step, incident) => ({
  next: null, code: 'unknown-failure',
  reason: `${step} stopped: unclassified cause "${incident.category}"; owner unknown; evidence: ${incident.log ?? 'unavailable'}; signature: ${incident.signature}`,
})

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
  if ('stop' in reviewed) return stoppedReview(context, next, reviewed.stop)
  await recordReview(context, run, next, { reviewed, started })
  return null
}

/**
 * A lens that never gave a readable verdict is an unforeseen incident, whose recovery the run
 * asks for; any other stop of the review stops the run.
 * @param {Context} context @param {WorkStep} next @param {{ code: string, reason: string }} stopped
 */
const stoppedReview = async (context, next, { code, reason }) => {
  if (code !== 'lens-unreadable') return stop(context, next.phase, code, reason)
  return askRecovery(context, next, { category: code, reason })
}

/**
 * Opens the review unless the run resumes it; returns what its lenses and its refuter run on,
 * as its step.started journals them.
 * @param {Context} context @param {WorkStep} next
 * @returns {Promise<import('../config/agent-models.mjs').ReviewAssignments>}
 */
const openReview = async ({ deps, slug, journal, config }, next) => {
  const { phase, node, visit, feedback, resumed } = next
  if (!resumed) {
    await deps.files.clearTemporary(slug)
    const { lenses, refuter } = reviewAssignmentsOf(config, node)
    await journal.append('step.started', { step: node.id, phase, lenses: node.lenses, visit, attempt: 1, feedback, ...causeFields(next), assignments: lenses, refuter, host: deps.agentRunner.host })
  }
  const { assignments, refuter } = openStart(journal)
  deps.progress.log(`${slug}: ${node.id} (${node.lenses.join(', ')})${passOf(visit)} — ${assignmentsText(assignments, deps.agentRunner.host)}`)
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
 * A lens that answered inconclusive, or failed naming nothing to fix, blocks the node: nothing
 * goes back to the phase agent, and the run asks a human whether to run the review again.
 * @param {import('../../domain/review/verdict.mjs').ReviewVerdict} verdict
 */
const blockedReview = ({ code, summary }) => ({ outcome: 'blocked', code, failures: [], next: null, reason: summary })

/**
 * @param {Context} context @param {RunState} run @param {string} from
 * @param {import('../../domain/review/verdict.mjs').ReviewVerdict} verdict
 */
const recordedFieldsOf = (context, run, from, { status, reasons, summary, findings }) => {
  const routed = leave(context, run, from, status, reasons)
  return {
    outcome: status === 'APPROVED' ? 'approved' : 'needs-rework', code: routed.code ?? null, failures: reasons, next: routed.next, ceiling: routed.ceiling, reason: routed.reason ?? summary,
    // What a human decides on when the review reaches its ceiling, and what the report lists once accepted: a review that sends work back always has some.
    ...(findings.length > 0 ? { findings } : {}),
  }
}

/**
 * A person interrupted a command the step ran (Ctrl-C): the run stops there, asking nothing and
 * sending nothing back; the next run picks the step up.
 * @param {Context} context @param {string} phase @param {string} reason what was interrupted
 * @returns {Promise<RunOutcome>}
 */
const interrupted = (context, phase, reason) => stop(context, phase, 'interrupted', `${reason}; run the pipeline again to go on`)

/**
 * The host or the machine stopped the run: the step stays open, and the next run picks it up.
 * @param {Context} context @param {string} phase @param {string} code @param {string} reason
 * @returns {Promise<RunOutcome>}
 */
const stop = async ({ slug, journal }, phase, code, reason) => {
  await journal.append('run.stopped', { code, reason })
  return { status: 'blocked', slug, phase, code, reason }
}
