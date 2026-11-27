import { featuresFolders } from '../config/bdd-folders.mjs'
import { joinRelative } from '../config/relative-path.mjs'

/**
 * What an agent node of the workflow produces and may change: the outputs it fills under the
 * tracking folder and the paths of the working copy it may write. The pipeline's own agents
 * have a role; a repository agent takes what its node declares (`outputs=`, `writes=`).
 *
 * @typedef {{ path: string, template: string | null }} OutputSpec
 *   path relative to the pipeline's tracking folder; `{date}` and `{slug}` filled at dispatch.
 *   template: a file of the plugin's templates, `{language}` filled with the story's at dispatch.
 * @typedef {'src' | 'tests'} ComponentPaths
 * @typedef {'cycle' | 'red' | null} TddMode
 *   cycle: each failing test commit, then the code that passes it; red: failing acceptance tests
 *   only, with the skeleton they call; null: no test commit.
 * @typedef {{ outputs: readonly OutputSpec[], writes: readonly string[], components: readonly ComponentPaths[], records: boolean, scan: boolean, tdd: TddMode, prose: boolean, files?: readonly string[], shell?: boolean, citations?: boolean, scenarios?: boolean }} Role
 *   writes: folders relative to the working copy; files: files at the working copy's root the role
 *   may change, never created as folders; components: which paths of every component of
 *   skraft-config.json the agent may write; records: the engine checks the DESIGN records
 *   (consistency matrix, ADR names and supersessions) its attempts leave;
 *   scan: the engine scans the code for its structural commitments before each attempt;
 *   citations: the engine checks the citations of the research document its attempts leave;
 *   scenarios: the agent writes the story's scenarios, in the folders the components' bdd names;
 *   tdd: how its commits drive the tests; prose: the engine checks the pull request prose its
 *   output holds (a summary line of at most 72 characters, no section left empty);
 *   shell: false when its descriptor grants no shell: the engine commits its changes once its step
 *   is done; any other agent, a repository agent included, commits its own.
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 */

/** What the agent that delivers a story's code in DELIVER plays. @type {Role} */
const DELIVERING = Object.freeze({
  outputs: Object.freeze([Object.freeze({ path: 'changes/{date}/change-log.md', template: null })]),
  writes: Object.freeze([]),
  components: Object.freeze(/** @type {ComponentPaths[]} */ (['src', 'tests'])),
  records: false,
  scan: false,
  tdd: 'cycle',
  prose: false,
  shell: true,
})

/** @type {Readonly<Record<string, Role>>} */
const ROLES = Object.freeze({
  'solution-researcher': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'research/{date}/{slug}-research.md', template: 'research.template.md' })]),
    writes: Object.freeze([]),
    components: Object.freeze([]),
    records: false,
    citations: true,
    scan: false,
    tdd: null,
    prose: false,
    shell: false,
  }),
  // The architect keeps the repository's durable design documents under docs/ and the project's
  // ARCHITECTURE.md, CONTRIBUTING.md and AGENTS.md; the consistency matrix of the story stays in the tracking folder.
  'solution-architect': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/consistency-matrix-{slug}.md', template: null })]),
    writes: Object.freeze(['docs/adr', 'docs/architecture', 'docs/domain/event-model']),
    files: Object.freeze(['ARCHITECTURE.md', 'CONTRIBUTING.md', 'AGENTS.md']),
    components: Object.freeze([]),
    records: true,
    scan: true,
    tdd: null,
    prose: false,
    shell: false,
  }),
  // The acceptance designer commits failing tests only; the skeleton they call goes in the source
  // paths, its Gherkin scenarios in the folders the components' bdd names.
  'acceptance-designer': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/test-plan-{slug}.md', template: null })]),
    writes: Object.freeze([]),
    components: Object.freeze(/** @type {ComponentPaths[]} */ (['src', 'tests'])),
    records: false,
    scan: false,
    scenarios: true,
    tdd: 'red',
    prose: false,
    shell: true,
  }),
  'software-engineer': DELIVERING,
  // The pr-writer writes the prose of the pull request the publish node opens, nothing else.
  'pr-writer': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/pull-request-prose-{slug}.md', template: 'pull-request-prose.{language}.template.md' })]),
    writes: Object.freeze([]),
    components: Object.freeze([]),
    records: false,
    scan: false,
    tdd: null,
    prose: true,
    shell: false,
  }),
})

