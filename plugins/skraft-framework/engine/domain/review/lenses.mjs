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
 * @typedef {'mock' | 'contract'} TriggerName what a lens node's `when=` names
 * @typedef {string} Family a kebab-case word: economy, reviewer, gpt-codex…
 * @typedef {{ name: string, model: Family | null }} LensSpec
 * @typedef {{
 *   id: string, name: string, agent: string, inputs: readonly InputKind[], blind: boolean,
 * }} Lens
 *   id: the lens in the journal and the briefs, its name for a lens an agent answers;
 *   blind: the lens gets neither the story nor the feature scope.
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

/** The triggers a lens node names with `when=`. @type {Readonly<Record<TriggerName, Trigger>>} */
const TRIGGERS = Object.freeze({ mock: MOCKS, contract: CONTRACTS })

/** @type {readonly TriggerName[]} */
export const TRIGGER_NAMES = Object.freeze(/** @type {TriggerName[]} */ (Object.keys(TRIGGERS)))

/** The lenses that read less than everything. */
const KNOWN = /** @type {Readonly<Record<string, { inputs: readonly InputKind[], blind?: boolean }>>} */ (/** @type {unknown} */ (Object.freeze({
  __proto__: null,
  'architecture-compliance': { inputs: OWN_CHANGES },
  fitness: { inputs: DOCUMENTS },
  'business-alignment': { inputs: DOCUMENTS },
  testability: { inputs: OWN_CHANGES },
  'boundary-enforcement': { inputs: OWN_CHANGES },
  'architecture-boundaries': { inputs: Object.freeze(/** @type {InputKind[]} */ (['context', 'patch', 'files', 'components'])) },
  'cold-reader': { inputs: CHANGES, blind: true },
  'mock-fidelity': { inputs: CHANGES_AND_COMPONENTS },
  'contract-fidelity': { inputs: CHANGES_AND_COMPONENTS },
})))

/**
 * A node's lens.
 * @param {string} spec a valid lens spec @returns {Lens}
 */
const lensOf = (spec) => {
  const { name } = /** @type {LensSpec} */ (readLensSpec(spec))
  const known = KNOWN[name]
  return { id: name, name, agent: lensAgent(name), inputs: known?.inputs ?? ALL, blind: known?.blind === true }
}

/**
 * The lenses of a review node that run on these changes: every lens without a trigger, and
 * each one whose trigger matches a changed path or a line the patch adds or keeps.
 * @param {Array<{ lens: string, when: TriggerName | null }>} branches the node's lenses in order, each with its trigger
 * @param {{ paths: string[], patch: string }} changes
 * @returns {Lens[]}
 */
export const planLenses = (branches, { paths, patch }) => {
  const lines = keptLines(patch)
  return branches.filter(({ when }) => when === null || fires(TRIGGERS[when], paths, lines)).map(({ lens }) => lensOf(lens))
}

/** @param {Trigger} trigger @param {string[]} paths @param {string[]} lines */
const fires = (trigger, paths, lines) => paths.some((path) => trigger.path.test(path)) || lines.some((line) => trigger.line.test(line))

/** Added and context lines of a unified diff, not removed lines or file headers. @param {string} patch */
const keptLines = (patch) => patch.split('\n').filter((line) => (line.startsWith('+') && !line.startsWith('+++')) || line.startsWith(' '))
