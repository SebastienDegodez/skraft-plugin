import { CONFIG_FILE, isRef, LOCAL_CONFIG_FILE, readConfigLayers, refusalOf } from '../../domain/config/skraft-config.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {'flag' | 'component' | 'config' | 'default'} BaseSource
 * @typedef {{ component: string | null, root: string, repository: string, ref: string, source: BaseSource, sha: string }} Base
 *   component null: the working copy that holds the tracking folder. ref: the ref the merge
 *   base was taken with (`main`, `origin/main`, `develop`).
 * @typedef {{ component: string | null, root: string, branch: string | null }} Target
 *   branch: the component's `baseBranch`; null for the working copy.
 */

const DEFAULT_BASE_BRANCH = 'main'

/**
 * @typedef {{ workspace: import('../ports/workspace.mjs').ConfigSource, userSettings: import('../ports/user-settings.mjs').UserSettings }} ConfigDeps
 */

/**
 * The developer configuration: the plugin's defaults, `~/.skraft/config.json`,
 * `skraft-config.json` and `skraft-config.local.json`, each read and checked, then merged.
 * present: whether skraft-config.json exists; raw: the object it holds, {} when absent.
 * @param {ConfigDeps} deps
 * @returns {Promise<{ ok: true, config: SkraftConfig, present: boolean, raw: Record<string, unknown> } | { ok: false, reason: string }>}
 */
export const loadConfig = async ({ workspace, userSettings }) => {
  const [user, team, local] = await Promise.all([userSettings.read(), workspace.read(CONFIG_FILE), workspace.read(LOCAL_CONFIG_FILE)])
  const reading = readConfigLayers({ user, team, local })
  return reading.ok ? reading : { ok: false, reason: refusalOf(reading.invalid) }
}

/** Why a `--base` is refused: never the value, which a model may have written. */
const INVALID_BASE = '--base must be a git ref: text with no blank that does not start with -'

/**
 * The base of the working copy and of each component, each in its own repository:
 * `git merge-base HEAD <ref>`, ref = `--base` > component `baseBranch` > global `baseBranch`
 * > `main`; `origin/<ref>` when the ref is not a local branch. A folder in no repository has
 * no base. Components need Git itself: a host that cannot run it is refused.
 * @param {{ sourceControl: import('../ports/source-control.mjs').SourceControl }} deps
 * @param {{ config: SkraftConfig, flag: unknown }} request flag: `--base` as received, null when absent
 * @returns {Promise<{ ok: true, bases: Base[] } | { ok: false, code: 'invalid-base' | 'base-unresolved' | 'source-control-unavailable', reason: string }>}
 */
export const resolveBases = async ({ sourceControl }, { config, flag }) => {
  if (flag !== null && !isRef(flag)) return { ok: false, code: 'invalid-base', reason: INVALID_BASE }
  const refusal = await gitRefusal(sourceControl, config)
  if (refusal !== null) return { ok: false, code: 'source-control-unavailable', reason: refusal }
  const outcomes = await outcomesOf(sourceControl, targetsOf(config), /** @type {string | null} */ (flag), config.baseBranch)
  const unresolved = outcomes.filter((outcome) => typeof outcome === 'string')
  if (unresolved.length > 0) return { ok: false, code: 'base-unresolved', reason: `${unresolved.join('; ')}; set baseBranch in ${CONFIG_FILE} or pass --base <ref>` }
  return { ok: true, bases: /** @type {Base[]} */ (outcomes.filter((outcome) => outcome !== null)) }
}

/**
 * Why the components' bases cannot be resolved on this host; null when Git runs or there is no
 * component to ask it for.
 * @param {import('../ports/source-control.mjs').SourceControl} sourceControl
 * @param {SkraftConfig} config
 */
const gitRefusal = async (sourceControl, config) => {
  if (config.components.length === 0) return null
  const unavailable = await sourceControl.unavailable()
  return unavailable === null ? null : `${unavailable}; the components of ${CONFIG_FILE} need Git for their base`
}

/**
 * The working copy, then each component in the order of the config.
 * @param {SkraftConfig} config
 * @returns {Target[]}
 */
const targetsOf = (config) => [
  { component: null, root: '.', branch: null },
  ...config.components.map((component) => ({ component: component.name, root: component.root, branch: component.baseBranch })),
]

/**
 * What each target resolves to, one target after the other, in their order.
 * @param {import('../ports/source-control.mjs').SourceControl} sourceControl
 * @param {Target[]} targets
 * @param {string | null} flag
 * @param {string | null} baseBranch the global `baseBranch`
 */
const outcomesOf = async (sourceControl, targets, flag, baseBranch) => {
  /** @type {Array<Base | string | null>} */
  const outcomes = []
  for (const target of targets) outcomes.push(await baseOfTarget(sourceControl, target, flag, baseBranch))
  return outcomes
}

/**
 * The base of one target; null when its root is in no repository, why not when Git finds no
 * merge base.
 * @param {import('../ports/source-control.mjs').SourceControl} sourceControl
 * @param {Target} target
 * @param {string | null} flag
 * @param {string | null} baseBranch the global `baseBranch`
 * @returns {Promise<Base | string | null>}
 */
const baseOfTarget = async (sourceControl, { component, root, branch }, flag, baseBranch) => {
  const repository = await sourceControl.repository(root)
  if (repository === null) return null
  const [ref, source] = refOf(flag, branch, baseBranch)
  const [used, sha] = await mergeBaseOf(sourceControl, root, ref)
  if (sha === null) return `${nameOf(component)} (${repository}) has no merge base with ${ref}`
  return { component, root, repository, ref: used, source, sha }
}

/**
 * The ref a base is taken with, and where it comes from: `--base` > component `baseBranch` >
 * global `baseBranch` > `main`.
 * @param {string | null} flag
 * @param {string | null} branch the component's `baseBranch`
 * @param {string | null} baseBranch the global `baseBranch`
 * @returns {[string, BaseSource]}
 */
const refOf = (flag, branch, baseBranch) => {
  if (flag) return [flag, 'flag']
  if (branch) return [branch, 'component']
  if (baseBranch) return [baseBranch, 'config']
  return [DEFAULT_BASE_BRANCH, 'default']
}

/**
 * The merge base with the local ref, else with `origin/<ref>`: the ref used and its sha, null
 * when neither has one.
 * @param {import('../ports/source-control.mjs').SourceControl} sourceControl
 * @param {string} root
 * @param {string} ref
 * @returns {Promise<[string, string | null]>}
 */
const mergeBaseOf = async (sourceControl, root, ref) => {
  const local = await sourceControl.mergeBase(root, ref)
  if (local !== null) return [ref, local]
  return [`origin/${ref}`, await sourceControl.mergeBase(root, `origin/${ref}`)]
}

/** @param {string | null} component */
const nameOf = (component) => (component === null ? 'the working copy' : `component ${component}`)

/**
 * The base a component's commands and diff use; null when its root is in no repository.
 * @param {ReadonlyArray<Base>} bases
 * @param {string} component
 */
export const baseOf = (bases, component) => bases.find((base) => base.component === component) ?? null
