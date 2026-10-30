import { joinRelative } from '../config/relative-path.mjs'

/**
 * What an agent node of the workflow produces and may change: the outputs it fills under the
 * tracking folder and the paths of the working copy it may write. The pipeline's own agents
 * have a role; a repository agent takes what its node declares (`outputs=`, `writes=`).
 *
 * @typedef {{ path: string, template: string | null }} OutputSpec
 *   path relative to the pipeline's tracking folder; `{date}` and `{slug}` filled at dispatch.
 * @typedef {'src' | 'tests'} ComponentPaths
 * @typedef {'cycle' | 'red' | 'kill' | null} TddMode
 *   cycle: each failing test commit, then the code that passes it; red: failing acceptance tests
 *   only, with the skeleton they call; kill: tests that kill surviving mutants, which pass on the
 *   code they test; null: no test commit.
 * @typedef {{ outputs: readonly OutputSpec[], writes: readonly string[], components: readonly ComponentPaths[], records: boolean, scan: boolean, tdd: TddMode, prose: boolean, proposal: boolean }} Role
 *   writes: paths relative to the working copy; components: which paths of every component of
 *   skraft-config.json the agent may write; records: the engine checks the DESIGN records
 *   (consistency matrix, ADR names and supersessions) its attempts leave;
 *   scan: the engine scans the code for its structural commitments before each attempt;
 *   tdd: how its commits drive the tests; prose: the engine checks the pull request prose its
 *   output holds (a summary line of at most 72 characters, no section left empty); proposal: it
 *   writes a proposal for surviving mutants in the file the engine creates, and changes no code.
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 */

/** @type {Readonly<Record<string, Role>>} */
const ROLES = Object.freeze({
  'solution-researcher': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'research/{date}/{slug}-research.md', template: 'research.template.md' })]),
    writes: Object.freeze([]),
    components: Object.freeze([]),
    records: false,
    scan: false,
    tdd: null,
    prose: false,
    proposal: false,
  }),
  'solution-architect': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/context-map.md', template: null })]),
    writes: Object.freeze(['docs/adr']),
    components: Object.freeze([]),
    records: true,
    scan: true,
    tdd: null,
    prose: false,
    proposal: false,
  }),
  // The acceptance designer commits failing tests only; the skeleton they call goes in the source paths.
  'acceptance-designer': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/test-plan-{slug}.md', template: null })]),
    writes: Object.freeze([]),
    components: Object.freeze(/** @type {ComponentPaths[]} */ (['src', 'tests'])),
    records: false,
    scan: false,
    tdd: 'red',
    prose: false,
    proposal: false,
  }),
  'software-engineer': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'changes/{date}/change-log.md', template: null })]),
    writes: Object.freeze([]),
    components: Object.freeze(/** @type {ComponentPaths[]} */ (['src', 'tests'])),
    records: false,
    scan: false,
    tdd: 'cycle',
    prose: false,
    proposal: false,
  }),
  // The pr-writer writes the prose of the pull request the publish node opens, nothing else.
  'pr-writer': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/pull-request-prose-{slug}.md', template: 'pull-request-prose.template.md' })]),
    writes: Object.freeze([]),
    components: Object.freeze([]),
    records: false,
    scan: false,
    tdd: null,
    prose: true,
    proposal: false,
  }),
})

/**
 * Whether the agent commits to the working copy: test and code commits, or the files its role
 * or its node lets it write outside the tracking folder.
 * @param {Role} role
 */
export const makesCommits = (role) => role.tdd !== null || role.writes.length > 0

/** The tracking folder of a pipeline, relative to the working copy. @param {string} slug */
export const trackingFolder = (slug) => `.copilot-tracking/skraft-plans/${slug}`

/** What an agent node marked proposal=true plays: its outputs are the proposals the engine creates per file. @type {Role} */
const PROPOSAL = Object.freeze({ outputs: Object.freeze([]), writes: Object.freeze([]), components: Object.freeze([]), records: false, scan: false, tdd: null, prose: false, proposal: true })

/**
 * The role an agent node plays: a proposal, else its agent's own, with the outputs and writes
 * its node declares taking over; a node that takes surviving mutants writes tests that kill them.
 * @param {WorkflowNode} node an agent node
 * @returns {Role}
 */
export const roleOf = (node) => (node.proposal ? PROPOSAL : ownRole(node))

/** @param {WorkflowNode} node an agent node @returns {Role} */
const ownRole = (node) => {
  const own = ROLES[/** @type {string} */ (node.agent)] ?? NO_ROLE
  return {
    ...own,
    outputs: node.outputs.length > 0 ? node.outputs.map((path) => ({ path, template: null })) : own.outputs,
    writes: [...own.writes, ...node.writes],
    tdd: node.each === 'survivor-file' ? 'kill' : own.tdd,
  }
}

/** What an agent with no role of its own (a repository agent) starts from. @type {Role} */
const NO_ROLE = Object.freeze({ outputs: Object.freeze([]), writes: Object.freeze([]), components: Object.freeze([]), records: false, scan: false, tdd: null, prose: false, proposal: false })

/**
 * Every path an agent may change, relative to the working copy: its pipeline's tracking
 * folder, its role's paths, and the source or test paths of each component.
 * @param {Role} role
 * @param {{ slug: string, components: readonly Component[] }} context
 */
export const allowedPaths = (role, { slug, components }) => [...new Set([
  trackingFolder(slug),
  ...role.writes.map((path) => joinRelative(path)),
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
