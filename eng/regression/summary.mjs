// Pure: turn one tracking folder (v1 state.json world or v2 events.jsonl world) into a
// RunSummary both sides can be compared on. No IO: tracking-folder.mjs reads the disk.
//
// @typedef {{ component: string, gate: string, status: string }} GateResult
// @typedef {{
//   phasesReached: string[],          // phases closed, in closing order
//   verdicts: Record<string, string[]>, // review verdicts per phase, in decision order
//   gates: GateResult[],              // last status per component/gate
//   artefacts: string[],              // normalised paths relative to the tracking folder
//   durationMs: number | null,
//   cost: number | null,
//   retries: number,
//   status: 'completed' | 'incomplete' | string,
// }} RunSummary

const DATE_SEGMENT = /\d{4}-\d{2}-\d{2}/g

// Run bookkeeping, not phase output: never compared as an artefact.
const BOOKKEEPING = [
  /^state\.json$/,
  /^events\.jsonl$/,
  /^execution-log\.jsonl?$/,
  /^execution-log\.json\.(bak|tmp|corrupted)\./,
  /^state\.json\.(bak|tmp|corrupted|invalid)\./,
  /^reporting\//,
  /^\.active-slug$/,
  /^reviews\//,
  /^evidence\//,
]

const REVIEW_FILE = /^reviews\/([^/]+)\/([a-z]+)-review-(\d+)\.md$/i
// Same anchoring as v1 artifact-policy: a nested lens `status:` is indented and never matches.
const VERDICT_LINE = /^(?:verdict|status):\s*"?(APPROVED|NEEDS_REWORK|REJECTED)"?\s*$/m

const toSlashes = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '')

export const normaliseArtefactPath = (p) => toSlashes(p).replace(DATE_SEGMENT, '{date}')

export const artefactsFrom = (files = []) => {
  const kept = files
    .map(toSlashes)
    .filter((p) => !BOOKKEEPING.some((re) => re.test(p)))
    .map(normaliseArtefactPath)
  return [...new Set(kept)].sort()
}

