import { buildHandoff } from '../../domain/handoff-policy.mjs'
import { nextPhaseAfter } from '../../domain/pipeline-policy.mjs'
import { parseOutputEntry } from '../../domain/phase-gate-policy.mjs'
import { artifactPatternToRegExp } from '../../domain/artifact-policy.mjs'
import { DEFAULT_PHASE_ORDER } from '../../domain/state-machine.mjs'
import {
  composeDispatchBrief,
  reviewOutputPath,
  reworkAddendum,
  ENVIRONMENT_REGATE_ADDENDUM,
} from '../../domain/pipeline/dispatch-brief.mjs'
import { readReviewOutcome, qualityGateOutcome } from '../../domain/pipeline/review-outcome.mjs'
import {
  proposedAdrs,
  ratificationQuestion,
  RATIFICATION_OPTIONS,
  interpretRatification,
} from '../../domain/pipeline/adr-ratification-policy.mjs'
import { createStateService } from '../state-service.mjs'
import { createPhaseGate } from '../phase-gate-service.mjs'

// The SKRAFT orchestrator as code: one generic use case, the same for every host.
// A Claude Code mod and a Copilot dynamic workflow are thin adapters around it
// (src/adapters/hosts/): they supply the ports (src/ports/pipeline/host-ports.mjs)
// and render its progress; every decision is taken here.
//
// It replays skraft-orchestrator.md: RESEARCH → DESIGN → DISTILL → DELIVER, one
// specialist then one reviewer per phase, the reviewer's verdict read from the review
// file on disk, reworks bounded by maxRetriesPerPhase, the ADR ratification and
// environment checkpoints asked to the human. State lives in state.json through the
// existing state service, so every transition still passes the state machine and the
// phase gate, and a stopped run resumes where state.json says it stopped.
//
// Outcome: { status: 'done' | 'blocked' | 'awaiting-human', phase, reason, checkpoint? }

const TRACKING_PREFIX = /^\.copilot-tracking\/skraft-plans\/\{projectSlug\}\//

class Halt extends Error {
  constructor(outcome) {
    super(outcome.reason)
    this.outcome = outcome
  }
}

const blocked = (phase, reason, detail) => new Halt({ status: 'blocked', phase, reason, ...(detail ? { detail } : {}) })
const awaiting = (phase, checkpoint) => new Halt({ status: 'awaiting-human', phase, reason: checkpoint.question, checkpoint })

// Tracking-relative output patterns an agent writes, each { pattern, optional }.
const trackedOutputs = (agent, config) =>
  (config.agentArtifacts?.[agent]?.outputs ?? [])
    .map(parseOutputEntry)
    .filter((entry) => entry && TRACKING_PREFIX.test(entry.pattern))
    .map((entry) => ({ pattern: entry.pattern.replace(TRACKING_PREFIX, ''), optional: entry.optional }))

