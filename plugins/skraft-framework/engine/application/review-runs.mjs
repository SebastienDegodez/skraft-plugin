import { readLensAnswer, readRefutation } from '../domain/review/answers.mjs'
import { composeReviewContext, RULE_FILES } from '../domain/review/context.mjs'
import { reviewedPatch, reviewedPaths } from '../domain/review/changes.mjs'
import { composeLensBrief, composeRefuterBrief, reviewLabel } from '../domain/review/lens-brief.mjs'
import { citationOf, groupFindings } from '../domain/review/finding-groups.mjs'
import { FAMILIES, planLenses, REFUTER, refuterFamily } from '../domain/review/lenses.mjs'
import { SCAN, SCANNED_WITH, scanPatch } from '../domain/review/patch-scan.mjs'
import { shortLocation, workingCopyOf } from '../domain/review/locations.mjs'
import { BLOCKING, blocksReview, composeVerdictFile, decideReview } from '../domain/review/verdict.mjs'
import { GATE_ORDER } from '../domain/gates/gate-plan.mjs'
import { readOrName } from './workspace-reading.mjs'

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
 *     workspace: import('./ports/workspace.mjs').ConfigSource,
 *     hasher: import('./ports/hasher.mjs').Hasher,
 *     agentRunner: import('./ports/agent-runner.mjs').AgentRunner,
 *     agentCatalog: import('./ports/agent-catalog.mjs').AgentCatalog,
 *     progress: import('./ports/pipeline-progress.mjs').PipelineProgress,
 *     sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   },
 *   slug: string,
 *   journal: import('./run-journal.mjs').OpenJournal,
 *   workflow: import('../domain/workflow/workflow.mjs').Workflow,
 *   components: import('../domain/config/skraft-config.mjs').Component[],
 *   sources: Record<string, import('./ports/agent-catalog.mjs').AgentSource>,
 *   run: RunState,
 *   step: import('../domain/pipeline/next-step.mjs').WorkStep,
 * }} Review
 * @typedef {{ kind: InputKind, path: string }} TrackedInput path relative to the tracking folder
 * @typedef {{ path: string, text: string }} RuleFile path relative to the working copy
 * @typedef {{ paths: string[], patch: string, rules: RuleFile[], inputs: Record<InputKind, string[]>, scan: Finding[] }} Prepared
 *   paths: the changed paths, relative to the working copy; rules: the project's rule files that
 *   exist; inputs: the tracking files of each kind; scan: the G9 findings the engine reads in the patch.
 * @typedef {{ stop: { code: string, reason: string } }} Stopped
 * @typedef {{ verdict: ReviewVerdict, costUsd: number | undefined }} Reviewed
 *   costUsd: what the lenses and the refuter cost, undefined when the host tells nothing.
 * @typedef {import('./ports/agent-catalog.mjs').SkillFile} SkillFile
 * @typedef {{ lens: Lens, inputs: TrackedInput[], skills: SkillFile[], fingerprint: string, known: Finding[], unchanged: boolean }} PlannedLens
 *   skills: the skills the lens declares, with their SKILL.md; known: the engine's findings the
 *   lens is told not to report again.
 */

/** Answers a lens or the refuter may give before it counts as unreadable. */
const MAX_ASKS = 2

/**
 * A review node: the lenses read what the run prepared for them, beside test-integrity the
 * engine reads the patch for G9, the refuter checks the blocker, high and medium findings unless
 * a lens already blocks the review, then the verdict is computed from what they answered and
 * written beside the pass's inputs.
 * @param {Review} review
 * @returns {Promise<Stopped | Reviewed>}
 */
export const runReview = async (review) => {
  const prepared = await prepareChanges(review)
  if ('stop' in prepared) return prepared
  const planned = await planLensInputs(review, prepared)
  const lensed = await lensResults(review, planned)
  if ('stop' in lensed) return lensed
  const scanned = await scanOf(review, planned, prepared)
  const results = [...lensed.results, ...scanned.map(({ result }) => result)]
  const refuted = blocksReview(results) ? { refutations: [] } : await refutations(review, [...planned, ...scanned.map(({ entry }) => entry)], results)
  if ('stop' in refuted) return refuted
  return { verdict: await decide(review, { results, reused: lensed.reused, ...refuted }), costUsd: costOf(review) }
}

