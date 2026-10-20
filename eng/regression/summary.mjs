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

// v2 review `step.recorded` outcome → v1 verdict. `blocked` (code lens-inconclusive) is no
// verdict. A NEEDS_REWORK the workflow has no edge for ends the run, as a v1 REJECTED did.
const REVIEW_OUTCOME_TO_V1 = Object.freeze({ approved: 'APPROVED', 'needs-rework': 'NEEDS_REWORK' })

export const reviewVerdict = ({ outcome, code }) => {
  const verdict = REVIEW_OUTCOME_TO_V1[outcome] ?? null
  return verdict === 'NEEDS_REWORK' && code === 'review-rejected' ? 'REJECTED' : verdict
}

/**
 * Retries: a step started again counts one, except a step a review's NEEDS_REWORK sends the run
 * back through, on its first start before that review's next pass: the review's next pass is
 * the one retry of that rework, as v1 counted one per NEEDS_REWORK. A mutation round counts
 * none: from a gate that failed with survivors to that gate's next result, a first attempt
 * (each group of survivors, the review and the gates run again) is no retry, as v1's engineer
 * killed mutants inside its own step; a refused attempt still counts one.
 */
export const retryCounter = () => {
  const started = new Set()
  let reworked = null
  let round = null
  const again = (step) => {
    const seen = started.has(step)
    started.add(step)
    return seen
  }
  const inRound = (attempt) => round !== null && attempt === 1
  return {
    review: (step, attempt) => {
      reworked = null
      return again(step) && !inRound(attempt) ? 1 : 0
    },
    step: (step, attempt) => {
      if (!again(step) || inRound(attempt)) return 0
      if (reworked === null || reworked.has(step)) return 1
      reworked.add(step)
      return 0
    },
    reworkAsked: () => {
      reworked = new Set()
    },
    recorded: ({ step, outcome, survivors }) => {
      if (step === round) round = null
      if (outcome === 'fail' && Array.isArray(survivors) && survivors.length > 0) round = step
    },
  }
}

// The lens of a DELIVER review that attests v1 G7 (test theater) and G9 (Iron Rule); the G9
// findings the engine reads in the patch are journaled beside it as `test-integrity#patch`.
export const INTEGRITY_LENS = 'test-integrity'

/** Whether a journaled lens is test-integrity or the engine's findings under its name. */
const isIntegrity = (lens) => typeof lens === 'string' && lens.split('#')[0] === INTEGRITY_LENS

const refutationKey = (step, visit, lens, finding) => JSON.stringify([step, visit, lens, finding])

/** The severities that send the work back, as the engine counts them. */
const BLOCKING = Object.freeze(['blocker', 'high', 'medium'])

/** The gates the lens attests; a finding that names neither counts against both. */
const INTEGRITY_GATES = Object.freeze(['G7', 'G9'])

/** Whether a finding counts against a gate: it names that gate, or no gate the lens attests. */
const against = (finding, gate) => finding?.gate === gate || !INTEGRITY_GATES.includes(finding?.gate)

// A lens that failed with no blocker, high or medium finding blocks the review as
// lens-inconclusive, as an inconclusive one does.
const integrityStatus = (result, refuted, gate) => {
  const findings = Array.isArray(result.findings) ? result.findings : []
  const blocking = findings.filter((f) => BLOCKING.includes(f?.severity))
  if (result.verdict === 'inconclusive' || (result.verdict === 'fail' && blocking.length === 0)) return 'inconclusive'
  const counted = blocking.filter((f) => against(f, gate) && !refuted.has(refutationKey(result.step, result.visit, result.lens, f.id)))
  return counted.length > 0 ? 'fail' : 'pass'
}

/**
 * G7 and G9 from the `test-integrity` results of the last pass of a DELIVER review, the lens's
 * and the engine's, each gate from the findings that name it (a finding that names neither
 * counts against both): inconclusive when one result is, failed when one counts a finding
 * against it.
 * @param {any[]} results the `review.lens` events of that lens in that pass
 * @param {Set<string>} refuted keys of the findings the refuter refuted
 * @param {string} slug
 */
export const integrityGates = (results, refuted, slug) => {
  if (results.length === 0) return []
  return INTEGRITY_GATES.map((gate) => ({ component: slug, gate, status: combined(results.map((result) => integrityStatus(result, refuted, gate))) }))
}

/** The gate's status over every result. @param {string[]} statuses */
const combined = (statuses) => ['inconclusive', 'fail'].find((status) => statuses.includes(status)) ?? 'pass'

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
  let integrity = []
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
          retries += counter.review(e.step, e.attempt)
        } else retries += counter.step(e.step, e.attempt)
        break
      case 'step.recorded':
        counter.recorded(e)
        if (typeof e.cost === 'number' && Number.isFinite(e.cost)) cost = (cost ?? 0) + e.cost
        if (reviewPhase.has(e.step)) {
          const verdict = reviewVerdict(e)
          const phase = reviewPhase.get(e.step)
          if (verdict !== null && phase) (verdicts[phase] ??= []).push(verdict)
          if (verdict === 'NEEDS_REWORK') counter.reworkAsked()
        }
        break
      case 'review.lens':
        if (isIntegrity(e.lens) && reviewPhase.get(e.step) === 'DELIVER') {
          const samePass = integrity.length > 0 && integrity[0].step === e.step && integrity[0].visit === e.visit
          integrity = samePass ? [...integrity, e] : [e]
        }
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
