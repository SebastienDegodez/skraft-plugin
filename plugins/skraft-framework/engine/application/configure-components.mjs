import { CONFIG_FILE, isAbsolutePath, readConfig, writeConfig } from '../domain/config/skraft-config.mjs'
import { componentName, detectProject } from '../domain/config/stack-detection.mjs'
import { joinRelative, normalizeRelative } from '../domain/config/relative-path.mjs'

/**
 * @typedef {import('./ports/workspace.mjs').Workspace} Workspace
 * @typedef {{ name: string, root: string, stack: string, paths: { src: string[], tests: string[] }, commands: Record<string, string> }} ProposedComponent
 * @typedef {{ ok: boolean, written: boolean, added: ProposedComponent[], kept: number, reason: string }} ConfigureOutcome
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
    const reading = readConfig(await workspace.read(CONFIG_FILE))
    if (!reading.ok) return { ok: false, written: false, added: [], kept: 0, reason: `${CONFIG_FILE} is invalid: ${reading.errors.join('; ')}` }
    for (const folder of folders) {
      const refused = isAbsolutePath(folder) ? 'is not relative to the working copy' : (await workspace.list(normalizeRelative(folder))) === null ? 'is not a folder' : null
      if (refused) return { ok: false, written: false, added: [], kept: 0, reason: `--add ${folder} ${refused}` }
    }
    const listed = Array.isArray(reading.raw.components) ? /** @type {Array<Record<string, unknown>>} */ (reading.raw.components) : []
    const roots = new Set(reading.config.components.map((component) => component.root))
    const names = new Set(reading.config.components.map((component) => component.name))
    /** @type {ProposedComponent[]} */
    const added = []
    for (const start of ['.', ...folders.map(normalizeRelative)]) {
      for (const found of await projectsUnder(workspace, start)) {
        if (roots.has(found.root)) continue
        roots.add(found.root)
        const name = unique(componentName(found.root === '.' ? workingCopyName : found.root.split('/').at(-1) ?? ''), names)
        names.add(name)
        added.push({ name, root: found.root, stack: found.stack, paths: found.paths, commands: found.commands })
      }
    }
    const kept = listed.length
    if (added.length === 0 && reading.present && Array.isArray(reading.raw.components)) {
      return { ok: true, written: false, added, kept, reason: `${CONFIG_FILE} already lists every project found (${kept} components)` }
    }
    await workspace.write(CONFIG_FILE, writeConfig(reading.raw, [...listed, ...added]))
    return {
      ok: true,
      written: true,
      added,
      kept,
      reason: added.length === 0 ? `no project found; ${CONFIG_FILE} lists no component` : `${CONFIG_FILE}: ${added.map((component) => `${component.name} (${component.stack}, ${component.root})`).join(', ')}`,
    }
  },
})

/** Stacks of one family share a project tree: a `.csproj` under a solution is that solution's. */
const familyOf = (/** @type {string} */ stack) => (['typescript', 'javascript', 'react'].includes(stack) ? 'js' : stack)

/**
 * The projects under a folder. A folder that is a project is one component; a folder under
 * it is another component only when its stack family differs (a React front under a .NET
 * solution).
 * @param {Workspace} workspace @param {string} start
 */
const projectsUnder = async (workspace, start) => {
  /** @type {Array<{ root: string } & import('../domain/config/stack-detection.mjs').Detected>} */
  const found = []
  /** @param {string} dir @param {number} depth @param {string[]} families of the projects above */
  const visit = async (dir, depth, families) => {
    const entries = await workspace.list(dir)
    if (entries === null) return
    /** @type {Map<string, string | null>} */
    const texts = new Map()
    for (const name of ['package.json', 'pom.xml']) {
      if (entries.some((entry) => entry.kind === 'file' && entry.name === name)) texts.set(name, await workspace.read(joinRelative(dir, name)))
    }
    const detected = detectProject({ entries, read: (name) => texts.get(name) ?? null })
    const family = detected ? familyOf(detected.stack) : null
    if (detected && family !== null && !families.includes(family)) found.push({ root: dir, ...detected })
    if (depth >= DEPTH) return
    const folders = entries
      .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.') && entry.name !== DEPENDENCIES)
      .map((entry) => entry.name)
      .sort()
    const below = family !== null && !families.includes(family) ? [...families, family] : families
    for (const name of folders) await visit(joinRelative(dir, name), depth + 1, below)
  }
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
