import { buildHandoff, evaluateHandoff } from '../../domain/handoff-policy.mjs'
import { evaluateDispatch, nextPhaseAfter } from '../../domain/pipeline-policy.mjs'
import { projectDispatchState } from '../../domain/state-schema.mjs'
import { composeDispatchBrief, reviewOutputPath } from '../../domain/pipeline/dispatch-brief.mjs'
import { readReviewOutcome } from '../../domain/pipeline/review-outcome.mjs'
import {
  expectedTrackedOutputs,
  matchOutputs,
  latestEvidenceLog,
  structuralScanPath,
  hasStructuralScan,
} from '../../domain/pipeline/expected-outputs.mjs'
import {
  REVIEWER,
  reworkStep,
  stepOnEntry,
  stepAfterReview,
  stepAfterMissingOutputs,
  stepAfterQualityGates,
  stepAfterEnvironmentFixed,
  stepAfterRejection,
  checkpointKeys,
} from '../../domain/pipeline/step-policy.mjs'
import {
  proposedAdrs,
  ratificationQuestion,
  RATIFICATION_OPTIONS,
  interpretRatification,
} from '../../domain/pipeline/adr-ratification-policy.mjs'
import { verifyEvidenceLog } from '../evidence-verification-service.mjs'
import { createStructuralScan } from '../structural-scan-service.mjs'
import { createRecoveryService } from '../recovery-service.mjs'
import { Halt, awaiting, blocked, createCheckpoint } from './checkpoint.mjs'
import { createPipelineRecovery } from './recover-pipeline.mjs'
import { createPipelineStateService } from './pipeline-state.mjs'
import { createReportBoundaries } from './report-boundaries.mjs'
import { createRunJournal } from './run-journal.mjs'

// Use case RunPipeline (ports/api/run-pipeline.mjs): the SKRAFT orchestrator as code,
// the same for every host. It sequences RESEARCH → DESIGN → DISTILL → DELIVER, runs each
// phase's specialist then reviewer, and asks the human at the checkpoints. The rules —
// which step comes next, which outputs are due, which review number — are domain
// policies (domain/pipeline/); this module only runs them against the driven ports.
//
// Driven ports (ports/infrastructure/), injected by the composition root of each host:
//   stateReader, stateWriter   state.json (through the existing state service, so every
//                              transition still passes the state machine and the phase gate)
//   stateBackups, stateArchive state.json.bak.* to roll back to, state.json.invalid.* kept
//                              on a reset (RecoveryService, run before every start)
//   trackingStore              the project's tracking directory
//   repositoryReader           repository files: the ADR index, the evidence a log cites
//   sourceControl              git facts: the DELIVER base commit, the commits a log claims
//   sourceTree                 the source files the structural scan reads
//   hasher                     SHA-256 of the evidence a log cites
//   activePipeline             the pointer the settings hooks read to guard this run
//   agentRunner                one subagent dispatch
//   reportTransport            the remote side of report publication (a delegated agent)
//   templateReader             the plugin's templates (reports, closing reviews)
//   humanInteraction           a checkpoint question
//   decisionStore              answers recorded against a checkpoint key
//   progress                   phase and log lines for the person watching (also kept in
//                              {slug}/run.json by the run journal, with the open question)
//   time                       TimeProvider
// The G1–G11 evidence check of DELIVER and the structural scan DESIGN reads run in
// process (EvidenceVerification, StructuralScan): no command line, no child process.
// plus `config`, the published skraft-framework.config.json (ADR-005).
//
// Outcome: { status: 'done' | 'blocked' | 'awaiting-human', phase, reason, checkpoint? }

const MAX_STEPS_PER_PHASE = 50
const MAX_RATIFICATION_ROUNDS = 3

