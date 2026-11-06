import { bindsSteps, manifestsAmong, runnerNamed } from '../../domain/config/bdd-detection.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'

/**
 * Where a component's scenarios and their bindings sit, as `skraft init` finds them: one pair per
 * project whose manifest names a BDD runner and whose folders show both the `.feature` files and
 * the bindings that bind them. A project that names a runner but shows only one of the two gives
 * no pair, and `/skraft-init` asks for it: a half-guessed pair is worse than a question.
 *
 * @typedef {import('../ports/workspace.mjs').Workspace} Workspace
 * @typedef {import('../ports/workspace.mjs').WorkspaceEntry} WorkspaceEntry
 * @typedef {import('../../domain/config/skraft-config.mjs').BddPair} BddPair
 * @typedef {{ inner: string, runner: string }} FoundProject
 * @typedef {{ features: string | null, steps: string | null }} FoundPair
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
  /** @type {FoundProject[]} */
  const projects = []
  await projectsNaming(workspace, root, '', 0, projects)
  const pairs = await Promise.all(projects.map(({ inner, runner }) => pairIn(workspace, root, inner, runner)))
  return /** @type {BddPair[]} */ (pairs.filter((pair) => pair !== null))
}

/**
 * Adds the projects under `inner` whose manifest names a runner; a project below one of them is
 * its own, and a folder that is no folder any more holds none.
 * @param {Workspace} workspace @param {string} root @param {string} inner @param {number} depth
 * @param {FoundProject[]} projects
 */
const projectsNaming = async (workspace, root, inner, depth, projects) => {
  const entries = await workspace.list(joinRelative(root, inner))
  if (entries === null) return
  const runner = await runnerIn(workspace, root, inner, entries)
  if (runner !== null) {
    projects.push({ inner, runner })
    return
  }
  if (depth >= DEPTH) return
  for (const name of subfolders(entries)) await projectsNaming(workspace, root, joinRelative(inner, name), depth + 1, projects)
}

/**
 * The runner a folder's manifests name, null when none does.
 * @param {Workspace} workspace @param {string} root @param {string} inner @param {WorkspaceEntry[]} entries
 */
const runnerIn = async (workspace, root, inner, entries) => {
  const names = manifestsAmong(fileNames(entries))
  const texts = await Promise.all(names.map((name) => workspace.read(joinRelative(root, inner, name))))
  // Stryker disable next-line ConditionalExpression: a manifest a listing shows and a read answers nothing for — a dangling link — names no runner, exactly as one that names none
  const named = texts.map((text) => (text === null ? null : runnerNamed(text)))
  return named.find((runner) => runner !== null) ?? null
}

/**
 * The pair of one project: the folder its `.feature` files sit in and the folder that binds them,
 * the first of each that the walk meets. Null when the walk shows only one of the two.
 * @param {Workspace} workspace @param {string} root @param {string} project @param {string} runner
 * @returns {Promise<BddPair | null>}
 */
const pairIn = async (workspace, root, project, runner) => {
  /** @type {FoundPair} */
  const found = { features: null, steps: null }
  await seek(workspace, root, project, 0, found)
  if (found.features === null || found.steps === null) return null
  return { runner, features: found.features, steps: found.steps }
}

/**
 * @param {Workspace} workspace @param {string} root @param {string} inner a folder the walk listed
 * @param {number} depth @param {FoundPair} found
 */
const seek = async (workspace, root, inner, depth, found) => {
  const entries = /** @type {WorkspaceEntry[]} */ (await workspace.list(joinRelative(root, inner)))
  if (found.features === null && entries.some(isFeature)) found.features = inner
  if (found.steps === null && bindsSteps(lastName(inner))) found.steps = inner
  if (depth >= DEPTH) return
  for (const name of subfolders(entries)) await seek(workspace, root, joinRelative(inner, name), depth + 1, found)
}

/** Whether an entry holds scenarios. No folder is named like a `.feature` file. @param {WorkspaceEntry} entry */
const isFeature = ({ name }) => FEATURE.test(name)

/** The last segment of a folder path inside the root; the root itself, named '', binds nothing. @param {string} inner */
const lastName = (inner) => inner.slice(inner.lastIndexOf('/') + 1)

/** The names of a listing's files. @param {WorkspaceEntry[]} entries */
// Stryker disable next-line MethodExpression,ConditionalExpression: no listing shows a folder named like a manifest, so the files are every name a project is read from; the engine reads no folder, which the port rejects
const fileNames = (entries) => entries.filter(({ kind }) => kind === 'file').map(({ name }) => name)

/** Subfolder names, sorted, hidden folders and dependencies left out. @param {WorkspaceEntry[]} entries */
const subfolders = (entries) => entries.filter(walked).map(({ name }) => name).sort()

/** Whether the walk goes into an entry. @param {WorkspaceEntry} entry */
// Stryker disable next-line ConditionalExpression: list answers null for a file, so an entry of another kind shows the walk nothing either way; the kind only spares the call
const walked = ({ kind, name }) => kind === 'dir' && !name.startsWith('.') && name !== DEPENDENCIES