/**
 * What the engine reads in the patch when test-integrity reviews it: its G9 findings as a
 * result of their own, journaled once a pass, with what the refuter reads to check them; none
 * when it finds nothing.
 * @param {Review} review @param {PlannedLens[]} planned @param {Prepared} prepared
 * @returns {Promise<Array<{ result: LensResult, entry: PlannedLens }>>}
 */
const scanOf = async (review, planned, prepared) => {
  const findings = planned.some(({ lens }) => lens.name === SCANNED_WITH) ? prepared.scan : []
  if (findings.length === 0) return []
  const result = /** @type {LensResult} */ ({ lens: SCAN, verdict: 'fail', findings })
  if (!eventsOfThisPass(review, 'review.lens').some((event) => event.lens === SCAN)) await recordScan(review, result)
  return [{ result, entry: scanEntry(prepared) }]
}

/** @param {Review} review @param {LensResult} result */
const recordScan = ({ journal, step }, { lens, verdict, findings }) => journal.append('review.lens', { step: step.node.id, visit: step.visit, lens, agent: SCAN_AGENT, verdict, findings })

/** Who journals the scan's findings. */
const SCAN_AGENT = 'skraft-engine'

/**
 * The scan as the refuter sees it: the patch and the changed paths, no skill, the weakest family.
 * @param {Prepared} prepared @returns {PlannedLens}
 */
const scanEntry = (prepared) => ({
  lens: { id: SCAN, name: SCANNED_WITH, agent: SCAN_AGENT, inputs: ['patch', 'files'], blind: false, trigger: null, model: FAMILIES[0] },
  inputs: [...prepared.inputs.patch.map((path) => ({ kind: /** @type {InputKind} */ ('patch'), path })), ...prepared.inputs.files.map((path) => ({ kind: /** @type {InputKind} */ ('files'), path }))],
  skills: [],
  fingerprint: '',
  known: [],
  unchanged: false,
})

/**
 * The verdict of the pass, written beside its inputs.
 * @param {Review} review @param {{ results: LensResult[], refutations: RecordedRefutation[], reused: string[] }} pass
 */
const decide = async (review, { results, refutations: checked, reused }) => {
  const verdict = decideReview(results, checked)
  await review.deps.files.write(review.slug, `${folderOf(review)}/verdict.yaml`, composeVerdictFile({ verdict, results, refutations: checked, reused }))
  return verdict
}

/** Where a review pass keeps what its lenses read and its verdict. @param {Review} review */
const folderOf = ({ step }) => `reviews/${step.node.id}-${step.visit}`

/**
 * Writes beside the review what its lenses read: the changes since the run's base (the tracking
 * folder left out), the changed paths, the shared context and the components.
 * @param {Review} review
 * @returns {Promise<Prepared | Stopped>}
 */
const prepareChanges = async (review) => {
  const changes = await changesSinceBase(review)
  if (changes === null) return { stop: { code: 'environment', reason: `Git could not tell what changed since the base of the run, so ${review.step.node.id} has nothing to review` } }
  const folder = folderOf(review)
  const rules = await rulesOf(review)
  await writeAll(review, folder, filesOf(review, changes, rules))
  return { ...changes, rules, inputs: inputsOf(review, folder, hasChanges(changes)), scan: scanPatch(changes.patch) }
}

/**
 * The files a review writes beside itself, by name.
 * @param {Review} review @param {{ paths: string[], patch: string }} changes @param {RuleFile[]} rules
 * @returns {Array<[string, string]>}
 */
const filesOf = (review, { paths, patch }, rules) => [
  ['changes.patch', patch],
  ['changed-files.txt', paths.map((path) => `${path}\n`).join('')],
  ['context.md', contextOf(review, rules)],
  ['components.json', componentsOf(review)],
]

/** @param {Review} review @param {string} folder @param {Array<[string, string]>} files */
const writeAll = async ({ deps, slug }, folder, files) => {
  for (const [name, text] of files) await deps.files.write(slug, `${folder}/${name}`, text)
}

