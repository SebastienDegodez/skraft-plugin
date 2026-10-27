import { componentName, detectProject } from '../../domain/config/stack-detection.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'

/**
 * The projects a working copy holds, as `skraft init` detects them: one component per project,
 * named after its folder.
 *
 * @typedef {import('../ports/workspace.mjs').Workspace} Workspace
 * @typedef {import('../ports/workspace.mjs').WorkspaceEntry} WorkspaceEntry
 * @typedef {import('../../domain/config/stack-detection.mjs').Detected} Detected
 * @typedef {{ root: string } & Detected} FoundProject
 * @typedef {{ name: string, root: string, stack: string, paths: { src: string[], tests: string[] }, commands: Record<string, string> }} ProposedComponent
 */

const DEPTH = 3
/** Hidden folders are skipped too; build outputs hold no project marker within DEPTH. */
const DEPENDENCIES = 'node_modules'

/**
 * The projects under the starts whose root no component holds yet, each named after its folder
 * with a name no component holds yet.
 * @param {Workspace} workspace @param {string[]} starts
 * @param {Array<{ name: string, root: string }>} components already listed @param {string} workingCopyName
 * @returns {Promise<ProposedComponent[]>}
 */
export const newComponents = async (workspace, starts, components, workingCopyName) => {
  const roots = new Set(components.map((component) => component.root))
  const names = new Set(components.map((component) => component.name))
  /** @type {ProposedComponent[]} */
  const added = []
  for (const found of await projectsUnder(workspace, starts)) {
    if (roots.has(found.root)) continue
    roots.add(found.root)
    const name = claimName(componentName(folderName(found.root, workingCopyName)), names)
    added.push({ name, root: found.root, stack: found.stack, paths: found.paths, commands: found.commands })
  }
  return added
}

/** @param {string} root @param {string} workingCopyName the name of the folder `.` */
const folderName = (root, workingCopyName) => (root === '.' ? workingCopyName : /** @type {string} */ (root.split('/').at(-1)))

/** The name, or the first free `name-2`, `name-3`…; taken from then on. @param {string} name @param {Set<string>} taken */
const claimName = (name, taken) => {
  let claimed = name
  for (let index = 2; taken.has(claimed); index += 1) claimed = `${name}-${index}`
  taken.add(claimed)
  return claimed
}

// Stryker disable next-line StringLiteral: the label is only compared with other families; any text that is not a stack name is the same family
const JS_FAMILY = 'js'
/** Stacks of one family share a project tree: a `.csproj` under a solution is that solution's. */
const familyOf = (/** @type {string} */ stack) => (['typescript', 'javascript', 'react'].includes(stack) ? JS_FAMILY : stack)

/**
 * The projects under each start folder, in turn. A folder that is a project is one component; a
 * folder under it is another component only when its stack family differs (a React front under
 * a .NET solution).
 * @param {Workspace} workspace @param {string[]} starts
 */
const projectsUnder = async (workspace, starts) => {
  /** @type {FoundProject[]} */
  const found = []
  // Stryker disable next-line ArrayDeclaration: no stack family is named "Stryker was here"
  for (const start of starts) await visit(workspace, start, 0, [], found)
  return found
}

/**
 * Adds the project in `dir` to `found`, then those in its subfolders down to DEPTH.
 * @param {Workspace} workspace @param {string} dir a folder, never a file @param {number} depth
 * @param {string[]} families of the projects above @param {FoundProject[]} found
 */
const visit = async (workspace, dir, depth, families, found) => {
  const entries = /** @type {WorkspaceEntry[]} */ (await workspace.list(dir))
  const detected = await detectAt(workspace, dir, entries)
  const family = newFamily(detected, families)
  let below = families
  if (family) {
    found.push({ root: dir, .../** @type {Detected} */ (detected) })
    below = [...families, family]
  }
  if (depth >= DEPTH) return
  for (const name of subfolders(entries)) await visit(workspace, joinRelative(dir, name), depth + 1, below, found)
}

/** The project whose markers sit in `dir`, or null. @param {Workspace} workspace @param {string} dir @param {WorkspaceEntry[]} entries */
const detectAt = async (workspace, dir, entries) => {
  const readHere = (/** @type {string} */ name) => workspace.read(joinRelative(dir, name))
  /** @type {Record<string, string | null>} the only files detectProject reads */
  const texts = { 'package.json': await readHere('package.json'), 'pom.xml': await readHere('pom.xml') }
  return detectProject({ entries, read: (name) => texts[name] ?? null })
}

/** The family of the project detected, or null when none is or one of its family sits above. @param {Detected | null} detected @param {string[]} families */
const newFamily = (detected, families) => {
  if (!detected) return null
  const family = familyOf(detected.stack)
  return families.includes(family) ? null : family
}

/** Subfolder names, sorted, hidden folders and dependencies left out. @param {WorkspaceEntry[]} entries */
const subfolders = (entries) => entries
  .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.') && entry.name !== DEPENDENCIES)
  .map((entry) => entry.name)
  .sort()
