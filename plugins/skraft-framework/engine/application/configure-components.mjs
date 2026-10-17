import { CONFIG_FILE, isAbsolutePath, writeConfig } from '../domain/config/skraft-config.mjs'
import { componentName, detectProject } from '../domain/config/stack-detection.mjs'
import { joinRelative, normalizeRelative } from '../domain/config/relative-path.mjs'
import { loadConfig } from './bases.mjs'

/**
 * @typedef {import('./ports/workspace.mjs').Workspace} Workspace
 * @typedef {{ name: string, root: string, stack: string, paths: { src: string[], tests: string[] }, commands: Record<string, string> }} ProposedComponent
 * @typedef {{ ok: boolean, reason: string }} ConfigureOutcome
 */

const DEPTH = 3
/** Hidden folders are skipped too; build outputs hold no project marker within DEPTH. */
const DEPENDENCIES = 'node_modules'

/**
 * ConfigureComponents — `skraft init` without a slug: one component per project found in the
 * working copy and in the neighbour folders named, written to `skraft-config.json`. Components
 * already listed, and every other key of the file, stay as the developer wrote them.
 * @param {{ workspace: Workspace }} deps
 */
export const createConfigureComponents = ({ workspace }) => Object.freeze({
  /**
   * @param {{ workingCopyName: string, folders?: string[] }} request folders: neighbour
   *   folders to search too, relative to the working copy (`../payment-web`)
   * @returns {Promise<ConfigureOutcome>}
   */
  configure: async ({ workingCopyName, folders = [] }) => {
    const reading = await loadConfig({ workspace })
    if (!reading.ok) return reading
    for (const folder of folders) {
      const refused = isAbsolutePath(folder) ? 'is not relative to the working copy' : (await workspace.list(normalizeRelative(folder))) === null ? 'is not a folder' : null
      if (refused) return { ok: false, reason: `--add ${folder} ${refused}` }
    }
    const hasList = Array.isArray(reading.raw.components)
    const listed = hasList ? /** @type {Array<Record<string, unknown>>} */ (reading.raw.components) : []
    const roots = new Set(reading.config.components.map((component) => component.root))
    const names = new Set(reading.config.components.map((component) => component.name))
    /** @type {ProposedComponent[]} */
    const added = []
    for (const start of ['.', ...folders.map(normalizeRelative)]) {
      for (const found of await projectsUnder(workspace, start)) {
        if (roots.has(found.root)) continue
        roots.add(found.root)
        const name = unique(componentName(found.root === '.' ? workingCopyName : /** @type {string} */ (found.root.split('/').at(-1))), names)
        names.add(name)
        added.push({ name, root: found.root, stack: found.stack, paths: found.paths, commands: found.commands })
      }
    }
    if (added.length === 0 && hasList) return { ok: true, reason: `${CONFIG_FILE} already lists every project found (${listed.length} components)` }
    await workspace.write(CONFIG_FILE, writeConfig(reading.raw, [...listed, ...added]))
    return {
      ok: true,
      reason: added.length === 0 ? `no project found; ${CONFIG_FILE} lists no component` : `${CONFIG_FILE}: ${added.map((component) => `${component.name} (${component.stack}, ${component.root})`).join(', ')}`,
    }
  },
})

// Stryker disable next-line StringLiteral: the label is only compared with other families; any text that is not a stack name is the same family
const JS_FAMILY = 'js'
/** Stacks of one family share a project tree: a `.csproj` under a solution is that solution's. */
const familyOf = (/** @type {string} */ stack) => (['typescript', 'javascript', 'react'].includes(stack) ? JS_FAMILY : stack)

/**
 * The projects under a folder. A folder that is a project is one component; a folder under
 * it is another component only when its stack family differs (a React front under a .NET
 * solution).
 * @param {Workspace} workspace @param {string} start
 */
const projectsUnder = async (workspace, start) => {
  /** @type {Array<{ root: string } & import('../domain/config/stack-detection.mjs').Detected>} */
  const found = []
  /** @param {string} dir a folder, never a file @param {number} depth @param {string[]} families of the projects above */
  const visit = async (dir, depth, families) => {
    const entries = /** @type {import('./ports/workspace.mjs').WorkspaceEntry[]} */ (await workspace.list(dir))
    const readHere = (/** @type {string} */ name) => workspace.read(joinRelative(dir, name))
    /** @type {Record<string, string | null>} the only files detectProject reads */
    const texts = { 'package.json': await readHere('package.json'), 'pom.xml': await readHere('pom.xml') }
    const detected = detectProject({ entries, read: (name) => texts[name] ?? null })
    let below = families
    if (detected) {
      const family = familyOf(detected.stack)
      if (!families.includes(family)) {
        found.push({ root: dir, ...detected })
        below = [...families, family]
      }
    }
    if (depth >= DEPTH) return
    const folders = entries
      .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.') && entry.name !== DEPENDENCIES)
      .map((entry) => entry.name)
      .sort()
    for (const name of folders) await visit(joinRelative(dir, name), depth + 1, below)
  }
  // Stryker disable next-line ArrayDeclaration: no stack family is named "Stryker was here"
  await visit(start, 0, [])
  return found
}

/** @param {string} name @param {Set<string>} taken */
const unique = (name, taken) => {
  if (!taken.has(name)) return name
  let index = 2
  while (taken.has(`${name}-${index}`)) index += 1
  return `${name}-${index}`
}