export const createRunPipeline = (deps) => {
  const {
    config,
    trackingStore,
    repositoryReader,
    sourceControl,
    sourceTree,
    hasher,
    activePipeline,
    agentRunner,
    decisionStore,
    time,
  } = deps
  const { stateService, phaseOrder } = createPipelineStateService(deps)
  // The run journal ({slug}/run.json) sees what the person watching sees: it wraps the
  // progress and question ports every step below uses.
  const journal = createRunJournal({ trackingStore, time })
  const progress = journal.observeProgress(deps.progress)
  const humanInteraction = journal.observeQuestions(deps.humanInteraction)
  const structuralScan = createStructuralScan({ sourceTree, sourceControl, time })
  const today = () => time.isoString().slice(0, 10)
  const now = () => time.isoString()

  // ── State ─────────────────────────────────────────────────────────────────
  const apply = async (slug, event) => {
    const result = await stateService.applyEvent(slug, event)
    if (!result.ok) throw result.error
    return result.value
  }

  const readState = async (slug) => {
    const result = await stateService.get(slug)
    if (!result.ok) throw blocked(null, `state.json unreadable: ${result.error.code}`)
    return result.value
  }

  const readTracked = async (slug, path) => {
    try { return await trackingStore.read(slug, path) } catch { return null }
  }

  const recordArtifacts = async (slug, phase, paths) => {
    let state = await readState(slug)
    for (const path of paths) {
      if ((state.phaseArtifacts?.[phase] ?? []).includes(path)) continue
      state = await apply(slug, { type: 'RECORD_ARTIFACT', phase, path })
    }
    return state
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  // Before every dispatch, the two checks the settings hooks used to make (G1, G9) run
  // here, on the state the code itself wrote: the agent belongs to the open phase, in
  // order, and the prompt names every input an earlier phase recorded.
  const dispatch = async (slug, story, state, agent, { outputs = [], addenda = [], label }) => {
    const projected = projectDispatchState(state)
    if (!projected.ok) throw blocked(state.currentPhase, `cannot dispatch ${agent}: ${projected.error.reason}`)
    const order = evaluateDispatch(agent, projected.value, config)
    if (!order.ok) throw blocked(state.currentPhase, `dispatch order (G1): ${order.error.reason}`)
    const handoff = buildHandoff({ agent, state, config })
    if (!handoff.ok) throw blocked(state.currentPhase, `cannot hand off to ${agent}: ${handoff.error.reason}`)
    // DISTILL and DELIVER specialists get the reporting addendum on every dispatch, rework included.
    const reporting = handoff.value.role === 'specialist' ? await reports.addendum(slug, handoff.value.phase) : null
    const prompt = composeDispatchBrief({
      handoff: handoff.value,
      slug,
      story,
      trackingPrefix: trackingStore.prefix(slug),
      outputs,
      addenda: reporting ? [reporting, ...addenda] : addenda,
    })
    const complete = evaluateHandoff({ agent, state, config, prompt })
    if (!complete.ok) throw blocked(state.currentPhase, `handoff (G9): ${complete.error.reason}`)
    progress.log(`→ ${agent} (${handoff.value.mode}, attempt ${handoff.value.attempt}/${handoff.value.maxAttempts})`)
    const answer = await agentRunner.run({ agent, phase: handoff.value.phase, role: handoff.value.role, label, prompt })
    if (!answer?.ok) progress.log(`  ${agent} returned no answer`)
    return answer
  }

  // ── Checkpoints ───────────────────────────────────────────────────────────
  // A recorded answer wins; otherwise the human is asked and the answer recorded.
  // No answer now (headless, or a host that suspends) stops the run as awaiting-human.
  const { ask, tryAsk } = createCheckpoint({ decisionStore, humanInteraction })
  const reports = createReportBoundaries({ ...deps, stateService, tryAsk, progress, time })
  const { recover } = createPipelineRecovery({
    recovery: createRecoveryService({
      stateReader: deps.stateReader,
      stateWriter: deps.stateWriter,
      backupReader: deps.stateBackups,
      stateArchive: deps.stateArchive,
      stateService,
    }),
    stateService,
    trackingStore,
    config,
    phaseOrder,
    ask,
    apply,
    readState: (slug) => readState(slug),
    progress,
    now,
  })

  const ratifyAdrs = async (slug, story) => {
    for (let round = 1; round <= MAX_RATIFICATION_ROUNDS; round += 1) {
      const state = await readState(slug)
      if (state.adrRatification?.checkpointStatus === 'resolved') return
      const ratified = state.adrRatification?.ratified ?? []
      const pending = proposedAdrs(await repositoryReader.read('docs/adr/decisions-index.md'))
      if (pending.length === 0) {
        await apply(slug, { type: 'SET_METADATA', field: 'adrRatification', value: { checkpointStatus: 'resolved', pending: [], ratified } })
        return
      }
      await apply(slug, {
        type: 'SET_METADATA',
        field: 'adrRatification',
        value: {
          checkpointStatus: 'awaiting_human',
          pending: pending.map(({ adr, title }) => ({ adr, title: title || `ADR-${adr}`, recommended: 'accept', status: 'Proposed' })),
          ratified,
        },
      })
      const checkpoint = {
        key: checkpointKeys.adrRatification(pending),
        question: ratificationQuestion(pending),
        options: [...RATIFICATION_OPTIONS],
      }
      const decision = interpretRatification(await ask(slug, 'DESIGN', checkpoint), pending)
      if (decision.kind === 'pause') throw awaiting('DESIGN', checkpoint)

      const verdictLines = [
        ...decision.verdicts.map(({ adr, verdict }) => `- ADR-${adr}: ${verdict === 'Accepted' ? 'accept' : 'reject'}`),
        ...decision.amendments.map(({ adr, note }) => `- ADR-${adr}: amend "${note}"`),
      ].join('\n')
      await dispatch(slug, story, await readState(slug), config.phaseAgents.DESIGN.specialist, {
        label: `DESIGN:ratify:${round}`,
        addenda: [{ title: 'Ratify mode — human verdicts', body: `Apply ratify-mode to these verdicts, then commit:\n${verdictLines}` }],
      })
      const remaining = new Set(proposedAdrs(await repositoryReader.read('docs/adr/decisions-index.md')).map(({ adr }) => adr))
      const nowRatified = [
        ...ratified,
        ...decision.verdicts.filter(({ adr }) => !remaining.has(adr)).map(({ adr, verdict }) => ({ adr, verdict, by: 'human' })),
      ]
      const after = await readState(slug)
      await apply(slug, {
        type: 'SET_METADATA',
        field: 'adrRatification',
        value: remaining.size === 0
          ? { checkpointStatus: 'resolved', pending: [], ratified: nowRatified }
          : { ...after.adrRatification, ratified: nowRatified },
      })
      if (remaining.size === 0) return
    }
    throw blocked('DESIGN', `ADR ratification did not converge after ${MAX_RATIFICATION_ROUNDS} rounds`)
  }

  // ── Deterministic checks, in process ────────────────────────────────────────
  const ensureStructuralScan = async (slug) => {
    if (hasStructuralScan(await readState(slug))) return
    const outputPath = structuralScanPath(today())
    try {
      const report = await structuralScan.scan()
      await trackingStore.write(slug, outputPath, `${JSON.stringify(report, null, 2)}\n`)
    } catch (error) {
      progress.log(`structural scan skipped: ${error?.message ?? error}`)
      return
    }
    await apply(slug, { type: 'RECORD_ARTIFACT', phase: 'RESEARCH', path: outputPath })
    progress.log(`structural scan recorded: ${outputPath}`)
  }

  // The evidence a log cites lives in the repository; an absent file is the ENOENT the
  // evidence service reads as a missing reference.
  const repositoryFiles = Object.freeze({
    read: async (path) => {
      const text = await repositoryReader.read(path)
      if (text === null) throw Object.assign(new Error(`${path} is not on disk`), { code: 'ENOENT' })
      return text
    },
  })

  const verifyQualityGates = async (slug, state) => {
    const evidenceLog = latestEvidenceLog(state.phaseArtifacts?.DELIVER ?? [])
    if (!evidenceLog) {
      return { outcome: 'fail', findings: 'No quality-gate evidence log (evidence/{date}/{story}/qg-{story}.json) was produced.' }
    }
    let verified
    try {
      verified = await verifyEvidenceLog({
        logPath: `${trackingStore.prefix(slug)}${evidenceLog}`,
        base: state.phaseHistory?.DELIVER?.baseSha ?? undefined,
        files: repositoryFiles,
        git: sourceControl,
        hasher,
      })
    } catch (error) {
      return { outcome: 'error', findings: `the evidence check could not run: ${error?.message ?? error}` }
    }
    progress.log(`qg-verify ${evidenceLog}: ${verified.verdict}`)
    return { outcome: verified.verdict, findings: JSON.stringify(verified.findings, null, 2) }
  }

  // ── One phase ───────────────────────────────────────────────────────────────
  const runPhase = async (slug, story, phase) => {
    const { specialist: specialistAgent, reviewer } = config.phaseAgents?.[phase] ?? {}
    if (!specialistAgent) throw blocked(phase, `${phase} has no specialist in skraft-framework.config.json`)
    progress.phase(phase)

    await apply(slug, { type: 'MARK_PHASE_STARTED', phase, at: now(), baseSha: await sourceControl.headSha() })
    if (phase === 'DESIGN') await ensureStructuralScan(slug)

    const entry = await readState(slug)
    const lastReviewPath = (entry.reviewArtifacts?.[phase] ?? []).at(-1)
    let step = stepOnEntry({
      verdict: entry.verdicts?.[phase],
      lastReview: lastReviewPath ? readReviewOutcome(await readTracked(slug, lastReviewPath)) : null,
      attempt: (entry.retryCount?.[phase] ?? 0) + 1,
      maxAttempts: (entry.userPreferences?.maxRetriesPerPhase ?? 2) + 1,
    })
    let reviewerRedispatched = false
    let environmentOccurrence = 0

    for (let guard = 0; guard < MAX_STEPS_PER_PHASE; guard += 1) {
      const state = await readState(slug)
      const maxAttempts = (state.userPreferences?.maxRetriesPerPhase ?? 2) + 1
      const recordedReviews = (state.reviewArtifacts?.[phase] ?? []).length

      switch (step.kind) {
        case 'advance': {
          if (phase === 'DESIGN') await ratifyAdrs(slug, story)
          if (phase === 'DISTILL') await reports.report(slug, 'forecast', (state.reviewArtifacts?.[phase] ?? []).at(-1))
          if (phase === 'DELIVER') await reports.report(slug, 'outcome', (state.reviewArtifacts?.[phase] ?? []).at(-1))
          const target = nextPhaseAfter(phase, { ...config, phaseOrder }) ?? 'DONE'
          try {
            await apply(slug, { type: 'ADVANCE', targetPhase: target, at: now() })
          } catch (error) {
            throw blocked(phase, `${phase} cannot close: ${error.reason ?? error.message}`, error.violations)
          }
          progress.log(`${phase} closed → ${target}`)
          return
        }

        case 'retry': {
          try {
            await apply(slug, { type: 'INCR_RETRY', phase })
          } catch (error) {
            if (error.code === 'RETRY_EXHAUSTED') throw blocked(phase, `retry budget exhausted (${maxAttempts} attempts); last findings attached`, step.findings)
            throw error
          }
          const next = await readState(slug)
          step = reworkStep({ findings: step.findings, attempt: (next.retryCount?.[phase] ?? 0) + 1, maxAttempts })
          break
        }

        case 'rejected': {
          const answer = await ask(slug, phase, {
            key: checkpointKeys.rejected(phase, recordedReviews),
            question: `${reviewer} REJECTED ${phase}. Resolve the blocker (for DESIGN G13: write the -resolution.md beside the decision-drift file), then answer "rework" to retry, or "stop".`,
            options: ['rework', 'stop'],
          })
          step = stepAfterRejection(answer, step.findings)
          if (!step) throw blocked(phase, `${phase} rejected; stopped by the human`)
          break
        }

        case 'environment': {
          environmentOccurrence += 1
          const answer = await ask(slug, phase, {
            key: checkpointKeys.environment(phase, {
              source: step.source,
              recordedReviews,
              retries: state.retryCount?.[phase] ?? 0,
              occurrence: environmentOccurrence,
            }),
            question: `${phase} is blocked by the environment, not by the code:\n${step.detail}\nFix the environment, then answer "fixed" (or "stop").`,
            options: ['fixed', 'stop'],
          })
          if (answer.toLowerCase() !== 'fixed') throw blocked(phase, 'environment escalation; stopped by the human')
          step = stepAfterEnvironmentFixed(phase)
          break
        }

        case 'specialist': {
          const answer = await dispatch(slug, story, state, specialistAgent, {
            label: `${phase}:specialist:${state.retryCount?.[phase] ?? 0}:${recordedReviews}:${step.addenda.map((a) => a.title).join('|')}`,
            addenda: step.addenda,
          })
          if (phase === 'DISTILL' && answer?.ok) await reports.keepHandoff(slug, answer.text)
          const { found, missing } = matchOutputs(await trackingStore.list(slug), expectedTrackedOutputs(specialistAgent, config))
          const after = await recordArtifacts(slug, phase, found)
          if (missing.length > 0) {
            await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: 'CHANGES_REQUESTED' })
            step = stepAfterMissingOutputs(missing)
            break
          }
          if (phase === 'DELIVER') {
            const gateStep = stepAfterQualityGates(await verifyQualityGates(slug, after))
            if (gateStep) {
              if (gateStep.kind === 'retry') await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: 'CHANGES_REQUESTED' })
              step = gateStep
              break
            }
          }
          if (!reviewer) {
            const closed = await apply(slug, { type: 'CLOSE_PHASE', phase, verdict: 'APPROVED', at: now() })
            progress.log(`${phase} closed (no reviewer) → ${closed.currentPhase}`)
            return
          }
          step = REVIEWER
          break
        }

        case 'reviewer': {
          const reviewPath = reviewOutputPath({ phase, date: today(), recordedReviews })
          await dispatch(slug, story, state, reviewer, {
            label: `${phase}:reviewer:${recordedReviews + 1}${reviewerRedispatched ? ':again' : ''}`,
            outputs: [reviewPath],
          })
          const content = await readTracked(slug, reviewPath)
          if (content === null) {
            if (reviewerRedispatched) throw blocked(phase, `${reviewer} wrote no review at ${reviewPath}`)
            reviewerRedispatched = true
            break
          }
          reviewerRedispatched = false
          await apply(slug, { type: 'RECORD_REVIEW_ARTIFACT', phase, path: reviewPath })
          const outcome = readReviewOutcome(content)
          progress.log(`${reviewer}: ${outcome.verdict ?? 'no verdict'}${outcome.escalation ? ` (escalation: ${outcome.escalation})` : ''}`)
          const next = stepAfterReview(outcome)
          if (!next.step) throw blocked(phase, `${reviewPath} carries no parseable verdict`)
          await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: next.stateVerdict })
          step = next.step
          break
        }

        default:
          throw blocked(phase, `unknown step ${step.kind}`)
      }
    }
    throw blocked(phase, 'step guard reached: the phase made no progress')
  }

  // ── The run ─────────────────────────────────────────────────────────────────
  const run = async ({ slug, story = null, maxPhases = 10 } = {}) => {
    await journal.begin(slug, story)
    try {
      const outcome = await runToOutcome({ slug, story, maxPhases })
      await journal.finish(outcome)
      return outcome
    } catch (error) {
      // A Copilot pause (AbortError) leaves the journal awaiting the human it asked.
      if (error?.name !== 'AbortError') await journal.finish({ status: 'error', reason: String(error?.message ?? error) })
      await journal.flush()
      throw error
    }
  }

  const runToOutcome = async ({ slug, story, maxPhases }) => {
    try {
      await recover(slug)
      const init = await stateService.init(slug)
      if (!init.ok) throw blocked(null, `state.json for ${slug}: ${init.error.code}`)
      // The settings hooks (G7/G8 session guard) read the pipeline this pointer names:
      // without it the DELIVER write check stands down, a stale one judges the wrong phase.
      await activePipeline.activate(slug)
      await reports.ensureConsent(slug, story)
      for (let i = 0; i < maxPhases; i += 1) {
        const state = await readState(slug)
        if (state.currentPhase === 'DONE') {
          await reports.resumePending(slug)
          progress.log(`${slug}: pipeline DONE`)
          return Object.freeze({ status: 'done', phase: 'DONE', reason: 'every phase approved' })
        }
        try {
          await runPhase(slug, story, state.currentPhase)
        } catch (error) {
          // A blocked DELIVER still reports its outcome; the report never changes the verdict.
          if (error instanceof Halt && error.outcome.status === 'blocked' && state.currentPhase === 'DELIVER') {
            const latest = await readState(slug)
            await reports.report(slug, 'outcome', (latest.reviewArtifacts?.DELIVER ?? []).at(-1))
          }
          throw error
        }
      }
      throw blocked(null, 'phase guard reached')
    } catch (error) {
      if (error instanceof Halt) return Object.freeze(error.outcome)
      // A refusal of the state service is a plain { code, reason } object. An Error
      // (a host's cancellation, a Copilot ctx.pause AbortError) belongs to the host.
      if (error && !(error instanceof Error) && typeof error.code === 'string') {
        return Object.freeze({ status: 'blocked', phase: null, reason: `${error.code}: ${error.reason ?? error.message ?? ''}` })
      }
      throw error
    }
  }

  return Object.freeze({ run })
}

