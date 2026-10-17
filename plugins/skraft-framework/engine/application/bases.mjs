import { CONFIG_FILE, isRef, readConfig } from '../domain/config/skraft-config.mjs'

/**
 * @typedef {import('../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {'flag' | 'component' | 'config' | 'default'} BaseSource
 * @typedef {{ component: string | null, root: string, repository: string, ref: string, source: BaseSource, sha: string }} Base
 *   component null: the working copy that holds the tracking folder. ref: the ref the merge
 *   base was taken with (`main`, `origin/main`, `develop`).
 */

const DEFAULT_BASE_BRANCH = 'main'

/**
 * The developer configuration, read and checked; raw: the object as written, {} when absent.
 * @param {{ workspace: import('./ports/workspace.mjs').ConfigSource }} deps
 * @returns {Promise<{ ok: true, config: SkraftConfig, present: boolean, raw: Record<string, unknown> } | { ok: false, reason: string }>}
 */
export const loadConfig = async ({ workspace }) => {
  const reading = readConfig(await workspace.read(CONFIG_FILE))
  return reading.ok ? reading : { ok: false, reason: `${CONFIG_FILE} is invalid: ${reading.errors.join('; ')}` }
}

/**
 * The base of the working copy and of each component, each in its own repository:
 * `git merge-base HEAD <ref>`, ref = `--base` > component `baseBranch` > global `baseBranch`
 * > `main`; `origin/<ref>` when the ref is not a local branch. A folder in no repository has
 * no base. Components need Git itself: a host that cannot run it is refused.
 * @param {{ sourceControl: import('./ports/source-control.mjs').SourceControl }} deps
 * @param {{ config: SkraftConfig, flag: unknown }} request flag: `--base` as received, null when absent
 * @returns {Promise<{ ok: true, bases: Base[] } | { ok: false, code: 'invalid-base' | 'base-unresolved' | 'source-control-unavailable', reason: string }>}
 */
export const resolveBases = async ({ sourceControl }, { config, flag }) => {
  if (flag !== null && !isRef(flag)) return { ok: false, code: 'invalid-base', reason: `--base must be a git ref, got ${JSON.stringify(flag)}` }
  const targets = [
    { component: null, root: '.', branch: null },
    ...config.components.map((component) => ({ component: component.name, root: component.root, branch: component.baseBranch })),
  ]
  if (config.components.length > 0) {
    const unavailable = await sourceControl.unavailable()
    if (unavailable !== null) {
      return { ok: false, code: 'source-control-unavailable', reason: `${unavailable}; the components of ${CONFIG_FILE} need Git for their base` }
    }
  }
  /** @type {Base[]} */
  const bases = []
  /** @type {string[]} */
  const unresolved = []
  for (const { component, root, branch } of targets) {
    const repository = await sourceControl.repository(root)
    if (repository === null) continue
    const [ref, source] = flag ? [flag, 'flag'] : branch ? [branch, 'component'] : config.baseBranch ? [config.baseBranch, 'config'] : [DEFAULT_BASE_BRANCH, 'default']
    const local = await sourceControl.mergeBase(root, ref)
    const [used, sha] = local === null ? [`origin/${ref}`, await sourceControl.mergeBase(root, `origin/${ref}`)] : [ref, local]
    if (sha === null) {
      unresolved.push(`${component === null ? 'the working copy' : `component ${component}`} (${repository}) has no merge base with ${ref}`)
      continue
    }
    bases.push({ component, root, repository, ref: used, source: /** @type {BaseSource} */ (source), sha })
  }
  if (unresolved.length > 0) {
    return { ok: false, code: 'base-unresolved', reason: `${unresolved.join('; ')}; set baseBranch in ${CONFIG_FILE} or pass --base <ref>` }
  }
  return { ok: true, bases }
}

/**
 * The base a component's commands and diff use; null when its root is in no repository.
 * @param {ReadonlyArray<Base>} bases
 * @param {string} component
 */
export const baseOf = (bases, component) => bases.find((base) => base.component === component) ?? null