/**
 * The tracking files of each input kind; no patch and no paths when the run changed nothing.
 * @param {Review} review @param {string} folder @param {boolean} changed
 * @returns {Record<InputKind, string[]>}
 */
const inputsOf = (review, folder, changed) => ({
  overview: [`${folder}/context.md`],
  ...documentsOf(review),
  patch: changed ? [`${folder}/changes.patch`] : [],
  files: changed ? [`${folder}/changed-files.txt`] : [],
  components: [`${folder}/components.json`],
})

/**
 * What each component builds on, how its tests stand in for what it calls, whether it wants
 * contract tests, and the gates that passed on it in this run, last run first considered.
 * @param {Review} review
 */
const componentsOf = ({ components, journal }) => {
  const described = components.map(({ name, root, stack, mocking, contractTesting }) => ({ name, root, stack, mocking, contractTesting, gates: passedGates(journal, name) }))
  return `${JSON.stringify(described, null, 2)}\n`
}

/** Whether the run changed anything outside the tracking folder. @param {{ paths: string[], patch: string }} changes */
const hasChanges = ({ paths, patch }) => paths.length > 0 || patch !== ''

/**
 * The gates whose last run on a component in this run passed, in gate order.
 * @param {Review['journal']} journal @param {string} component
 */
const passedGates = (journal, component) => GATE_ORDER.filter((gate) => journal.events.findLast((event) => event.type === 'gate.ran' && event.component === component && event.gate === gate)?.status === 'pass')

/**
 * The patch and the changed paths of each repository of the run since its base.
 * @param {Review} review
 * @returns {Promise<{ paths: string[], patch: string } | null>}
 */