export const createRunPipeline = (ports) => {
  const { config, progress, clock } = ports
  const phaseOrder = config.phaseOrder ?? DEFAULT_PHASE_ORDER
  const phaseGate = createPhaseGate({ config, trackingFiles: ports.trackingFiles, git: ports.git })
  const stateService = createStateService({
    stateReader: ports.stateReader,
    stateWriter: ports.stateWriter,
    phaseOrder,
    phaseGate,
  })

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

  const readTracking = async (slug, path) => {
    try { return await ports.trackingFiles.read(slug, path) } catch { return null }
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const dispatch = async (slug, story, state, agent, { outputs = [], addenda = [], label }) => {
    const handoff = buildHandoff({ agent, state, config })
    if (!handoff.ok) throw blocked(state.currentPhase, `cannot hand off to ${agent}: ${handoff.error.reason}`)
    const prompt = composeDispatchBrief({
      handoff: handoff.value,
      slug,
      story,
      trackingPrefix: ports.trackingPrefix(slug),
      outputs,
      addenda,
    })
    progress.log(`→ ${agent} (${handoff.value.mode}, attempt ${handoff.value.attempt}/${handoff.value.maxAttempts})`)
    const answer = await ports.agents.run({
      agent,
      phase: handoff.value.phase,
      role: handoff.value.role,
      label,
      prompt,
    })
    if (!answer?.ok) progress.log(`  ${agent} returned no answer`)
    return answer
  }

  // Outputs of `agent` on disk, matched against its published descriptor.
  const producedOutputs = async (slug, agent) => {
    const files = await ports.trackingFiles.list(slug)
    const found = []
    const missing = []
    for (const { pattern, optional } of trackedOutputs(agent, config)) {
      const re = artifactPatternToRegExp(pattern)
      const matches = files.filter((file) => re.test(file)).sort()
      if (matches.length > 0) found.push(...matches)
      else if (!optional) missing.push(pattern)
    }
    return { found: [...new Set(found)], missing }
  }

  const recordOutputs = async (slug, phase, paths) => {
    let state = await readState(slug)
    for (const path of paths) {
      if ((state.phaseArtifacts?.[phase] ?? []).includes(path)) continue
      state = await apply(slug, { type: 'RECORD_ARTIFACT', phase, path })
    }
    return state
  }

  // ── Deterministic tools ─────────────────────────────────────────────────────
  const ensureStructuralScan = async (slug, state) => {
    if ((state.phaseArtifacts?.RESEARCH ?? []).some((path) => path.endsWith('structural-scan.json'))) return
    const path = `details/${clock.today()}/structural-scan.json`
    const run = await ports.commands.run(
      ['node', `${ports.pluginRoot}/src/cli/structural-scan.mjs`, '--out', `${ports.trackingPrefix(slug)}${path}`],
      { timeoutMs: 120_000 },
    )
    if (run.exitCode === 0 && (await ports.trackingFiles.exists(slug, path))) {
      await apply(slug, { type: 'RECORD_ARTIFACT', phase: 'RESEARCH', path })
      progress.log(`structural scan recorded: ${path}`)
    } else {
      progress.log(`structural scan skipped (exit ${run.exitCode})`)
    }
  }

  const verifyQualityGates = async (slug, state, produced) => {
    const log = produced.filter((path) => /(^|\/)qg-[^/]+\.json$/.test(path)).sort().at(-1)
    if (!log) return { outcome: 'fail', findings: 'No quality-gate evidence log (evidence/{date}/{story}/qg-{story}.json) was produced.' }
    const baseSha = state.phaseHistory?.DELIVER?.baseSha
    const run = await ports.commands.run(
      [
        'node', `${ports.pluginRoot}/src/cli/qg-verify.mjs`,
        '--log', `${ports.trackingPrefix(slug)}${log}`,
        ...(baseSha ? ['--base', baseSha] : []),
      ],
      { timeoutMs: 600_000 },
    )
    const outcome = qualityGateOutcome(run.exitCode)
    progress.log(`qg-verify ${log}: ${outcome}`)
    return { outcome, findings: [run.stdout, run.stderr].filter(Boolean).join('\n').slice(-8_000) }
  }

  // ── Checkpoints ─────────────────────────────────────────────────────────────
  const ask = async (phase, checkpoint) => {
    const answer = await ports.interaction.decide(checkpoint)
    if (answer === null || answer === undefined) throw awaiting(phase, checkpoint)
    return String(answer).trim()
  }

  const ratifyAdrs = async (slug, story) => {
    for (let round = 1; round <= 3; round += 1) {
      const state = await readState(slug)
      if (state.adrRatification?.checkpointStatus === 'resolved') return
      const pending = proposedAdrs(await ports.repositoryFiles.read('docs/adr/decisions-index.md'))
      const ratified = state.adrRatification?.ratified ?? []
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
        key: `adr-ratification:${pending.map(({ adr }) => adr).join(',')}`,
        question: ratificationQuestion(pending),
        options: [...RATIFICATION_OPTIONS],
      }
      const decision = interpretRatification(await ask('DESIGN', checkpoint), pending)
      if (decision.kind === 'pause') throw awaiting('DESIGN', checkpoint)

      const verdictLines = [
        ...decision.verdicts.map(({ adr, verdict }) => `- ADR-${adr}: ${verdict === 'Accepted' ? 'accept' : 'reject'}`),
        ...decision.amendments.map(({ adr, note }) => `- ADR-${adr}: amend "${note}"`),
      ].join('\n')
      await dispatch(slug, story, await readState(slug), config.phaseAgents.DESIGN.specialist, {
        label: `DESIGN:ratify:${round}`,
        addenda: [{ title: 'Ratify mode — human verdicts', body: `Apply ratify-mode to these verdicts, then commit:\n${verdictLines}` }],
      })
      const remaining = new Set(proposedAdrs(await ports.repositoryFiles.read('docs/adr/decisions-index.md')).map(({ adr }) => adr))
      const nowRatified = [
        ...ratified,
        ...decision.verdicts.filter(({ adr }) => !remaining.has(adr)).map(({ adr, verdict }) => ({ adr, verdict, by: 'human' })),
      ]
      if (remaining.size === 0) {
        await apply(slug, { type: 'SET_METADATA', field: 'adrRatification', value: { checkpointStatus: 'resolved', pending: [], ratified: nowRatified } })
        return
      }
      await apply(slug, {
        type: 'SET_METADATA',
        field: 'adrRatification',
        value: { ...(await readState(slug)).adrRatification, ratified: nowRatified },
      })
    }
    throw blocked('DESIGN', 'ADR ratification did not converge after 3 rounds')
  }

  // Where a phase resumes, read from state.json and the latest review on disk.
  const entryStep = async (slug, state, phase) => {
    const verdict = state.verdicts?.[phase]
    if (verdict === 'APPROVED') return { kind: 'advance' }
    if (verdict !== 'CHANGES_REQUESTED') return { kind: 'specialist', addenda: [] }
    const lastReview = (state.reviewArtifacts?.[phase] ?? []).at(-1)
    const outcome = readReviewOutcome(lastReview ? await readTracking(slug, lastReview) : null)
    if (outcome.verdict === 'REJECTED') return { kind: 'rejected', findings: outcome.findings }
    if (outcome.escalation === 'environment') return { kind: 'environment', detail: outcome.findings }
    return { kind: 'specialist', addenda: outcome.findings ? [reworkAddendum({
      attempt: (state.retryCount?.[phase] ?? 0) + 1,
      maxAttempts: (state.userPreferences?.maxRetriesPerPhase ?? 2) + 1,
      findings: outcome.findings,
    })] : [] }
  }

  // ── One phase ───────────────────────────────────────────────────────────────
  const runPhase = async (slug, story, phase) => {
    const { specialist, reviewer } = config.phaseAgents?.[phase] ?? {}
    if (!specialist) throw blocked(phase, `${phase} has no specialist in skraft-framework.config.json`)
    progress.phase(phase)

    await apply(slug, { type: 'MARK_PHASE_STARTED', phase, at: clock.now(), baseSha: await ports.git.headSha() })
    if (phase === 'DESIGN') await ensureStructuralScan(slug, await readState(slug))

    let step = await entryStep(slug, await readState(slug), phase)
    let reviewerRedispatched = false

    for (let guard = 0; guard < 50; guard += 1) {
      const state = await readState(slug)
      const maxAttempts = (state.userPreferences?.maxRetriesPerPhase ?? 2) + 1
      const recordedReviews = (state.reviewArtifacts?.[phase] ?? []).length

      switch (step.kind) {
        case 'advance': {
          if (phase === 'DESIGN') await ratifyAdrs(slug, story)
          const target = nextPhaseAfter(phase, { ...config, phaseOrder }) ?? 'DONE'
          try {
            await apply(slug, { type: 'ADVANCE', targetPhase: target, at: clock.now() })
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
          step = {
            kind: 'specialist',
            addenda: [reworkAddendum({ attempt: (next.retryCount?.[phase] ?? 0) + 1, maxAttempts, findings: step.findings })],
          }
          break
        }

        case 'rejected': {
          const answer = await ask(phase, {
            key: `rejected:${phase}:${recordedReviews}`,
            question: `${reviewer} REJECTED ${phase}. Resolve the blocker (for DESIGN G13: write the -resolution.md beside the decision-drift file), then answer "rework" to retry, or "stop".`,
            options: ['rework', 'stop'],
          })
          if (answer.toLowerCase() !== 'rework') throw blocked(phase, `${phase} rejected; stopped by the human`)
          step = { kind: 'retry', findings: step.findings }
          break
        }

        case 'environment': {
          const answer = await ask(phase, {
            key: `environment:${phase}:${recordedReviews}:${step.source ?? 'review'}`,
            question: `${phase} is blocked by the environment, not by the code:\n${step.detail}\nFix the environment, then answer "fixed" (or "stop").`,
            options: ['fixed', 'stop'],
          })
          if (answer.toLowerCase() !== 'fixed') throw blocked(phase, 'environment escalation; stopped by the human')
          step = phase === 'DELIVER' ? { kind: 'specialist', addenda: [ENVIRONMENT_REGATE_ADDENDUM] } : { kind: 'reviewer' }
          break
        }

        case 'specialist': {
          await dispatch(slug, story, state, specialist, {
            label: `${phase}:specialist:${state.retryCount?.[phase] ?? 0}:${recordedReviews}:${step.addenda.map((a) => a.title).join('|')}`,
            addenda: step.addenda,
          })
          const { found, missing } = await producedOutputs(slug, specialist)
          let after = await recordOutputs(slug, phase, found)
          if (missing.length > 0) {
            await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: 'CHANGES_REQUESTED' })
            step = { kind: 'retry', findings: `Artefact missing: ${missing.join(', ')}. Write every required output at its dated path.` }
            break
          }
          if (phase === 'DELIVER') {
            const gates = await verifyQualityGates(slug, after, after.phaseArtifacts?.DELIVER ?? [])
            if (gates.outcome === 'fail') {
              await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: 'CHANGES_REQUESTED' })
              step = { kind: 'retry', findings: `qg-verify failed — fix these before review:\n${gates.findings}` }
              break
            }
            if (gates.outcome !== 'pass') {
              step = { kind: 'environment', source: 'qg-verify', detail: gates.findings }
              break
            }
          }
          if (!reviewer) {
            after = await apply(slug, { type: 'CLOSE_PHASE', phase, verdict: 'APPROVED', at: clock.now() })
            progress.log(`${phase} closed (no reviewer) → ${after.currentPhase}`)
            return
          }
          step = { kind: 'reviewer' }
          break
        }

        case 'reviewer': {
          const reviewPath = reviewOutputPath({ phase, date: clock.today(), recordedReviews })
          await dispatch(slug, story, state, reviewer, {
            label: `${phase}:reviewer:${recordedReviews + 1}${reviewerRedispatched ? ':again' : ''}`,
            outputs: [reviewPath],
          })
          const content = await readTracking(slug, reviewPath)
          if (content === null) {
            if (reviewerRedispatched) throw blocked(phase, `${reviewer} wrote no review at ${reviewPath}`)
            reviewerRedispatched = true
            break
          }
          reviewerRedispatched = false
          await apply(slug, { type: 'RECORD_REVIEW_ARTIFACT', phase, path: reviewPath })
          const outcome = readReviewOutcome(content)
          progress.log(`${reviewer}: ${outcome.verdict ?? 'no verdict'}${outcome.escalation ? ` (escalation: ${outcome.escalation})` : ''}`)
          if (outcome.verdict === 'APPROVED') {
            await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: 'APPROVED' })
            step = { kind: 'advance' }
          } else if (outcome.verdict === 'NEEDS_REWORK') {
            await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: 'CHANGES_REQUESTED' })
            step = outcome.escalation === 'environment'
              ? { kind: 'environment', detail: outcome.findings }
              : { kind: 'retry', findings: outcome.findings }
          } else if (outcome.verdict === 'REJECTED') {
            await apply(slug, { type: 'RECORD_VERDICT', phase, verdict: 'CHANGES_REQUESTED' })
            step = { kind: 'rejected', findings: outcome.findings }
          } else {
            throw blocked(phase, `${reviewPath} carries no parseable verdict`)
          }
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
    try {
      const init = await stateService.init(slug)
      if (!init.ok) throw blocked(null, `state.json for ${slug}: ${init.error.code}`)
      for (let i = 0; i < maxPhases; i += 1) {
        const state = await readState(slug)
        if (state.currentPhase === 'DONE') {
          progress.log(`${slug}: pipeline DONE`)
          return Object.freeze({ status: 'done', phase: 'DONE', reason: 'every phase approved' })
        }
        await runPhase(slug, story, state.currentPhase)
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
