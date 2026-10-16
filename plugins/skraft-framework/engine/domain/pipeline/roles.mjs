import { joinRelative } from '../config/relative-path.mjs'

/**
 * What an agent node of the workflow produces and may change: the outputs it fills under the
 * tracking folder and the paths of the working copy it may write. The pipeline's own agents
 * have a role; a repository agent takes what its node declares (`outputs=`, `writes=`).
 *
 * @typedef {{ path: string, template: string | null }} OutputSpec
 *   path relative to the pipeline's tracking folder; `{date}` and `{slug}` filled at dispatch.
 * @typedef {'src' | 'tests'} ComponentPaths
 * @typedef {{ outputs: readonly OutputSpec[], writes: readonly string[], components: readonly ComponentPaths[] }} Role
 *   writes: paths relative to the working copy; components: which paths of every component of
 *   skraft-config.json the agent may write.
 * @typedef {import('../workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 */

/** @type {Readonly<Record<string, Role>>} */
const ROLES = Object.freeze({
  'solution-researcher': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'research/{date}/{slug}-research.md', template: 'research.template.md' })]),
    writes: Object.freeze([]),
    components: Object.freeze([]),
  }),
  'solution-architect': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/context-map.md', template: null })]),
    writes: Object.freeze(['docs/adr']),
    components: Object.freeze([]),
  }),
  'acceptance-designer': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'details/{date}/test-plan-{slug}.md', template: null })]),
    writes: Object.freeze([]),
    components: Object.freeze(/** @type {ComponentPaths[]} */ (['tests'])),
  }),
  'software-engineer': Object.freeze({
    outputs: Object.freeze([Object.freeze({ path: 'changes/{date}/change-log.md', template: null })]),
    writes: Object.freeze([]),
    components: Object.freeze(/** @type {ComponentPaths[]} */ (['src', 'tests'])),
  }),
})

/** The tracking folder of a pipeline, relative to the working copy. @param {string} slug */
export const trackingFolder = (slug) => `.copilot-tracking/skraft-plans/${slug}`

/**
 * The role an agent node plays: its agent's own, with the outputs and writes its node declares
 * taking over.
 * @param {WorkflowNode} node an agent node
 * @returns {Role}
 */
export const roleOf = (node) => {
  const own = ROLES[/** @type {string} */ (node.agent)]
  return {
    outputs: node.outputs.length > 0 ? node.outputs.map((path) => ({ path, template: null })) : own?.outputs ?? [],
    writes: [...(own?.writes ?? []), ...node.writes],
    components: own?.components ?? [],
  }
}

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
export const rootFiles = (role, components) => (role.components.length > 0 ? components.map((component) => component.root) : [])