const changesSinceBase = async ({ deps, run }) => {
  const changes = { paths: /** @type {string[]} */ ([]), patch: '' }
  for (const { repository, sha } of uniqueRepositories(run.base)) {
    const [patch, paths] = await Promise.all([deps.sourceControl.diff(repository, sha), deps.sourceControl.changedFiles(repository, sha)])
    if (patch === null || paths === null) return null
    changes.paths.push(...reviewedPaths(paths, repository))
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
 * @param {Review} review @param {RuleFile[]} rules
 */
const contextOf = (review, rules) => {
  const { deps, slug, workflow, run, step } = review
  const at = (/** @type {string} */ path) => deps.files.location(slug, path)
  return composeReviewContext({
    node: step.node.id, phase: step.phase, story: run.story,
    rules: rules.map(({ path }) => path), artifacts: run.artifacts.map(at),
    phases: workflow.phases
      .map((phase) => ({ phase, steps: writersOf(review, phase, at) }))
      .filter(({ steps }) => steps.length > 0),
  })
}

/** The project's rule files the working copy has, with what they say. @param {Review} review @returns {Promise<RuleFile[]>} */
const rulesOf = async ({ deps }) => {
  const texts = await Promise.all(RULE_FILES.map((path) => deps.workspace.read(path)))
  return RULE_FILES.flatMap((path, index) => (texts[index] === null ? [] : [{ path, text: /** @type {string} */ (texts[index]) }]))
}

/**
 * The agent nodes of a phase that ran, each with the documents it filled or wrote, located.
 * @param {Review} review @param {string} phase @param {(path: string) => string} at
 */
const writersOf = ({ workflow, run }, phase, at) => workflow.order
  .filter((id) => workflow.nodes[id].kind === 'agent' && workflow.nodes[id].phase === phase && id in run.nodes)
  .map((id) => ({ step: id, agent: /** @type {string} */ (workflow.nodes[id].agent), documents: writtenBy(run.nodes[id]).map(at) }))

/** @param {RunState['nodes'][string]} node */
const writtenBy = (node) => [...new Set([...node.outputs, ...node.documents])]

/**
 * The lenses that run on these changes, each with its inputs, its skills and their fingerprint.
 * @param {Review} review @param {Prepared} prepared
 * @returns {Promise<PlannedLens[]>}
 */
const planLensInputs = async (review, prepared) => Promise.all(planLenses({ specs: review.step.node.lenses, family: review.step.node.model }, prepared).map(async (lens) => {
  const kinds = lens.blind ? lens.inputs : [/** @type {InputKind} */ ('overview'), ...lens.inputs]
  const inputs = kinds.flatMap((kind) => prepared.inputs[kind].map((path) => ({ kind, path })))
  const skills = (await review.deps.agentCatalog.skills(lens.agent)).found
  const known = lens.name === SCANNED_WITH ? prepared.scan : []
  const unchanged = !hasChanges(prepared) && lens.inputs.some((kind) => kind === 'patch' || kind === 'files')
  return { lens, inputs, skills, fingerprint: await fingerprintOf(review, { inputs, skills, prepared, lens }), known, unchanged }
}))

/**
 * What a lens reads, so that a later pass knows whether it would read anything new: each input
 * (the changes by kind, since their file is named after the pass; documents by path), what each
 * of its skills says (by name, wherever the plugin sits), the rule files when it reads the shared
 * context, and what each changed path holds now when it reads them. A path that is no readable
 * file (a folder, a device) counts by its name alone.
 * @param {Review} review
 * @param {{ inputs: TrackedInput[], skills: SkillFile[], prepared: Prepared, lens: Lens }} read
 */
const fingerprintOf = async ({ deps, slug }, { inputs, skills, prepared, lens }) => {
  const texts = await Promise.all(inputs.map(({ path }) => deps.files.read(slug, path)))
  const keyed = inputs.map(({ kind, path }, index) => [kind === 'outputs' || kind === 'context' ? path : kind, texts[index]])
  const changed = lens.inputs.includes('files') ? prepared.paths : []
  const contents = await Promise.all(changed.map(async (path) => [path, await readOrName(deps.workspace, path)]))
  const rules = lens.blind ? [] : prepared.rules.map(({ path, text }) => [path, text])
  const skillTexts = skills.map(({ name, text }) => [name, text])
  return deps.hasher.sha256(JSON.stringify([...keyed, ...skillTexts, ...rules, ...contents]))
}

/**
 * What this pass of the review cost: its lenses, its checks and the batches the host could only
 * tell as a whole, as journaled; undefined when the host told nothing.
 * @param {Review} review
 */
const costOf = (review) => ['review.lens', 'review.refuted', 'review.cost']
  .flatMap((type) => eventsOf(review, type))
  .filter((event) => event.visit === review.step.visit)
  .reduce((total, event) => addCost(total, event.cost), /** @type {number | undefined} */ (undefined))

/** The review events of this node, of earlier passes or of this one. @param {Review} review @param {string} type */
const eventsOf = ({ journal, step }, type) => journal.events.filter((event) => event.type === type && event.step === step.node.id)

/**
 * The review events of this node written since this pass started: only those may stand for an
 * answer of this pass on a resume.
 * @param {Review} review @param {string} type
 */
const eventsOfThisPass = ({ journal, step }, type) => {
  const start = journal.events.findLastIndex((event) => event.type === 'step.started' && event.step === step.node.id && event.visit === step.visit)
  return journal.events.slice(start + 1).filter((event) => event.type === type && event.step === step.node.id && event.visit === step.visit)
}

/**
 * Each lens's result: kept from this pass when a resumed review already has it, kept from the
 * last pass when its inputs did not change and it found nothing, else asked; in the node's
 * order. reused: the lenses this pass took over from the last one.
 * @param {Review} review @param {PlannedLens[]} planned
 * @returns {Promise<{ results: LensResult[], reused: string[] } | Stopped>}
 */
const lensResults = async (review, planned) => {
  const kept = await keepLenses(review, planned)
  const answered = await askLenses(review, planned.filter((entry) => !kept.has(entry.lens.id)))
  if ('stop' in answered) return answered
  const asked = answered.results
  const results = planned.map(({ lens }) => kept.get(lens.id)?.result ?? /** @type {LensResult} */ (asked.find((result) => result.lens === lens.id)))
  const reused = planned.filter(({ lens }) => kept.get(lens.id)?.reused).map(({ lens }) => lens.id)
  return { results, reused }
}

/** @typedef {{ result: LensResult, reused: boolean | undefined }} Kept reused: taken over from the last pass */

/**
 * The lens results this pass already holds, and those it takes over from the last pass. Either
 * stands only for the inputs it was given: a result whose fingerprint differs is asked again.
 * @param {Review} review @param {PlannedLens[]} planned
 * @returns {Promise<Map<string, Kept>>}
 */
const keepLenses = async (review, planned) => {
  const current = eventsOfThisPass(review, 'review.lens')
  const earlier = eventsOf(review, 'review.lens').filter((event) => event.visit < review.step.visit)
  /** @type {Map<string, Kept>} */
  const kept = new Map()
  for (const entry of planned) {
    const result = await keptResult(review, entry, { current, earlier })
    if (result !== null) kept.set(entry.lens.id, result)
  }
  return kept
}

/**
 * @param {Review} review @param {PlannedLens} entry
 * @param {{ current: RunEvent[], earlier: RunEvent[] }} events
 * @returns {Promise<Kept | null>}
 */
const keptResult = async (review, { lens, fingerprint }, { current, earlier }) => {
  const same = (/** @type {RunEvent} */ event) => event.lens === lens.id && event.fingerprint === fingerprint
  const mine = current.find(same)
  if (mine) return { result: resultOf(mine), reused: mine.reused }
  const last = earlier.filter((event) => event.lens === lens.id).at(-1)
  return last && same(last) && isClean(last) ? { result: await reuse(review, last), reused: true } : null
}

/** @param {RunEvent} event @returns {LensResult} */
const resultOf = ({ lens, verdict, findings }) => ({ lens, verdict, findings })

/** @param {RunEvent} event */
const isClean = (event) => event.verdict === 'pass' && event.findings.length === 0

/** @param {Review} review @param {RunEvent} earlier @returns {Promise<LensResult>} */
const reuse = async (review, earlier) => {
  const { lens, agent, fingerprint, verdict, findings } = earlier
  const { step } = review
  await review.journal.append('review.lens', { step: step.node.id, visit: step.visit, lens, agent, fingerprint, verdict, findings, reused: true })
  return resultOf(earlier)
}

/**
 * Asks the lenses together, then once more those whose answer could not be read; a lens
 * unreadable twice stops the run, and a resumed run asks again only the lenses this pass has
 * not journaled.
 * @param {Review} review @param {PlannedLens[]} asked
 * @returns {Promise<{ results: LensResult[] } | Stopped>}
 */
const askLenses = async (review, asked) => {
  const answered = await askUpToTwice(review, asked, lensAsking(review))
  if ('stop' in answered) return answered
  if (answered.unreadable.length > 0) return { stop: unreadableLenses(answered.unreadable) }
  return { results: answered.read.map(({ value }) => value) }
}

/** @param {Review} review @returns {Asking<PlannedLens>} */
const lensAsking = (review) => ({
  dispatch: (entry, attempt, retry) => lensDispatch(review, entry, attempt, retry),
  read: (text, entry) => answerOf(readLensAnswer(text, entry.lens.name), entry.lens.id, workingCopyOf(review.deps.files.location(review.slug, 'marker'), review.slug)),
  record: (entry, reading, answer) => recordLens(review, entry, reading, answer),
})

/**
 * An answer read as the lens the agent is, kept under the lens's id, each location in its
 * shortest form.
 * @param {ReturnType<typeof readLensAnswer>} reading @param {string} id @param {string} root the working copy
 */
const answerOf = (reading, id, root) => {
  if (!reading.ok) return reading
  const findings = reading.result.findings.map((finding) => ({ ...finding, location: shortLocation(finding.location, root) }))
  return { ok: /** @type {const} */ (true), result: { ...reading.result, lens: id, findings } }
}

/** @param {Array<{ item: PlannedLens, error: string }>} unreadable */
const unreadableLenses = (unreadable) => ({
  code: 'lens-unreadable',
  reason: unreadable.map(({ item, error }) => `${item.lens.agent} answered ${MAX_ASKS} times without a readable verdict: ${error}`).join('; '),
})

/** @param {Review} review @param {PlannedLens} entry @param {number} attempt @param {string | null} retry @returns {AgentDispatch} */
const lensDispatch = ({ deps, slug, sources, run, step }, { lens, inputs, skills, known, unchanged }, attempt, retry) => ({
  agent: lens.agent,
  source: sources[lens.agent],
  label: reviewLabel({ slug, step: step.node.id, visit: step.visit, what: lens.id, attempt }),
  prompt: composeLensBrief({ lens, phase: step.phase, slug, story: run.story, inputs: located(deps, slug, inputs), skills: pathsOf(skills), known, unchanged, retry }),
  model: lens.model,
})

/** @param {SkillFile[]} skills */
const pathsOf = (skills) => skills.map(({ path }) => path)

/** @param {Review['deps']} deps @param {string} slug @param {TrackedInput[]} inputs */
const located = (deps, slug, inputs) => inputs.map(({ kind, path }) => ({ kind, path: deps.files.location(slug, path) }))

/** @param {Review} review @param {PlannedLens} entry @param {{ result: LensResult }} reading @param {AgentAnswer} answer */
const recordLens = async ({ journal, step }, { lens, fingerprint }, { result }, answer) => {
  const { verdict, findings } = result
  const cost = answer.costUsd
  await journal.append('review.lens', { step: step.node.id, visit: step.visit, lens: lens.id, agent: lens.agent, model: answer.model ?? null, fingerprint, verdict, findings, cost })
  return result
}

/**
 * The refuter's word on each group of blocker, high and medium findings the lenses gave in this pass
 * (a result kept from the last pass found nothing), applied to every finding of the group; a
 * group this pass already holds is not asked again, one it answers unreadably twice stays
 * unverifiable.
 * @param {Review} review @param {PlannedLens[]} planned @param {LensResult[]} results in the node's order
 * @returns {Promise<{ refutations: RecordedRefutation[] } | Stopped>}
 */
const refutations = async (review, planned, results) => {
  const done = eventsOfThisPass(review, 'review.refuted').map(refutationOf)
  const asked = toRefute(results, planned, review.step.node.refuter).filter(({ members: [first] }) => !done.some((known) => known.lens === first.lens && known.finding === first.finding.id))
  const answered = await askUpToTwice(review, asked, refuterAsking(review))
  if ('stop' in answered) return answered
  const lost = []
  for (const { item, error } of answered.unreadable) lost.push(...await recordUnverifiable(review, item, error))
  return { refutations: [...done, ...answered.read.flatMap(({ value }) => value), ...lost] }
}

/** @param {Review} review @param {Suspect} suspect @param {string} error */
const recordUnverifiable = (review, suspect, error) => {
  const reason = `unreadable ${MAX_ASKS} times: ${error}`
  return recordRefutation(review, suspect, { verdict: 'unverifiable', reason }, {})
}

/** @param {Review} review @returns {Asking<Suspect>} */
const refuterAsking = (review) => ({
  dispatch: (suspect, attempt, retry) => refuterDispatch(review, suspect, attempt, retry),
  read: (text) => readRefutation(text),
  record: (suspect, reading, answer) => recordRefutation(review, suspect, reading.refutation, answer),
})

/**
 * @typedef {{ members: Array<{ lens: string, finding: Finding }>, inputs: TrackedInput[], skills: SkillFile[], model: import('../domain/review/lenses.mjs').Family }} Suspect
 *   a group of findings to check, one per lens, with what their lenses read and the family the
 *   refuter checks it on. A group is journaled member after member, so its first member stands
 *   for it on a resume.
 */

/** @param {LensResult[]} results @param {PlannedLens[]} planned @param {string | null} named the node's refuter family @returns {Suspect[]} */
const toRefute = (results, planned, named) => groupFindings(results.flatMap(({ lens, findings }) => findings
  .filter((finding) => BLOCKING.includes(finding.severity))
  .map((finding) => ({ lens, finding })))).map((members) => suspectOf(members, planned, named))

/**
 * The group, with the inputs and skills of its lenses, each once, and the refuter's family.
 * @param {Suspect['members']} members @param {PlannedLens[]} planned @param {string | null} named @returns {Suspect}
 */
const suspectOf = (members, planned, named) => {
  const read = members.map(({ lens }) => /** @type {PlannedLens} */ (planned.find((entry) => entry.lens.id === lens)))
  return {
    members,
    model: refuterFamily(read.map((entry) => entry.lens.model), named),
    inputs: uniqueBy(read.flatMap(({ inputs }) => inputs), ({ kind, path }) => `${kind} ${path}`),
    skills: uniqueBy(read.flatMap(({ skills }) => skills), ({ name }) => name),
  }
}

/** @template T @param {T[]} items @param {(item: T) => string} keyOf @returns {T[]} the first of each key, in order */
const uniqueBy = (items, keyOf) => items.filter((item, index) => items.findIndex((other) => keyOf(other) === keyOf(item)) === index)

/** @param {RunEvent} event @returns {RecordedRefutation} */
const refutationOf = ({ lens, finding, verdict, reason }) => ({ lens, finding, verdict, reason })

/** @param {Review} review @param {Suspect} suspect @param {number} attempt @param {string | null} retry @returns {AgentDispatch} */
const refuterDispatch = ({ deps, slug, sources, step }, { members, inputs, skills, model }, attempt, retry) => ({
  agent: REFUTER,
  source: sources[REFUTER],
  label: reviewLabel({ slug, step: step.node.id, visit: step.visit, what: `refute ${citationOf(members)}`, attempt }),
  prompt: composeRefuterBrief({ members, inputs: located(deps, slug, inputs), skills: pathsOf(skills), retry }),
  model,
})

/**
 * @param {Review} review @param {Suspect} suspect
 * @param {import('../domain/review/answers.mjs').Refutation} refutation
 * @param {{ costUsd?: number, model?: string | null }} answer what the check cost and ran on, when one answered
 * @returns {Promise<RecordedRefutation[]>} one per member, the check's cost on the first
 */
const recordRefutation = async ({ journal, step }, { members }, { verdict, reason }, { costUsd, model = null }) => {
  for (const [index, { lens, finding }] of members.entries()) {
    await journal.append('review.refuted', { step: step.node.id, visit: step.visit, lens, finding: finding.id, verdict, reason, model, cost: index === 0 ? costUsd : undefined })
  }
  return members.map(({ lens, finding }) => ({ lens, finding: finding.id, verdict, reason }))
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
 * @template T
 * @typedef {{ read: Array<{ item: T, value: any }>, unreadable: Array<{ item: T, error: string | null }> }} Tally
 */

/**
 * Asks every item together, records each readable answer, then asks again with the reason
 * those whose answer could not be read; the run stops when the host cannot start an agent.
 * @template T
 * @param {Review} review @param {T[]} items @param {Asking<T>} asking
 * @returns {Promise<{ read: Array<{ item: T, value: any }>, unreadable: Array<{ item: T, error: string }> } | Stopped>}
 */
const askUpToTwice = async (review, items, asking) => {
  /** @type {Tally<T>} */
  const tally = { read: [], unreadable: items.map((item) => ({ item, error: null })) }
  for (let attempt = 1; attempt <= MAX_ASKS && tally.unreadable.length > 0; attempt += 1) {
    const stopped = await askRound(review, tally, asking, attempt)
    if (stopped !== null) return stopped
  }
  return { ...tally, unreadable: tally.unreadable.map(({ item, error }) => ({ item, error: /** @type {string} */ (error) })) }
}

/**
 * One round: the items still unread, asked together.
 * @template T
 * @param {Review} review @param {Tally<T>} tally @param {Asking<T>} asking @param {number} attempt
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
 * @param {Tally<T>} tally @param {Asking<T>} asking @param {T} item @param {AgentAnswer} answer
 */
const takeAnswer = async (tally, asking, item, answer) => {
  if (answer.unavailable) return
  const reading = answer.ok ? asking.read(answer.text, item) : { ok: false, error: answer.error ?? 'no answer' }
  if (reading.ok) tally.read.push({ item, value: await asking.record(item, reading, answer) })
  else tally.unreadable.push({ item, error: /** @type {{ error: string }} */ (reading).error })
}
