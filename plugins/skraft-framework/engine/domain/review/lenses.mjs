/**
 * The lenses a review node runs and what each one reads. A lens `<name>` is the agent
 * `<name>-lens`; a lens skraft does not know (one a repository adds) reads everything a
 * review prepares.
 *
 * @typedef {'overview' | 'outputs' | 'context' | 'patch' | 'files' | 'components'} InputKind
 *   overview: the review's shared context (story, project rules, who wrote which document), read
 *   by every lens but a blind one; outputs: what the agents of the review's phase filled or
 *   wrote in the tracking folder; context: the story's artifacts and what the agents of the
 *   other phases filled or wrote; patch: the changes since the run's base; files: the paths
 *   those changes touch; components: each component's stack, mocking strategy and contract
 *   testing choice, as the configuration gives them.
 * @typedef {{ path: RegExp, line: RegExp }} Trigger
 *   a lens with a trigger runs only when a changed path or a line the patch keeps matches.
 * @typedef {{ name: string, agent: string, inputs: readonly InputKind[], blind: boolean, trigger: Trigger | null }} Lens
 *   blind: the lens gets neither the story nor the feature scope.
 */

/** The read-only agent that checks each blocker and high finding before it counts. */
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
  'architecture-boundaries': { inputs: Object.freeze(/** @type {InputKind[]} */ (['context', 'patch', 'files'])) },
  'cold-reader': { inputs: CHANGES, blind: true },
  'mock-fidelity': { inputs: CHANGES_AND_COMPONENTS, trigger: MOCKS },
  'contract-fidelity': { inputs: CHANGES_AND_COMPONENTS, trigger: CONTRACTS },
})))

/** @param {string} name @returns {Lens} */
const lensOf = (name) => {
  const known = KNOWN[name]
  return { name, agent: lensAgent(name), inputs: known?.inputs ?? ALL, blind: known?.blind === true, trigger: known?.trigger ?? null }
}

/**
 * The lenses of a review node that run on these changes: every lens without a trigger, and
 * each one whose trigger matches a changed path or a line the patch adds or keeps.
 * @param {string[]} names in the node's order
 * @param {{ paths: string[], patch: string }} changes
 * @returns {Lens[]}
 */
export const planLenses = (names, { paths, patch }) => {
  const lines = keptLines(patch)
  return names.map(lensOf).filter(({ trigger }) => trigger === null || fires(trigger, paths, lines))
}

/** @param {Trigger} trigger @param {string[]} paths @param {string[]} lines */
const fires = (trigger, paths, lines) => paths.some((path) => trigger.path.test(path)) || lines.some((line) => trigger.line.test(line))

/** Added and context lines of a unified diff, not removed lines or file headers. @param {string} patch */
const keptLines = (patch) => patch.split('\n').filter((line) => (line.startsWith('+') && !line.startsWith('+++')) || line.startsWith(' '))
