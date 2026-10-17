import { readLensAnswer, readRefutation } from '../domain/review/answers.mjs'
import { composeReviewContext, RULE_FILES } from '../domain/review/context.mjs'
import { reviewedPatch, reviewedPaths } from '../domain/review/changes.mjs'
import { composeLensBrief, composeRefuterBrief, reviewLabel } from '../domain/review/lens-brief.mjs'
import { planLenses, REFUTER } from '../domain/review/lenses.mjs'
import { decideReview, REFUTED_SEVERITIES } from '../domain/review/verdict.mjs'
import { joinRelative } from '../domain/config/relative-path.mjs'

/**
 * @typedef {import('../domain/review/lenses.mjs').Lens} Lens
 * @typedef {import('../domain/review/lenses.mjs').InputKind} InputKind
 * @typedef {import('../domain/review/answers.mjs').LensResult} LensResult
 * @typedef {import('../domain/review/answers.mjs').Finding} Finding
 * @typedef {import('../domain/review/verdict.mjs').RecordedRefutation} RecordedRefutation
 * @typedef {import('../domain/review/verdict.mjs').ReviewVerdict} ReviewVerdict
 * @typedef {import('../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('./ports/agent-runner.mjs').AgentDispatch} AgentDispatch
 * @typedef {import('./ports/agent-runner.mjs').AgentAnswer} AgentAnswer
 * @typedef {{
 *   deps: {
 *     files: import('./ports/tracking-files.mjs').TrackingFiles,
 *     hasher: import('./ports/hasher.mjs').Hasher,
 *     agentRunner: import('./ports/agent-runner.mjs').AgentRunner,
 *     progress: import('./ports/pipeline-progress.mjs').PipelineProgress,
 *     sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   },
 *   slug: string,
 *   journal: import('./run-journal.mjs').OpenJournal,
 *   workflow: import('../domain/workflow/workflow.mjs').Workflow,
 *   sources: Record<string, import('./ports/agent-catalog.mjs').AgentSource>,
 *   run: RunState,
 *   step: import('../domain/pipeline/next-step.mjs').WorkStep,
 * }} Review
 * @typedef {{ kind: InputKind, path: string }} TrackedInput path relative to the tracking folder
 * @typedef {{ paths: string[], patch: string, inputs: Record<InputKind, string[]> }} Prepared
 *   paths: the changed paths, relative to the working copy; inputs: the tracking files of each kind.
 * @typedef {{ stop: { code: string, reason: string } }} Stopped
 * @typedef {{ blocked: { code: string, reason: string }, costUsd: number | undefined }} Blocked
 * @typedef {{ verdict: ReviewVerdict, costUsd: number | undefined }} Reviewed
 *   costUsd: what the lenses and the refuter cost, undefined when the host tells nothing.
 * @typedef {{ lens: Lens, inputs: TrackedInput[], fingerprint: string }} PlannedLens
 */

/** Answers a lens or the refuter may give before it counts as unreadable. */
const ASKS = 2

/**
 * A review node: the lenses read what the run prepared for them, the refuter checks the
 * blocker and high findings, then the verdict is computed from what they answered.
 * @param {Review} review
 * @returns {Promise<Stopped | Blocked | Reviewed>}
 */
export const runReview = async (review) => {
  const prepared = await prepareChanges(review)
  if ('stop' in prepared) return prepared
  const planned = await planned_(review, prepared)
  const lensed = await lensResults(review, planned)
  if (!('results' in lensed)) return lensed
  const refuted = await refutations(review, planned, lensed.fresh)
  if ('stop' in refuted) return refuted
  return { verdict: decideReview(lensed.results, refuted.refutations), costUsd: costOf(review) }
}

/**
 * Writes the changes since the run's base, the tracking files left out, beside the review.
 * @param {Review} review
 * @returns {Promise<Prepared | Stopped>}
 */
const prepareChanges = async (review) => {
  const changes = await changesSinceBase(review)
  if (changes === null) return { stop: { code: 'environment', reason: `Git could not tell what changed since the base of the run, so ${review.step.node.id} has nothing to review` } }
  const folder = `reviews/${review.step.node.id}-${review.step.visit}`
  await review.deps.files.write(review.slug, `${folder}/changes.patch`, changes.patch)
  await review.deps.files.write(review.slug, `${folder}/changed-files.txt`, changes.paths.map((path) => `${path}\n`).join(''))
  await review.deps.files.write(review.slug, `${folder}/context.md`, await contextOf(review))
  return { ...changes, inputs: { overview: [`${folder}/context.md`], ...documentsOf(review), patch: [`${folder}/changes.patch`], files: [`${folder}/changed-files.txt`] } }
}

