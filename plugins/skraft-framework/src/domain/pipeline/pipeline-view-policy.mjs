import { reviewFilesOf } from './progress-inference-policy.mjs'
import { DEFAULT_PHASE_ORDER } from '../state-machine.mjs'

// Pure: what a person following a pipeline sees — one view model built from state.json,
// the run journal (run.json), the tracking files, the recorded decisions and the report
// receipts. The Copilot app canvas draws it; anything else may (the Claude Code pane).
//
// Phase status:
//   done      closed
//   active    the open phase of a running run
//   awaiting  the open phase, a question waiting for the human
//   blocked   the open phase, the run stopped (budget, refusal, "stop")
//   open      the open phase, no run in progress
//   pending   not reached yet

const PHASE_STATUS_OF_RUN = Object.freeze({ running: 'active', 'awaiting-human': 'awaiting', blocked: 'blocked', error: 'blocked' })
const LOG_LINES = 60

const durationOf = (startedAt, completedAt, now) => {
  const start = Date.parse(startedAt ?? '')
  if (!Number.isFinite(start)) return null
  const end = Date.parse(completedAt ?? now ?? '')
  return Number.isFinite(end) && end >= start ? end - start : null
}

const phaseStatus = ({ index, openIndex, done, phase, run }) => {
  if (done || index < openIndex) return 'done'
  if (index > openIndex) return 'pending'
  if (run && run.phase === phase) return PHASE_STATUS_OF_RUN[run.status] ?? 'open'
  return run?.status === 'running' ? 'active' : 'open'
}

const REPORT = /^reporting\/(\d{4}-\d{2}-\d{2})\/(forecast|outcome)\.md$/

// files          tracking-relative paths on disk
// reviewVerdicts { [path]: 'APPROVED' | 'NEEDS_REWORK' | 'REJECTED' | null }
// decisions      [{ key, answer, by, at }]
// receipts       [{ kind, story, targets: { pr?, issue? } }]  (report.mjs / ReportPublication shape)
// pending        reporting/pending.json, or null
export const buildPipelineView = ({
  slug, config, state, run = null, files = [], reviewVerdicts = {}, decisions = [], receipts = [], pending = null, now,
}) => {
  const phaseOrder = (config?.phaseOrder ?? DEFAULT_PHASE_ORDER).filter((phase) => phase !== 'DONE')
  const done = state?.currentPhase === 'DONE'
  const openIndex = state ? (done ? phaseOrder.length : phaseOrder.indexOf(state.currentPhase)) : -1
  const maxAttempts = (state?.userPreferences?.maxRetriesPerPhase ?? 2) + 1

  const phases = phaseOrder.map((phase, index) => {
    const agents = config?.phaseAgents?.[phase] ?? {}
    const history = state?.phaseHistory?.[phase] ?? {}
    const retries = state?.retryCount?.[phase] ?? 0
    const recorded = state?.reviewArtifacts?.[phase] ?? []
    const onDisk = reviewFilesOf(phase, files).reverse()
    const reviews = [...new Set([...recorded, ...onDisk])].map((path) => ({
      path,
      verdict: reviewVerdicts[path] ?? null,
      recorded: recorded.includes(path),
    }))
    return {
      name: phase,
      specialist: agents.specialist ?? null,
      reviewer: agents.reviewer ?? null,
      status: state ? phaseStatus({ index, openIndex, done, phase, run }) : 'pending',
      attempt: Math.min(retries + 1, maxAttempts),
      maxAttempts,
      retries,
      reworks: state?.reworkCount?.[phase] ?? 0,
      findingsResolved: state?.findingsResolved?.[phase] ?? 0,
      verdict: state?.verdicts?.[phase] ?? null,
      startedAt: history.startedAt ?? null,
      completedAt: history.completedAt ?? null,
      durationMs: durationOf(history.startedAt, history.completedAt, now),
      baseSha: history.baseSha ?? null,
      artifacts: [...(state?.phaseArtifacts?.[phase] ?? [])],
      reviews,
    }
  })

  const answered = new Set(decisions.map((decision) => decision.key))
  const checkpoint = run?.checkpoint
    ? { ...run.checkpoint, answered: answered.has(run.checkpoint.key) }
    : null

  const reports = files
    .map((path) => ({ path, match: REPORT.exec(path) }))
    .filter(({ match }) => match)
    .map(({ path, match }) => ({ kind: match[2], date: match[1], path }))
    .sort((a, b) => a.path.localeCompare(b.path))

  const publications = receipts.flatMap((receipt) => Object.entries(receipt?.targets ?? {}).map(([destination, entry]) => ({
    kind: receipt.kind,
    story: receipt.story,
    destination,
    status: entry?.status ?? 'unknown',
    url: entry?.url ?? null,
    number: entry?.target?.number ?? null,
  })))

  return {
    slug,
    story: run?.story ?? null,
    started: Boolean(state),
    currentPhase: state?.currentPhase ?? null,
    done,
    run: run
      ? {
        status: run.status,
        phase: run.phase ?? null,
        reason: run.reason ?? '',
        startedAt: run.startedAt ?? null,
        updatedAt: run.updatedAt ?? null,
        log: (Array.isArray(run.log) ? run.log : []).slice(-LOG_LINES),
      }
      : null,
    checkpoint,
    phases,
    adrRatification: state?.adrRatification ?? null,
    decisions: [...decisions].sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? ''))),
    reporting: {
      destinations: state?.userPreferences?.reporting?.destinations ?? null,
      reports,
      publications,
      pending: pending?.packet
        ? { kind: pending.packet.kind, destination: pending.packet.destination, reason: pending.decision?.reason ?? pending.packet.reason ?? null }
        : null,
    },
  }
}

// The tracking files a viewer may open: Markdown and JSON only, never state.json (the
// view already shows it) and never a path outside the list on disk.
export const isViewableTrackedFile = (path, files) => typeof path === 'string' &&
  files.includes(path) && /\.(md|json)$/.test(path) && path !== 'state.json'
