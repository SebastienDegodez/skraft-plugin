import { DEFAULT_PIPELINE } from '../domain/pipeline/pipeline-definition.mjs'
import { nextStep } from '../domain/pipeline/next-step.mjs'
import { deriveRun } from '../domain/journal/run-state.mjs'
import { composeBrief, dispatchLabel } from '../domain/pipeline/dispatch-brief.mjs'
import { dayOf, isFilled, outputPath } from '../domain/pipeline/outputs.mjs'
import { openActiveRun } from './active-run.mjs'

/**
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('./run-journal.mjs').OpenJournal} OpenJournal
 * @typedef {import('../domain/pipeline/next-step.mjs').DispatchStep} DispatchStep
 * @typedef {{
 *   journal: import('./ports/run-journal-store.mjs').RunJournalStore,
 *   activePipeline: import('./ports/active-pipeline.mjs').ActivePipeline,
 *   files: import('./ports/tracking-files.mjs').TrackingFiles,
 *   templates: import('./ports/template-library.mjs').TemplateLibrary,
 *   clock: import('./ports/clock.mjs').Clock,
 *   hasher: import('./ports/hasher.mjs').Hasher,
 *   agentRunner: import('./ports/agent-runner.mjs').AgentRunner,
 *   progress: import('./ports/pipeline-progress.mjs').PipelineProgress,
 * }} PipelineDeps
 */

/**
 * RunPipeline — runs the active pipeline until it is done, blocked, or an agent cannot be
 * started. Every fact goes to the journal before the next step is decided from it.
 * @param {PipelineDeps} deps
 * @param {import('../domain/pipeline/pipeline-definition.mjs').PipelineDefinition} [definition]
 */
export const createRunPipeline = (deps, definition = DEFAULT_PIPELINE) => Object.freeze({
  /** @param {{ slug?: string | null }} [request] @returns {Promise<RunOutcome>} */
  run: async ({ slug: requested } = {}) => {
    const opened = await openActiveRun(deps, requested)
    if (!opened.ok) return opened.outcome
    const { slug, journal } = opened
    let shown = null
    for (;;) {
      const run = deriveRun(journal.events)
      const next = nextStep(definition, run)
      if (next.kind === 'done') {
        const reason = next.phase ? `${next.phase} closed` : 'nothing to run'
        if (!run.finished) await journal.append('run.finished', { status: next.status, reason })
        return { status: 'done', slug, phase: next.phase, code: null, reason }
      }
      if (next.kind === 'blocked') {
        const paths = next.missing.map((path) => deps.files.location(slug, path)).join(', ')
        const reason = `${next.step.agent} left required outputs missing after ${next.step.maxAttempts} attempts: ${paths}`
        if (!run.finished) await journal.append('run.finished', { status: 'blocked', reason })
        return { status: 'blocked', slug, phase: next.phase, code: 'missing-outputs', reason }
      }
      if (next.kind === 'close-phase') {
        await journal.append('phase.closed', { phase: next.phase })
        deps.progress.log(`${slug}: ${next.phase} closed`)
        continue
      }
      if (shown !== next.phase) deps.progress.phase(next.phase)
      shown = next.phase
      const blocked = await dispatch(deps, { slug, story: run.story, journal, next })
      if (blocked) return blocked
    }
  },
})

/**
 * One dispatch: pre-create the outputs, start the agent unless a resumed attempt already
 * left them filled, then record which outputs are missing.
 * @param {PipelineDeps} deps
 * @param {{ slug: string, story: import('./init.mjs').Story, journal: OpenJournal, next: DispatchStep }} context
 * @returns {Promise<RunOutcome | null>}
 */
const dispatch = async (deps, { slug, story, journal, next }) => {
  const { phase, step, attempt, missing, resumed } = next
  const date = dayOf(deps.clock.now())
  const outputs = resumed ? resumed.outputs : step.outputs.map((output) => outputPath(output.path, { date, slug }))
  const precreated = await Promise.all(step.outputs.map((output) => (output.template ? deps.templates.read(output.template) : null)))
  if (!resumed) {
    for (const [index, path] of outputs.entries()) {
      const text = precreated[index]
      if (text !== null && (await deps.files.read(slug, path)) === null) await deps.files.write(slug, path, text)
    }
    await journal.append('step.started', { step: step.id, phase, kind: step.kind, agent: step.agent, attempt, outputs, missing })
  }
  deps.progress.log(`${slug}: ${step.agent}, attempt ${attempt}`)
  const missingNow = async () => {
    const texts = await Promise.all(outputs.map((path) => deps.files.read(slug, path)))
    return outputs.filter((_, index) => !isFilled(texts[index], precreated[index]))
  }
  const started = deps.clock.now()
  /** @type {number | undefined} */
  let cost
  if (!resumed || (await missingNow()).length > 0) {
    const answer = await deps.agentRunner.run({
      agent: step.agent,
      label: dispatchLabel({ slug, step: step.id, attempt }),
      prompt: composeBrief({
        agent: step.agent,
        phase,
        slug,
        story,
        outputs: outputs.map((path) => deps.files.location(slug, path)),
        missing: missing.map((path) => deps.files.location(slug, path)),
        attempt,
        maxAttempts: step.maxAttempts,
      }),
    })
    if (answer.unavailable) {
      return { status: 'blocked', slug, phase, code: 'agent-unavailable', reason: answer.error ?? `${step.agent} could not be started` }
    }
    cost = answer.costUsd
  }
  const left = await missingNow()
  await journal.append('step.recorded', {
    step: step.id,
    attempt,
    outcome: left.length === 0 ? 'outputs-complete' : 'missing-outputs',
    missing: left,
    durationMs: deps.clock.now().getTime() - started.getTime(),
    ...(typeof cost === 'number' ? { cost } : {}),
  })
  return null
}