const toMs = (iso) => {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

const span = (starts, ends) => {
  const s = starts.map(toMs).filter((v) => v !== null)
  const e = ends.map(toMs).filter((v) => v !== null)
  if (s.length === 0 || e.length === 0) return null
  const d = Math.max(...e) - Math.min(...s)
  return d >= 0 ? d : null
}

const sumCounts = (map) =>
  Object.values(map ?? {}).reduce((acc, n) => acc + (Number.isInteger(n) && n > 0 ? n : 0), 0)

const lastGateWins = (entries) => {
  const byKey = new Map()
  for (const g of entries) byKey.set(`${g.component}\u0000${g.gate}`, g)
  return [...byKey.values()]
}

// v1 state verdicts store CHANGES_REQUESTED for both NEEDS_REWORK and REJECTED.
const V1_STATE_VERDICT = { APPROVED: 'APPROVED', CHANGES_REQUESTED: 'NEEDS_REWORK' }

/**
 * @param {{
 *   state: object,
 *   reviews?: { path: string, content: string }[],
 *   evidence?: { path: string, json: any }[],
 *   files?: string[],
 * }} folder
 * @returns {RunSummary}
 */
export const summarizeV1 = ({ state = {}, reviews = [], evidence = [], files = [] }) => {
  const parsedReviews = reviews
    .map(({ path, content }) => {
      const m = toSlashes(path).match(REVIEW_FILE)
      const v = typeof content === 'string' ? content.match(VERDICT_LINE) : null
      return m && v ? { date: m[1], phase: m[2].toUpperCase(), n: Number(m[3]), verdict: v[1] } : null
    })
    .filter(Boolean)
    .sort((a, b) => (a.date === b.date ? a.n - b.n : a.date < b.date ? -1 : 1))

  const verdicts = {}
  for (const r of parsedReviews) (verdicts[r.phase] ??= []).push(r.verdict)
  for (const [phase, v] of Object.entries(state.verdicts ?? {})) {
    if (!verdicts[phase] && V1_STATE_VERDICT[v]) verdicts[phase] = [V1_STATE_VERDICT[v]]
  }

  const gates = lastGateWins(
    [...evidence]
      .sort((a, b) => (toSlashes(a.path) < toSlashes(b.path) ? -1 : 1))
      .flatMap(({ path, json }) => {
        const component = json?.story ?? toSlashes(path).split('/').slice(-2, -1)[0] ?? 'unknown'
        return (Array.isArray(json?.gates) ? json.gates : [])
          .filter((g) => g && g.id)
          .map((g) => ({ component: String(component), gate: String(g.id), status: String(g.status) }))
      }),
  )

  const history = Object.values(state.phaseHistory ?? {})

  return {
    phasesReached: [...(state.phasesCompleted ?? [])],
    verdicts,
    gates,
    artefacts: artefactsFrom(files),
    durationMs: span(history.map((h) => h.startedAt), history.map((h) => h.completedAt)),
    cost: null,
    retries: sumCounts(state.retryCount) + sumCounts(state.reworkCount),
    status: state.currentPhase === 'DONE' ? 'completed' : 'incomplete',
  }
}

// v2 gate command name → v1 gate ids (quality-gates-evidence-contract). `none` and unknown names
// have no v1 counterpart and are dropped.
export const V2_GATE_TO_V1 = Object.freeze({
  build: ['G3'],
  format: ['G4'],
  lint: ['G4'],
  test: ['G1', 'G2'],
  architecture: ['G5'],
  coverage: ['G11'],
  mutation: ['G6'],
})

const gateOrder = (a, b) => Number(a.gate.slice(1)) - Number(b.gate.slice(1))

// Several config components map onto one slug: `fail` wins over `pass`.
const worstStatus = (statuses) =>
  statuses.includes('fail') ? 'fail' : statuses.includes('pass') ? 'pass' : statuses[0]

/**
 * v2 `gate.ran` (config component + command name) → v1 gates on the run slug.
 * @param {{ component: string, gate: string, status: string }[]} ran last status per component/command
 * @param {string} slug
 */
export const mapV2Gates = (ran, slug) => {
  const byId = new Map()
  for (const g of ran) {
    for (const id of V2_GATE_TO_V1[g.gate] ?? []) {
      if (!byId.has(id)) byId.set(id, [])
      byId.get(id).push(g.status)
    }
  }
  return [...byId].map(([gate, statuses]) => ({ component: slug, gate, status: worstStatus(statuses) }))
}

const RED_FAILURES = new Set(['not-red', 'green-without-red'])

/**
 * G8 and G10 from `commits.checked`: only the last check of each step counts.
 * @param {Map<string, any[]>} lastCheckByStep
 * @param {string} slug
 */
export const commitGates = (lastCheckByStep, slug) => {
  const commits = [...lastCheckByStep.values()].flat().filter((c) => c && typeof c === 'object')
  if (commits.length === 0) return []
  const gates = [{ component: slug, gate: 'G8', status: commits.some((c) => c.verdict === 'not-conventional') ? 'fail' : 'pass' }]
  if (commits.some((c) => RED_FAILURES.has(c.verdict))) gates.push({ component: slug, gate: 'G10', status: 'fail' })
  else if (commits.some((c) => c.replay)) gates.push({ component: slug, gate: 'G10', status: 'pass' })
  return gates
}

// v2 review `step.recorded` outcome → v1 verdict. `blocked` (a lens answered unreadably) is no
// verdict. A NEEDS_REWORK the workflow has no edge for ends the run, as a v1 REJECTED did.
const REVIEW_OUTCOME_TO_V1 = Object.freeze({ approved: 'APPROVED', 'needs-rework': 'NEEDS_REWORK' })

export const reviewVerdict = ({ outcome, code }) => {
  const verdict = REVIEW_OUTCOME_TO_V1[outcome] ?? null
  return verdict === 'NEEDS_REWORK' && code === 'review-rejected' ? 'REJECTED' : verdict
}

/**
 * Retries: a step started again counts one, except a step a review's NEEDS_REWORK sends the run
 * back through, on its first start before that review's next pass: the review's next pass is
 * the one retry of that rework, as v1 counted one per NEEDS_REWORK.
 */
export const retryCounter = () => {
  const started = new Set()
  let reworked = null
  const again = (step) => {
    const seen = started.has(step)
    started.add(step)
    return seen
  }
  return {
    review: (step) => {
      reworked = null
      return again(step) ? 1 : 0
    },
    step: (step) => {
      if (!again(step)) return 0
      if (reworked === null || reworked.has(step)) return 1
      reworked.add(step)
      return 0
    },
    reworkAsked: () => {
      reworked = new Set()
    },
  }
}

// The lens of a DELIVER review that attests v1 G7 (test theater) and G9 (Iron Rule).
export const INTEGRITY_LENS = 'test-integrity'

const refutationKey = (step, visit, lens, finding) => JSON.stringify([step, visit, lens, finding])

/** The severities that send the work back, as the engine counts them. */
const BLOCKING = Object.freeze(['blocker', 'high', 'medium'])

/** The gates the lens attests; a finding that names neither counts against both. */
const INTEGRITY_GATES = Object.freeze(['G7', 'G9'])

/** Whether a finding counts against a gate: it names that gate, or no gate the lens attests. */
const against = (finding, gate) => finding?.gate === gate || !INTEGRITY_GATES.includes(finding?.gate)

const integrityStatus = (result, refuted, gate) => {
  if (result.verdict === 'inconclusive') return 'inconclusive'
  const findings = Array.isArray(result.findings) ? result.findings : []
  const blocking = findings.filter((f) => BLOCKING.includes(f?.severity))
  const counted = blocking.filter((f) => against(f, gate) && !refuted.has(refutationKey(result.step, result.visit, result.lens, f.id)))
  if (counted.length > 0) return 'fail'
  return result.verdict === 'fail' && blocking.length === 0 ? 'fail' : 'pass'
}

/**
 * G7 and G9 from the last `test-integrity` lens result of a DELIVER review, each from the
 * findings that name it (a finding that names neither counts against both).
 * @param {any | null} result the last `review.lens` event of that lens
 * @param {Set<string>} refuted keys of the findings the refuter refuted
 * @param {string} slug
 */
export const integrityGates = (result, refuted, slug) => {
  if (result === null) return []
  return INTEGRITY_GATES.map((gate) => ({ component: slug, gate, status: integrityStatus(result, refuted, gate) }))
}

/**
 * Tolerant reader: unknown event types are ignored, missing payload fields are skipped.
 * The hash chain (`prev`) is not verified here; the engine owns that check.
 * @param {{ type: string, at?: string, [k: string]: any }[]} events
 * @param {{ files?: string[] }} [extra]
 * @returns {RunSummary}
 */
export const summarizeV2 = (events, { files = [] } = {}) => {
  const phasesReached = []
  const verdicts = {}
  const gates = []
  const commitChecks = new Map()
  let slug = null
  const reviewPhase = new Map()
  const counter = retryCounter()
  let integrity = null
  const refuted = new Set()
  let retries = 0
  let cost = null
  let status = 'incomplete'
  let startedAt = null
  let finishedAt = null

  for (const e of events) {
    if (!e || typeof e.type !== 'string') continue
    switch (e.type) {
      case 'run.started':
        startedAt ??= e.at
        if (slug === null && typeof e.slug === 'string' && e.slug) slug = e.slug
        break
      case 'step.started':
        if (e.step === undefined) break
        if (Array.isArray(e.lenses)) {
          reviewPhase.set(e.step, e.phase)
          retries += counter.review(e.step)
        } else retries += counter.step(e.step)
        break
      case 'step.recorded':
        if (typeof e.cost === 'number' && Number.isFinite(e.cost)) cost = (cost ?? 0) + e.cost
        if (reviewPhase.has(e.step)) {
          const verdict = reviewVerdict(e)
          const phase = reviewPhase.get(e.step)
          if (verdict !== null && phase) (verdicts[phase] ??= []).push(verdict)
          if (verdict === 'NEEDS_REWORK') counter.reworkAsked()
        }
        break
      case 'review.lens':
        if (e.lens === INTEGRITY_LENS && reviewPhase.get(e.step) === 'DELIVER') integrity = e
        break
      case 'review.refuted':
        if (e.verdict === 'refuted') refuted.add(refutationKey(e.step, e.visit, e.lens, e.finding))
        break
      case 'gate.ran':
        if (e.gate !== undefined) gates.push({ component: String(e.component ?? 'unknown'), gate: String(e.gate), status: String(e.status) })
        break
      case 'commits.checked':
        if (Array.isArray(e.commits)) {
          commitChecks.delete(String(e.step))
          commitChecks.set(String(e.step), e.commits)
        }
        break
      case 'phase.closed':
        if (e.phase && !phasesReached.includes(e.phase)) phasesReached.push(e.phase)
        break
      case 'run.finished':
        finishedAt = e.at
        if (typeof e.status === 'string') status = e.status
        break
      default:
        break
    }
  }

  return {
    phasesReached,
    verdicts,
    gates: [
      ...mapV2Gates(lastGateWins(gates), slug ?? 'unknown'),
      ...commitGates(commitChecks, slug ?? 'unknown'),
      ...integrityGates(integrity, refuted, slug ?? 'unknown'),
    ].sort(gateOrder),
    artefacts: artefactsFrom(files),
    durationMs: startedAt && finishedAt ? span([startedAt], [finishedAt]) : null,
    cost,
    retries,
    status,
  }
}

export const parseEventsJsonl = (text) =>
  String(text)
    .split(/\r?\n/)
    .map((line, i) => [line.trim(), i + 1])
    .filter(([line]) => line.length > 0)
    .map(([line, n]) => {
      try {
        return JSON.parse(line)
      } catch (err) {
        throw new Error(`events.jsonl line ${n}: ${err.message}`)
      }
    })