/**
 * The patch and the changed paths of each repository of the run since its base.
 * @param {Review} review
 * @returns {Promise<{ paths: string[], patch: string } | null>}
 */
const changesSinceBase = async ({ deps, run }) => {
  const changes = { paths: /** @type {string[]} */ ([]), patch: '' }
  for (const { repository, sha } of uniqueRepositories(run.base)) {
    const patch = await deps.sourceControl.diff(repository, sha)
    const paths = await deps.sourceControl.changedFiles(repository, sha)
    if (patch === null || paths === null) return null
    changes.paths.push(...reviewedPaths(paths.map((path) => joinRelative(repository, path))))
    changes.patch += reviewedPatch(patch, repository)
  }
  return changes
}

/** One base per repository, the first named. @param {RunState['base']} base */
const uniqueRepositories = (base) => base.filter((entry, index) => base.findIndex((other) => other.repository === entry.repository) === index)

/**
 * The documents the agents of the review's phase filled or wrote, and those of the story and
 * of the other phases.
 * @param {Review} review
 * @returns {{ outputs: string[], context: string[] }}
 */
const documentsOf = ({ workflow, run, step }) => {
  const nodes = Object.entries(run.nodes)
  const ofPhase = (/** @type {boolean} */ same) => [...new Set(nodes
    .filter(([id]) => (workflow.nodes[id]?.phase === step.phase) === same)
    .flatMap(([, state]) => [...state.outputs, ...state.documents]))]
  return { outputs: ofPhase(true), context: [...new Set([...run.artifacts, ...ofPhase(false)])] }
}

/**
 * The shared context file of the review: its story, the project's rule files that exist, and
 * the documents each agent node filled or wrote, by phase in workflow order.
 * @param {Review} review
 */
const contextOf = async (review) => {
  const { deps, slug, workflow, run, step } = review
  const at = (/** @type {string} */ path) => deps.files.location(slug, path)
  return composeReviewContext({
    node: step.node.id, phase: step.phase, story: run.story,
    rules: await rulesOf(review), artifacts: run.artifacts.map(at),
    phases: workflow.phases
      .map((phase) => ({ phase, steps: stepsOf(review, phase).map(({ id, agent, documents }) => ({ step: id, agent, documents: documents.map(at) })) }))
      .filter(({ steps }) => steps.length > 0),
  })
}

/** The project's rule files the working copy has. @param {Review} review */
const rulesOf = async ({ deps }) => {
  const present = await Promise.all(RULE_FILES.map(async (path) => ((await deps.workspace.read(path)) === null ? null : path)))
  return present.filter((path) => path !== null)
}

/** The agent nodes of a phase that ran, with what they filled or wrote. @param {Review} review @param {string} phase */
const stepsOf = ({ workflow, run }, phase) => workflow.order
  .filter((id) => workflow.nodes[id].kind === 'agent' && workflow.nodes[id].phase === phase && id in run.nodes)
  .map((id) => ({ id, agent: /** @type {string} */ (workflow.nodes[id].agent), documents: [...new Set([...run.nodes[id].outputs, ...run.nodes[id].documents])] }))

/**
 * The lenses that run on these changes, each with its inputs and their fingerprint.
 * @param {Review} review @param {Prepared} prepared
 * @returns {Promise<PlannedLens[]>}
 */
const planned_ = async (review, prepared) => {
  const lenses = planLenses(review.step.node.lenses, prepared)
  return Promise.all(lenses.map(async (lens) => {
    const kinds = lens.blind ? lens.inputs : [/** @type {InputKind} */ ('overview'), ...lens.inputs]
    const inputs = kinds.flatMap((kind) => prepared.inputs[kind].map((path) => ({ kind, path })))
    return { lens, inputs, fingerprint: await fingerprintOf(review, inputs, lens.inputs.includes('files') ? prepared.paths : []) }
  }))
}

