// Pure: the steps of a phase and whether each one succeeded — the check marks a person
// following a pipeline reads. Derived from what is on record: the phase's status and
// artefacts, its reviews, the code's check of the quality gates, the ADR ratification, the
// reports. Step status:
//   done      succeeded            failed    tried, and it did not pass
//   running   under way            waiting   needs the human
//   pending   not reached          skipped   the phase closed without it

const REVIEW_FAILED = new Set(['NEEDS_REWORK', 'REJECTED'])

// phase — a view phase (status, artifacts, reviews, specialist, reviewer)
// context — { structuralScan, adrRatification, qualityGates, reports: [{ kind }] }
export const phaseSteps = (phase, context) => {
  const closed = phase.status === 'done'
  const reached = phase.status !== 'pending'
  const open = reached && !closed
  const live = phase.status === 'active' ? 'running' : 'pending'
  const steps = []
  const step = (id, label, status, detail = null) => steps.push({ id, label, status, detail })

  if (phase.name === 'DESIGN') {
    step('structural-scan', 'Structural scan of the code', context.structuralScan ? 'done' : closed ? 'skipped' : open ? live : 'pending')
  }
  const wrote = phase.artifacts.length > 0
  step('outputs', `${phase.specialist ?? 'Specialist'} wrote its outputs`,
    wrote ? 'done' : open ? live : 'pending',
    wrote ? `${phase.artifacts.length} file${phase.artifacts.length > 1 ? 's' : ''}` : null)

  if (phase.name === 'DELIVER') {
    const verdict = context.qualityGates?.verdict ?? null
    step('quality-gates', 'Quality gates verified by the code',
      verdict === 'pass' ? 'done' : verdict ? 'failed' : closed ? 'skipped' : open && wrote ? live : 'pending',
      verdict && verdict !== 'pass' ? verdict : null)
  }

  if (phase.reviewer) {
    const last = phase.reviews.at(-1)
    const status = last?.verdict === 'APPROVED' ? 'done'
      : REVIEW_FAILED.has(last?.verdict) ? (closed ? 'done' : phase.status === 'active' ? 'running' : 'failed')
        : closed ? 'done' : open && wrote ? live : 'pending'
    const detail = last ? `${phase.reviews.length} review${phase.reviews.length > 1 ? 's' : ''}, last ${String(last.verdict ?? 'unread').toLowerCase().replace('_', ' ')}` : null
    step('review', `${phase.reviewer} approved`, status, detail)
  }

  if (phase.name === 'DESIGN') {
    const ratification = context.adrRatification?.checkpointStatus ?? null
    step('adr-ratification', 'Proposed ADRs ratified',
      ratification === 'resolved' || closed ? 'done' : ratification === 'awaiting_human' ? 'waiting' : 'pending')
  }
  if (phase.name === 'DISTILL' || phase.name === 'DELIVER') {
    const kind = phase.name === 'DISTILL' ? 'forecast' : 'outcome'
    const rendered = context.reports.some((report) => report.kind === kind)
    step(`${kind}-report`, `${kind === 'forecast' ? 'Forecast' : 'Outcome'} report rendered`, rendered ? 'done' : closed ? 'skipped' : 'pending')
  }
  step('closed', 'Phase closed', closed ? 'done' : phase.status === 'awaiting' ? 'waiting' : phase.status === 'blocked' ? 'failed' : 'pending')
  return steps
}
