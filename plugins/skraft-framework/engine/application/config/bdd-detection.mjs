import { bindsSteps, manifestsAmong, runnerNamed } from '../../domain/config/bdd-detection.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'

/**
 * Where a component's scenarios and their bindings sit, as `skraft init` finds them: one pair per
 * project whose manifest names a BDD runner and whose folders show both the `.feature` files and
 * the bindings that runner reads. A project that names a runner but shows only one of the two
 * gives no pair, and `/skraft-init` asks for it: a half-guessed pair is worse than a question.
 *
 * @typedef {import('../ports/workspace.mjs').Workspace} Workspace
 * @typedef {import('../ports/workspace.mjs').WorkspaceEntry} WorkspaceEntry
 * @typedef {import('../../domain/config/skraft-config.mjs').BddPair} BddPair
 */

/** How far below a component root a project sits, and how far below a project its folders sit. */
const DEPTH = 4
const FEATURE = /\.feature$/i
const DEPENDENCIES = 'node_modules'

/**
 * @param {Workspace} workspace @param {string} root the component's, relative to the working copy
 * @returns {Promise<BddPair[]>} the pairs found, their folders relative to the component root
 */
export const bddPairs = async (workspace, root) => {
  const projects = await projectsNaming(workspace, root, '', 0)
  const pairs = await Promise.all(projects.map(({ inner, runner }) => pairIn(workspace, root, inner, runner)))
  return /** @type {BddPair[]} */ (pairs.filter((pair) => pair !== null))
}

/** The workspace path of a folder inside the component root. @param {string} root @param {string} inner */
const at = (root, inner) => (inner === '' ? root : joinRelative(root, inner))

/**
 * The projects under `inner` whose manifest names a runner; a project below one of them is its own.
 * @param {Workspace} workspace @param {string} root @param {string} inner @param {number} depth
 * @returns {Promise<Array<{ inner: string, runner: string }>>}
 */
const projectsNaming = async (workspace, root, inner, depth) => {
  const entries = await workspace.list(at(root, inner))
  if (entries === null) return []
  const runner = await runnerIn(workspace, root, inner, entries)
  if (runner !== null) return [{ inner, runner }]
  if (depth >= DEPTH) return []
  const below = subfolders(entries).map((name) => projectsNaming(workspace, root, joinRelative(inner, name), depth + 1))
  return (await Promise.all(below)).flat()
}

/** The runner a folder's manifests name, null when none does. @param {Workspace} workspace @param {string} root @param {string} inner @param {WorkspaceEntry[]} entries */
const runnerIn = async (workspace, root, inner, entries) => {
  const names = manifestsAmong(entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name))
  const texts = await Promise.all(names.map((name) => workspace.read(joinRelative(at(root, inner), name))))
  return texts.map((text) => (text === null ? null : runnerNamed(text))).find((runner) => runner !== null) ?? null
}

/**
 * The pair of one project: the folder its `.feature` files sit in and the folder its runner binds
 * them in, the first of each that the walk meets. Null when the walk shows only one of the two.
 * @param {Workspace} workspace @param {string} root @param {string} project @param {string} runner
 * @returns {Promise<BddPair | null>}
 */
const pairIn = async (workspace, root, project, runner) => {
  /** @type {{ features: string | null, steps: string | null }} */
  const found = { features: null, steps: null }
  await seek(workspace, root, project, runner, 0, found)
  if (found.features === null || found.steps === null) return null
  return { runner, features: found.features, steps: found.steps }
}

/**
 * @param {Workspace} workspace @param {string} root @param {string} inner @param {string} runner
 * @param {number} depth @param {{ features: string | null, steps: string | null }} found
 */
const seek = async (workspace, root, inner, runner, depth, found) => {
  const entries = await workspace.list(at(root, inner))
  if (entries === null) return
  if (found.features === null && entries.some(isFeature)) found.features = inner
  if (found.steps === null && bindsSteps(runner, lastName(inner))) found.steps = inner
  if (depth >= DEPTH) return
  for (const name of subfolders(entries)) await seek(workspace, root, joinRelative(inner, name), runner, depth + 1, found)
}

/** @param {WorkspaceEntry} entry */
const isFeature = (entry) => entry.kind === 'file' && FEATURE.test(entry.name)

/** The last segment of a folder path inside the root; the root itself binds nothing. @param {string} inner */
const lastName = (inner) => inner.split('/').at(-1) ?? ''

/** Subfolder names, sorted, hidden folders and dependencies left out. @param {WorkspaceEntry[]} entries */
const subfolders = (entries) => entries
  .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.') && entry.name !== DEPENDENCIES)
  .map((entry) => entry.name)
  .sort()