/**
 * What the inputs hold: the changes by kind (their file moves with the pass), documents by
 * path, and for a lens that reads the changed paths, what each of them holds now.
 * @param {Review} review @param {TrackedInput[]} inputs @param {string[]} changed relative to the working copy
 */
const fingerprintOf = async ({ deps, slug }, inputs, changed) => {
  const texts = await Promise.all(inputs.map(({ path }) => deps.files.read(slug, path)))
  const keyed = inputs.map(({ kind, path }, index) => [kind === 'outputs' || kind === 'context' ? path : kind, texts[index]])
  const contents = await Promise.all(changed.map(async (path) => [path, await deps.workspace.read(path)]))
  return deps.hasher.sha256(JSON.stringify([...keyed, ...contents]))
}

/**
 * What this pass of the review cost: its lenses, its checks and the batches the host could only
 * tell as a whole, as journaled; undefined when the host told nothing.
 * @param {Review} review
 */
export const costOf = (review) => ['review.lens', 'review.refuted', 'review.cost']
  .flatMap((type) => eventsOf(review, type))
  .filter((event) => event.visit === review.step.visit)
  .reduce((total, event) => addCost(total, event.cost), /** @type {number | undefined} */ (undefined))

/** The review events of this node, of earlier passes or of this one. @param {Review} review @param {string} type */
const eventsOf = ({ journal, step }, type) => journal.events.filter((event) => event.type === type && event.step === step.node.id)

/**
 * Each lens's result: kept from this pass when a resumed review already has it, kept from the
 * last pass when its inputs did not change and it found nothing, else asked. fresh: the results
 * the refuter may still check (one taken over found nothing).
 * @param {Review} review @param {PlannedLens[]} planned
 * @returns {Promise<{ results: LensResult[], fresh: LensResult[] } | Stopped | Blocked>}
 */
const lensResults = async (review, planned) => {
  const kept = await keepLenses(review, planned)
  const asked = planned.filter((entry) => !kept.has(entry.lens.name))
  const answered = await askLenses(review, asked)
  if ('stop' in answered || 'blocked' in answered) return answered
  const fresh = answered.results
  const results = planned.map(({ lens }) => kept.get(lens.name) ?? /** @type {LensResult} */ (fresh.find((result) => result.lens === lens.name)))
  return { results, fresh: [...fresh, ...kept.values()] }
}

/**
 * The lens results this pass already holds, and those it takes over from the last pass.
 * @param {Review} review @param {PlannedLens[]} planned
 * @returns {Promise<Map<string, LensResult>>}
 */
const keepLenses = async (review, planned) => {
  const events = eventsOf(review, 'review.lens')
  /** @type {Map<string, LensResult>} */
  const kept = new Map()
  for (const { lens, fingerprint } of planned) {
    const current = events.find((event) => event.visit === review.step.visit && event.lens === lens.name)
    // Stryker disable next-line EqualityOperator: an event of this pass is found as current first
    const earlier = events.filter((event) => event.visit < review.step.visit && event.lens === lens.name).at(-1)
    if (current) kept.set(lens.name, resultOf(current))
    else if (earlier && isClean(earlier) && earlier.fingerprint === fingerprint) kept.set(lens.name, await reuse(review, earlier))
  }
  return kept
}

/** @param {RunEvent} event @returns {LensResult} */
const resultOf = ({ lens, verdict, findings }) => ({ lens, verdict, findings })

/** @param {RunEvent} event */
const isClean = (event) => event.verdict === 'pass' && event.findings.length === 0

/** @param {Review} review @param {RunEvent} earlier @returns {Promise<LensResult>} */
const reuse = async (review, earlier) => {
  const { lens, agent, fingerprint, verdict, findings } = earlier
  await review.journal.append('review.lens', { step: review.step.node.id, visit: review.step.visit, lens, agent, fingerprint, verdict, findings, reused: true })
  return resultOf(earlier)
}

/**
 * Asks the lenses together, then once more those whose answer could not be read.
 * @param {Review} review @param {PlannedLens[]} asked
 * @returns {Promise<{ results: LensResult[] } | Stopped | Blocked>}
 */
const askLenses = async (review, asked) => {
  const answered = await askTwice(review, asked, lensAsking(review))
  if ('stop' in answered) return answered
  if (answered.unreadable.length > 0) return { blocked: unreadableLenses(answered.unreadable), costUsd: costOf(review) }
  return { results: answered.read.map(({ value }) => value) }
}

