import { FAMILY } from '../config/model-assignment.mjs'

/**
 * The lenses a review node runs and what each one reads. A lens `<name>` is the agent
 * `<name>-lens`; a lens skraft does not know (one a repository adds) reads everything a
 * review prepares. A node names a lens `<name>`, optionally followed by `@<family>` for the
 * model family it runs on in a workflow the repository ejected; the configuration's `assign`
 * decides the family each lens runs on (`model-assignment.mjs`).
 *
 * @typedef {'overview' | 'outputs' | 'context' | 'patch' | 'files' | 'components'} InputKind
 *   overview: the review's shared context (story, project rules, who wrote which document), read
 *   by every lens but a blind one; outputs: what the agents of the review's phase filled or
 *   wrote in the tracking folder; context: the story's artifacts and what the agents of the
 *   other phases filled or wrote; patch: the changes since the run's base; files: the paths
 *   those changes touch; components: each component's stack, mocking strategy and contract
 *   testing choice, as the configuration gives them, and the gates that passed on it in this run.
 * @typedef {{ path: RegExp, line: RegExp }} Trigger
 *   a lens with a trigger runs only when a changed path or a line the patch keeps matches.
 * @typedef {string} Family a kebab-case word: economy, reviewer, gpt-codex…
 * @typedef {{ name: string, model: Family | null }} LensSpec
 * @typedef {{
 *   id: string, name: string, agent: string, inputs: readonly InputKind[], blind: boolean, trigger: Trigger | null, model: Family | null,
 * }} Lens
 *   id: the lens in the journal and the briefs, its name for a lens an agent answers;
 *   blind: the lens gets neither the story nor the feature scope; model: the family it runs on,
 *   null when the host decides.
 */

export { FAMILY }
const SPEC = new RegExp(`^([a-z0-9]+(?:-[a-z0-9]+)*)(?:@(${FAMILY.source.slice(1, -1)}))?$`)

/**
 * A lens as a review node names it; null when the text is none.
 * @param {string} spec
 * @returns {LensSpec | null}
 */
export const readLensSpec = (spec) => {
  const match = SPEC.exec(spec)
  return match === null ? null : { name: match[1], model: /** @type {Family | undefined} */ (match[2]) ?? null }
}

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

/**
 * A node's lens, on the family the configuration assigns it.
 * @param {string} spec a valid lens spec @param {FamilyOf} familyOf @returns {Lens}
 */
const lensOf = (spec, familyOf) => {
  const { name, model } = /** @type {LensSpec} */ (readLensSpec(spec))
  const known = KNOWN[name]
  const agent = lensAgent(name)
  return { id: name, name, agent, inputs: known?.inputs ?? ALL, blind: known?.blind === true, trigger: known?.trigger ?? null, model: familyOf({ agent, named: model }) }
}

/**
 * @typedef {(lens: { agent: string, named: Family | null }) => Family | null} FamilyOf
 *   the family a lens runs on, from its agent and the family its spec names.
 */

/**
 * The lenses of a review node that run on these changes: every lens without a trigger, and
 * each one whose trigger matches a changed path or a line the patch adds or keeps.
 * @param {{ specs: string[], familyOf: FamilyOf }} node its lenses in order, and the family each runs on
 * @param {{ paths: string[], patch: string }} changes
 * @returns {Lens[]}
 */
export const planLenses = ({ specs, familyOf }, { paths, patch }) => {
  const lines = keptLines(patch)
  return specs.map((spec) => lensOf(spec, familyOf)).filter(({ trigger }) => trigger === null || fires(trigger, paths, lines))
}

/** @param {Trigger} trigger @param {string[]} paths @param {string[]} lines */
const fires = (trigger, paths, lines) => paths.some((path) => trigger.path.test(path)) || lines.some((line) => trigger.line.test(line))

/** Added and context lines of a unified diff, not removed lines or file headers. @param {string} patch */
const keptLines = (patch) => patch.split('\n').filter((line) => (line.startsWith('+') && !line.startsWith('+++')) || line.startsWith(' '))
