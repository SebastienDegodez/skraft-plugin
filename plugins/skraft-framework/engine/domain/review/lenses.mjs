/**
 * The lenses a review node runs and what each one reads. A lens `<name>` is the agent
 * `<name>-lens`; a lens skraft does not know (one a repository adds) reads everything a
 * review prepares. A node names a lens `<name>`, optionally followed by `@<family>` for the
 * model family it runs on (haiku when it names none). The refuter runs one family above the
 * strongest lens whose findings it checks.
 *
 * @typedef {'overview' | 'outputs' | 'context' | 'patch' | 'files' | 'components'} InputKind
 *   overview: the review's shared context (story, project rules, who wrote which document), read
 *   by every lens but a blind one; outputs: what the agents of the review's phase filled or
 *   wrote in the tracking folder; context: the story's artifacts and what the agents of the
 *   other phases filled or wrote; patch: the changes since the run's base; files: the paths
 *   those changes touch; components: each component's stack, mocking strategy and contract
 *   testing choice, as the configuration gives them, and the gates that ran on it.
 * @typedef {{ path: RegExp, line: RegExp }} Trigger
 *   a lens with a trigger runs only when a changed path or a line the patch keeps matches.
 * @typedef {'haiku' | 'sonnet' | 'opus'} Family
 * @typedef {{ name: string, model: Family | null }} LensSpec
 * @typedef {{
 *   id: string, name: string, agent: string, inputs: readonly InputKind[], blind: boolean, trigger: Trigger | null, model: Family,
 * }} Lens
 *   id: the lens in the journal and the briefs, its name for a lens an agent answers;
 *   blind: the lens gets neither the story nor the feature scope.
 */

/** The model families a lens or the refuter runs on, weakest first. */
export const FAMILIES = Object.freeze(/** @type {Family[]} */ (['haiku', 'sonnet', 'opus']))
const SPEC = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:@(haiku|sonnet|opus))?$/

/**
 * A lens as a review node names it; null when the text is none.
 * @param {string} spec
 * @returns {LensSpec | null}
 */
export const readLensSpec = (spec) => {
  const match = SPEC.exec(spec)
  return match === null ? null : { name: match[1], model: /** @type {Family | undefined} */ (match[2]) ?? null }
}

/**
 * The family the refuter runs on: one above the strongest of the lenses it checks, opus at most.
 * @param {Family[]} models
 * @returns {Family}
 */
export const refuterFamily = (models) => FAMILIES[Math.min(FAMILIES.length - 1, Math.max(...models.map((model) => FAMILIES.indexOf(model))) + 1)]

/** The read-only agent that checks each blocker, high and medium finding before it counts. */
export const REFUTER = 'finding-refuter'

/** @param {string} name @returns {string} */
export const lensAgent = (name) => `${name}-lens`

const ALL = Object.freeze(/** @type {InputKind[]} */ (['outputs', 'context', 'patch', 'files']))
const DOCUMENTS = Object.freeze(/** @type {InputKind[]} */ (['outputs', 'context']))
const OWN_CHANGES = Object.freeze(/** @type {InputKind[]} */ (['outputs', 'patch', 'files']))
const CHANGES = Object.freeze(/** @type {InputKind[]} */ (['patch', 'files']))
const CHANGES_AND_COMPONENTS = Object.freeze(/** @type {InputKind[]} */ (['patch', 'files', 'components']))

/** @type {Trigger} */
const MOCKS = Object.freeze({
  path: /(^|\/)[^/]*(mock|stub|fake)[^/]*$/i,
  line: /\b(WireMock\w*|MockServer|Microcks\w*|Mountebank|HttpMessageHandler|nock|msw)\b/i,
})
/** @type {Trigger} */
const CONTRACTS = Object.freeze({
  path: /(^|\/)[^/]*contract[^/]*$|\.apiexamples$|\.apimetadata$|(^|\/)openapi[^/]*\.(ya?ml|json)$/i,
  line: /\bVerifyAsync\b|\bPact\w*|\bProviderVerifier|\bContractTest/,
})

/** The lenses that read less than everything. */
const KNOWN = /** @type {Readonly<Record<string, { inputs: readonly InputKind[], blind?: boolean, trigger?: Trigger }>>} */ (/** @type {unknown} */ (Object.freeze({
  __proto__: null,
  'architecture-compliance': { inputs: OWN_CHANGES },
  fitness: { inputs: DOCUMENTS },
  'business-alignment': { inputs: DOCUMENTS },
  testability: { inputs: OWN_CHANGES },
  'boundary-enforcement': { inputs: OWN_CHANGES },
  'architecture-boundaries': { inputs: Object.freeze(/** @type {InputKind[]} */ (['context', 'patch', 'files', 'components'])) },
  'cold-reader': { inputs: CHANGES, blind: true },
  'mock-fidelity': { inputs: CHANGES_AND_COMPONENTS, trigger: MOCKS },
  'contract-fidelity': { inputs: CHANGES_AND_COMPONENTS, trigger: CONTRACTS },
})))

/** A node's lens. @param {string} spec a valid lens spec @returns {Lens} */
const lensOf = (spec) => {
  const { name, model } = /** @type {LensSpec} */ (readLensSpec(spec))
  const known = KNOWN[name]
  return { id: name, name, agent: lensAgent(name), inputs: known?.inputs ?? ALL, blind: known?.blind === true, trigger: known?.trigger ?? null, model: model ?? FAMILIES[0] }
}

/**
 * The lenses of a review node that run on these changes: every lens without a trigger, and
 * each one whose trigger matches a changed path or a line the patch adds or keeps.
 * @param {string[]} specs in the node's order
 * @param {{ paths: string[], patch: string }} changes
 * @returns {Lens[]}
 */
export const planLenses = (specs, { paths, patch }) => {
  const lines = keptLines(patch)
  return specs.map(lensOf).filter(({ trigger }) => trigger === null || fires(trigger, paths, lines))
}

/** @param {Trigger} trigger @param {string[]} paths @param {string[]} lines */
const fires = (trigger, paths, lines) => paths.some((path) => trigger.path.test(path)) || lines.some((line) => trigger.line.test(line))

/** Added and context lines of a unified diff, not removed lines or file headers. @param {string} patch */
const keptLines = (patch) => patch.split('\n').filter((line) => (line.startsWith('+') && !line.startsWith('+++')) || line.startsWith(' '))