/** @param {Review} review @returns {Asking<PlannedLens>} */
const lensAsking = (review) => ({
  dispatch: (entry, attempt, retry) => lensDispatch(review, entry, attempt, retry),
  read: (text, entry) => readLensAnswer(text, entry.lens.name),
  record: (entry, reading, answer) => recordLens(review, entry, reading, answer),
})

/** @param {Array<{ item: PlannedLens, error: string }>} unreadable */
const unreadableLenses = (unreadable) => ({
  code: 'lens-unreadable',
  reason: unreadable.map(({ item, error }) => `${item.lens.agent} answered ${ASKS} times without a readable verdict: ${error}`).join('; '),
})

/** @param {Review} review @param {PlannedLens} entry @param {number} attempt @param {string | null} retry @returns {AgentDispatch} */
const lensDispatch = ({ deps, slug, sources, run, step }, { lens, inputs }, attempt, retry) => ({
  agent: lens.agent,
  source: sources[lens.agent],
  label: reviewLabel({ slug, step: step.node.id, visit: step.visit, what: lens.name, attempt }),
  prompt: composeLensBrief({ lens, phase: step.phase, slug, story: run.story, inputs: located(deps, slug, inputs), retry }),
})

/** @param {Review['deps']} deps @param {string} slug @param {TrackedInput[]} inputs */
const located = (deps, slug, inputs) => inputs.map(({ kind, path }) => ({ kind, path: deps.files.location(slug, path) }))

/** @param {Review} review @param {PlannedLens} entry @param {{ result: LensResult }} reading @param {AgentAnswer} answer */
const recordLens = async ({ journal, step }, { lens, fingerprint }, { result }, answer) => {
  const { verdict, findings } = result
  await journal.append('review.lens', { step: step.node.id, visit: step.visit, lens: lens.name, agent: lens.agent, fingerprint, verdict, findings, cost: answer.costUsd })
  return result
}

/**
 * The refuter's word on each blocker and high finding the lenses gave in this pass; one kept
 * from a resumed pass is not asked again, one it answers unreadably twice stays unverifiable.
 * @param {Review} review @param {PlannedLens[]} planned @param {LensResult[]} fresh
 * @returns {Promise<{ refutations: RecordedRefutation[] } | Stopped>}
 */
const refutations = async (review, planned, fresh) => {
  const done = eventsOf(review, 'review.refuted').filter((event) => event.visit === review.step.visit).map(refutationOf)
  const asked = toRefute(fresh, planned).filter(({ lens, finding }) => !done.some((known) => known.lens === lens && known.finding === finding.id))
  const answered = await askTwice(review, asked, refuterAsking(review))
  if ('stop' in answered) return answered
  const lost = []
  for (const { item, error } of answered.unreadable) lost.push(await recordRefutation(review, item, { verdict: 'unverifiable', reason: `unreadable twice: ${error}` }, undefined))
  return { refutations: [...done, ...answered.read.map(({ value }) => value), ...lost] }
}

/** @param {Review} review @returns {Asking<Suspect>} */
const refuterAsking = (review) => ({
  dispatch: (suspect, attempt, retry) => refuterDispatch(review, suspect, attempt, retry),
  read: (text) => readRefutation(text),
  record: (suspect, reading, answer) => recordRefutation(review, suspect, reading.refutation, answer.costUsd),
})

/**
 * @typedef {{ lens: string, finding: Finding, inputs: TrackedInput[] }} Suspect
 *   a finding to check, with the inputs of the lens that gave it.
 */

/** @param {LensResult[]} fresh @param {PlannedLens[]} planned @returns {Suspect[]} */
const toRefute = (fresh, planned) => fresh.flatMap(({ lens, findings }) => findings
  .filter((finding) => REFUTED_SEVERITIES.includes(finding.severity))
  .map((finding) => ({ lens, finding, inputs: /** @type {PlannedLens} */ (planned.find((entry) => entry.lens.name === lens)).inputs })))

/** @param {RunEvent} event @returns {RecordedRefutation} */
const refutationOf = ({ lens, finding, verdict, reason }) => ({ lens, finding, verdict, reason })