/** The skills whose gates the review of an agent's phase judges its outputs by, by agent. */
const CHECKLISTS = /** @type {Readonly<Record<string, readonly string[]>>} */ (Object.freeze({ 'acceptance-designer': Object.freeze(['acceptance-review-coverage', 'acceptance-review-business-alignment', 'acceptance-review-testability', 'acceptance-review-boundary-enforcement']) }))

/**
 * The skills an agent checks its outputs against before its result: the gates the review of its
 * phase judges them by; none for an agent whose review names none.
 * @param {string} agent
 */
// Stryker disable next-line ArrayDeclaration: a name that is no skill id is found nowhere, so it adds no line, as no name does
export const checklistsOf = (agent) => CHECKLISTS[agent] ?? []

/**
 * Whether the agent commits to the working copy itself: any but one marked with no shell. The
 * engine commits what an agent with none changes outside the tracking folder.
 * @param {Role} role
 */
export const makesCommits = (role) => role.shell !== false

/**
 * The tracking folder of a run, relative to the working copy.
 * @param {string} slug @param {string} [folder] where the runs' folders are, the pipelines' unless given
 */
export const trackingFolder = (slug, folder = '.copilot-tracking/skraft-plans') => `${folder}/${slug}`

/**
 * The role an agent node plays: its agent's own, with the outputs and writes its node declares taking over.
 * @param {WorkflowNode} node an agent node
 * @returns {Role}
 */
export const roleOf = (node) => ownRole(node)

/** @param {WorkflowNode} node an agent node @returns {Role} */
const ownRole = (node) => {
  const own = ROLES[/** @type {string} */ (node.agent)] ?? NO_ROLE
  return {
    ...own,
    outputs: node.outputs.length > 0 ? node.outputs.map((path) => ({ path, template: null })) : own.outputs,
    writes: [...own.writes, ...node.writes],
  }
}

/**
 * Whether the node's agent writes the story's scenarios, their groups and the failing acceptance
 * tests of every scenario: the acceptance designer, dispatched once.
 * @param {WorkflowNode} node
 */
export const writesScenarios = (node) => node.kind === 'agent' && ownRole(node).scenarios === true

/**
 * Whether the node's agent delivers the story's code, every group of scenarios in one pass: the
 * software engineer.
 * @param {WorkflowNode} node
 */
export const delivers = (node) => node.kind === 'agent' && ROLES[/** @type {string} */ (node.agent)] === DELIVERING

/**
 * The node of a workflow that writes the story's scenarios, null when it has none.
 * @param {{ nodes: Record<string, WorkflowNode>, order: string[] }} workflow
 */
export const scenarioWriter = ({ nodes, order }) => order.find((id) => writesScenarios(nodes[id])) ?? null

/**
 * The folders the engine creates before an attempt of an agent node, so that an agent whose
 * tools only create files in existing folders can write on a repository that has none yet: the
 * folders its plugin role writes in, and the folders the components keep their scenarios in when
 * the role writes them. A node's own `writes=` may name files, so it adds none.
 * @param {WorkflowNode} node an agent node @param {readonly Component[]} components
 * @returns {readonly string[]}
 */
export const roleFolders = (node, components) => {
  const role = ROLES[/** @type {string} */ (node.agent)] ?? NO_ROLE
  return [...role.writes, ...(role.scenarios ? featuresFolders(components) : [])]
}

/** What an agent with no role of its own (a repository agent) starts from. @type {Role} */
const NO_ROLE = Object.freeze({ outputs: Object.freeze([]), writes: Object.freeze([]), components: Object.freeze([]), records: false, scan: false, tdd: null, prose: false })

/**
 * Every path an agent may change, relative to the working copy: its run's tracking folder,
 * its role's paths, and the source or test paths of each component.
 * @param {Role} role
 * @param {{ slug: string, folder: string, components: readonly Component[] }} context folder: where the runs' folders are
 */
export const allowedPaths = (role, { slug, folder, components }) => [...new Set([
  trackingFolder(slug, folder),
  ...[...role.writes, ...(role.files ?? [])].map((path) => joinRelative(path)),
  ...(role.scenarios ? featuresFolders(components) : []),
  ...components.flatMap((component) => role.components.flatMap((kind) => component.paths[kind].map((path) => joinRelative(component.root, path)))),
])]

/**
 * The component roots whose own files (a solution, a manifest, a lock file) an agent may change:
 * those of every component whose source or test paths it writes.
 * @param {Role} role
 * @param {readonly Component[]} components
 */
// Stryker disable next-line ArrayDeclaration: no changed file sits right in a folder named like the placeholder
export const rootFiles = (role, components) => (role.components.length > 0 ? components.map((component) => component.root) : [])