/** @param {Review} review @param {Suspect} suspect @param {number} attempt @param {string | null} retry @returns {AgentDispatch} */
const refuterDispatch = ({ deps, slug, sources, step }, { lens, finding, inputs }, attempt, retry) => ({
  agent: REFUTER,
  source: sources[REFUTER],
  label: reviewLabel({ slug, step: step.node.id, visit: step.visit, what: `refute ${lens} ${finding.id}`, attempt }),
  prompt: composeRefuterBrief({ lens, finding, inputs: located(deps, slug, inputs), retry }),
})

/**
 * @param {Review} review @param {Suspect} suspect
 * @param {import('../domain/review/answers.mjs').Refutation} refutation @param {number | undefined} cost
 * @returns {Promise<RecordedRefutation>}
 */
const recordRefutation = async ({ journal, step }, { lens, finding }, { verdict, reason }, cost) => {
  await journal.append('review.refuted', { step: step.node.id, visit: step.visit, lens, finding: finding.id, verdict, reason, cost })
  return { lens, finding: finding.id, verdict, reason }
}

/**
 * @template T
 * @typedef {{
 *   dispatch: (item: T, attempt: number, retry: string | null) => AgentDispatch,
 *   read: (text: string, item: T) => { ok: true } & Record<string, any> | { ok: false, error: string },
 *   record: (item: T, reading: any, answer: AgentAnswer) => Promise<any>,
 * }} Asking
 */

/**
 * Asks every item together, records each readable answer, then asks again with the reason
 * those whose answer could not be read; the run stops when the host cannot start an agent.
 * @template T
 * @param {Review} review @param {T[]} items @param {Asking<T>} asking
 * @returns {Promise<{ read: Array<{ item: T, value: any }>, unreadable: Array<{ item: T, error: string }> } | Stopped>}
 */
const askTwice = async (review, items, asking) => {
  const tally = { read: /** @type {Array<{ item: T, value: any }>} */ ([]), unreadable: items.map((item) => ({ item, error: /** @type {string | null} */ (null) })) }
  for (let attempt = 1; attempt <= ASKS && tally.unreadable.length > 0; attempt += 1) {
    const stopped = await askRound(review, tally, asking, attempt)
    if (stopped !== null) return stopped
  }
  return { ...tally, unreadable: tally.unreadable.map(({ item, error }) => ({ item, error: /** @type {string} */ (error) })) }
}

/**
 * One round: the items still unread, asked together.
 * @template T
 * @param {Review} review
 * @param {{ read: Array<{ item: T, value: any }>, unreadable: Array<{ item: T, error: string | null }> }} tally
 * @param {Asking<T>} asking @param {number} attempt
 * @returns {Promise<Stopped | null>}
 */
const askRound = async (review, tally, asking, attempt) => {
  const pending = tally.unreadable
  const dispatches = pending.map(({ item, error }) => asking.dispatch(item, attempt, error))
  const { answers, costUsd } = await review.deps.agentRunner.runMany(dispatches)
  if (costUsd !== undefined) await review.journal.append('review.cost', { step: review.step.node.id, visit: review.step.visit, cost: costUsd })
  tally.unreadable = []
  for (const [index, { item }] of pending.entries()) await takeAnswer(tally, asking, item, answers[index])
  const index = answers.findIndex((answer) => answer.unavailable)
  return index < 0 ? null : { stop: { code: 'agent-unavailable', reason: answers[index].error ?? `${dispatches[index].agent} could not be started` } }
}

/**
 * A cost added to another; unknown only while both are.
 * @param {number | undefined} total @param {number | undefined} cost
 */
const addCost = (total, cost) => (cost === undefined ? total : (total ?? 0) + cost)

/**
 * @template T
 * @param {{ read: Array<{ item: T, value: any }>, unreadable: Array<{ item: T, error: string | null }> }} tally
 * @param {Asking<T>} asking @param {T} item @param {AgentAnswer} answer
 */
const takeAnswer = async (tally, asking, item, answer) => {
  if (answer.unavailable) return
  const reading = answer.ok ? asking.read(answer.text, item) : { ok: false, error: answer.error ?? 'no answer' }
  if (reading.ok) tally.read.push({ item, value: await asking.record(item, reading, answer) })
  else tally.unreadable.push({ item, error: /** @type {{ error: string }} */ (reading).error })
}
