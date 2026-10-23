import { GATE_ORDER } from '../gates/gate-plan.mjs'
import { normalizeRelative } from './relative-path.mjs'
import { mergePatch } from './merge-patch.mjs'
import { PLUGIN_DEFAULTS } from './model-assignment.mjs'
import { modelSettingsOf, unrankedFamilies } from './model-settings.mjs'

export { HOSTS } from './model-assignment.mjs'

/**
 * `skraft-config.json`: components, each with its root, stack, source and test paths and
 * commands; the workflow the repository runs; how TDD commits are replayed; which model family
 * each agent runs on and what each family runs on each host. A command the developer wrote is
 * used as written; nothing here fills in a default. `contractTesting` is off unless the
 * developer turns it on; the review's contract lens reads it.
 *
 * The configuration is four layers, each a JSON Merge Patch (RFC 7386) on the ones before it:
 * the plugin's defaults, the developer's `~/.skraft/config.json`, the team's
 * `skraft-config.json`, the developer's `skraft-config.local.json`. Only the team's file holds
 * components and the workflow.
 *
 * @typedef {'dotnet' | 'java' | 'python' | 'typescript' | 'javascript' | 'react'} Stack
 * @typedef {{
 *   name: string, root: string, stack: Stack,
 *   paths: { src: string[], tests: string[] },
 *   commands: Record<string, string>,
 *   baseBranch: string | null,
 *   mocking: { strategy: 'microcks' | 'inprocess' },
 *   contractTesting: boolean,
 * }} Component
 *   root is relative to the working copy, normalised (`.`, `services/api`, `../payment-web`).
 *   paths are relative to root, normalised; `['.']` (the whole root) when the file names none,
 *   or an empty list (`skraft init` on a project with no tests folder yet).
 * @typedef {'all' | 'last-red'} ReplayMode
 *   all: every red commit is replayed; last-red: only the last red commit of each story.
 * @typedef {import('./model-assignment.mjs').Host} Host
 * @typedef {import('./model-assignment.mjs').Models} Models
 * @typedef {import('./model-assignment.mjs').Assign} Assign
 * @typedef {{ baseBranch: string | null, workflow: string | null, tdd: { replay: ReplayMode }, publish: { visuals: boolean | null }, models: Models, assign: Assign }} Settings
 *   workflow: the repository's DOT workflow, relative to the working copy; null runs the plugin's.
 *   publish.visuals: whether the run may publish screenshots and videos in the pull request;
 *   null until the developer answers the consent question once. models, assign: the four layers merged.
 * @typedef {Settings & { components: Component[] }} SkraftConfig
 * @typedef {{ file: string, errors: string[] }} InvalidFile
 * @typedef {{ ok: true, present: boolean, config: SkraftConfig, raw: Record<string, unknown> }} ValidConfig
 *   present: whether skraft-config.json exists; raw: the object it holds, {} when absent.
 * @typedef {ValidConfig | { ok: false, errors: string[] }} ConfigReading
 * @typedef {ValidConfig | { ok: false, invalid: InvalidFile[] }} LayeredReading
 * @typedef {{ user?: string | null, team: string | null, local?: string | null }} ConfigTexts
 *   each file's content, null when the file is absent.
 */

export const CONFIG_FILE = 'skraft-config.json'
/** The developer's own layer beside the team's file, never committed. */
export const LOCAL_CONFIG_FILE = 'skraft-config.local.json'
/** The developer's layer for every working copy, as messages name it. */
export const USER_CONFIG_FILE = '~/.skraft/config.json'
const MERGED = 'the merged configuration'
const STACKS = Object.freeze(['dotnet', 'java', 'python', 'typescript', 'javascript', 'react'])
const REPLAY_MODES = Object.freeze(['all', 'last-red'])
const MOCKING_STRATEGIES = Object.freeze(['microcks', 'inprocess'])
const IN_PROCESS_STACKS = Object.freeze(['typescript', 'javascript', 'react'])
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COMPONENT_KEYS = Object.freeze(['name', 'root', 'stack', 'paths', 'commands', 'baseBranch', 'mocking', 'contractTesting'])
/** The gates, and `e2e`, which doctor checks but no gate runs. */
const COMMAND_NAMES = Object.freeze([...GATE_ORDER, 'e2e'])
/** What only the team's file holds. */
const TEAM_KEYS = Object.freeze(['components', 'workflow'])

/** Why a config with no component cannot be checked or gated. */
export const NO_COMPONENT = `${CONFIG_FILE} lists no component; run skraft init to detect them`
/** Why a component with no gate command cannot prove anything. */
export const NO_GATE = `no gate command; give it at least one of ${GATE_ORDER.join(', ')} in ${CONFIG_FILE}`

/**
 * The team's file, and the developer's beside it when given, over the plugin's defaults.
 * @param {string | null} text the file's content, null when the file is absent
 * @param {string | null} [local] skraft-config.local.json's content, null when absent
 * @returns {ConfigReading}
 */
export const readConfig = (text, local = null) => {
  const reading = readConfigLayers({ team: text, local })
  return reading.ok ? reading : { ok: false, errors: reading.invalid.flatMap(({ file, errors }) => (file === CONFIG_FILE ? errors : errors.map((error) => `${file}: ${error}`))) }
}

/**
 * The four layers, each checked on its own, then merged and checked as a whole.
 * @param {ConfigTexts} texts @returns {LayeredReading}
 */
export const readConfigLayers = (texts) => {
  const layers = LAYERS.map((layer) => readLayer(layer, texts[layer.key] ?? null))
  const invalid = layers.filter(({ errors }) => errors.length > 0).map(({ file, errors }) => ({ file, errors }))
  if (invalid.length > 0) return { ok: false, invalid }
  return mergedReading(layers.map(({ raw }) => raw))
}

/** Why a configuration is refused: each invalid file with its errors. @param {InvalidFile[]} invalid */
export const refusalOf = (invalid) => invalid.map(({ file, errors }) => `${file} is invalid: ${errors.join('; ')}`).join('; ')

/**
 * @typedef {{ key: 'user' | 'team' | 'local', file: string, check: (raw: Record<string, any>, file: string, errors: string[]) => void }} Layer
 * @typedef {{ file: string, raw: Record<string, any> | null, errors: string[] }} ReadLayer
 */

/** @type {ReadonlyArray<Layer>} */
const LAYERS = Object.freeze([
  { key: 'user', file: USER_CONFIG_FILE, check: (raw, file, errors) => checkPersonal(raw, file, errors) },
  { key: 'team', file: CONFIG_FILE, check: (raw, _file, errors) => checkTeam(raw, errors) },
  { key: 'local', file: LOCAL_CONFIG_FILE, check: (raw, file, errors) => checkPersonal(raw, file, errors) },
])

/** @param {Layer} layer @param {string | null} text @returns {ReadLayer} */
const readLayer = ({ file, check }, text) => {
  if (text === null) return { file, raw: null, errors: [] }
  const parsed = parseObject(text, file)
  if (!parsed.ok) return { file, raw: null, errors: parsed.errors }
  /** @type {string[]} */
  const errors = []
  check(parsed.value, file, errors)
  return { file, raw: parsed.value, errors }
}

/** The team's file: every key. @param {Record<string, any>} raw @param {string[]} errors */
const checkTeam = (raw, errors) => {
  reportRank(raw, errors)
  settingsOf(raw, errors)
  reportNamesUsedTwice(componentsOf(raw.components ?? [], errors), errors)
}

/**
 * A developer's own layer: no component and no workflow, which the team shares.
 * @param {Record<string, any>} raw @param {string} file @param {string[]} errors
 */
const checkPersonal = (raw, file, errors) => {
  for (const key of TEAM_KEYS.filter((key) => Object.hasOwn(raw, key))) errors.push(`${key} belongs in ${CONFIG_FILE}, never in ${file}`)
  reportRank(raw, errors)
  const { components, workflow, ...personal } = raw
  settingsOf(personal, errors)
}

/** @param {Record<string, any>} raw @param {string[]} errors */
const reportRank = (raw, errors) => {
  if (Object.hasOwn(raw, 'rank')) errors.push('rank is no key: the tier of each family ranks it (economy < standard < frontier)')
}

/**
 * The layers merged over the plugin's defaults, checked as a whole.
 * @param {Array<Record<string, any> | null>} raws user, team, local; null for an absent file
 * @returns {LayeredReading}
 */
const mergedReading = (raws) => {
  const merged = /** @type {Record<string, any>} */ (raws.reduce((target, raw) => mergePatch(target, raw ?? {}), PLUGIN_DEFAULTS))
  /** @type {string[]} */
  const errors = []
  const settings = settingsOf(merged, errors)
  const components = componentsOf(merged.components ?? [], errors)
  errors.push(...unrankedFamilies(settings))
  if (errors.length > 0) return { ok: false, invalid: [{ file: MERGED, errors }] }
  return { ok: true, present: raws[1] !== null, config: { ...settings, components: /** @type {Component[]} */ (components) }, raw: raws[1] ?? {} }
}

/**
 * The repository-wide keys, checked in the order their errors are listed.
 * @param {Record<string, any>} raw @param {string[]} errors @returns {Settings}
 */
const settingsOf = (raw, errors) => ({
  baseBranch: optionalRef(raw.baseBranch, 'baseBranch', errors),
  workflow: workflowOf(raw.workflow ?? null, errors),
  tdd: { replay: replayOf(raw.tdd, errors) },
  publish: { visuals: visualsOf(raw.publish, errors) },
  ...modelSettingsOf(raw, errors),
})

/** @param {unknown} publish @param {string[]} errors @returns {boolean | null} */
const visualsOf = (publish, errors) => {
  const visuals = isRecord(publish) ? publish.visuals ?? null : publish === undefined ? null : 'invalid'
  if (visuals === null || typeof visuals === 'boolean') return visuals
  errors.push('publish must be { "visuals": true or false }')
  return null
}

/**
 * The file's text with the consent to publish visuals set, every other key kept.
 * @param {Record<string, unknown>} raw the object read from the file @param {boolean} visuals
 */
export const withVisualsConsent = (raw, visuals) => `${JSON.stringify({ ...raw, publish: { ...(isRecord(raw.publish) ? raw.publish : {}), visuals } }, null, 2)}\n`

/** @param {unknown} workflow @param {string[]} errors @returns {string | null} */
const workflowOf = (workflow, errors) => {
  if (workflow === null) return null
  if (typeof workflow === 'string' && workflow.endsWith('.dot') && !isAbsolutePath(workflow)) return normalizeRelative(workflow)
  errors.push(`workflow must be a .dot file relative to the working copy, got ${JSON.stringify(workflow)}`)
  return null
}

/** @param {unknown} tdd @param {string[]} errors @returns {any} the replay mode it names, all when absent */
const replayOf = (tdd, errors) => {
  const replay = isRecord(tdd) ? tdd.replay ?? 'all' : tdd === undefined ? 'all' : null
  if (!REPLAY_MODES.includes(replay)) errors.push(`tdd must be { "replay": "${REPLAY_MODES.join('" or "')}" }`)
  return replay
}

/**
 * The file's JSON object, or why the text is not one.
 * @param {string} text @param {string} file @returns {{ ok: true, value: Record<string, any> } | { ok: false, errors: string[] }}
 */
const parseObject = (text, file) => {
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [`${file} is not JSON: ${/** @type {Error} */ (error).message}`] }
  }
  if (!isRecord(value)) return { ok: false, errors: [`${file} must hold a JSON object`] }
  return { ok: true, value }
}

/** @param {unknown} listed @param {string[]} errors @returns {Array<Component | null>} null for a wrong component */
const componentsOf = (listed, errors) => {
  if (Array.isArray(listed)) return listed.map((entry, index) => componentOf(entry, index, errors))
  errors.push('components must be an array')
  return []
}

/** @param {Array<Component | null>} components @param {string[]} errors */
const reportNamesUsedTwice = (components, errors) => {
  const names = components.flatMap((component) => (component === null ? [] : [component.name]))
  for (const name of new Set(names)) if (names.indexOf(name) !== names.lastIndexOf(name)) errors.push(`component name ${name} is used twice`)
}

/**
 * A component entry being checked: `at` is its place in the list, `label` how errors name it.
 * @typedef {{ entry: Record<string, any>, at: string, label: string, errors: string[] }} ComponentEntry
 */

/**
 * @param {unknown} entry @param {number} index @param {string[]} errors
 * @returns {Component | null}
 */
const componentOf = (entry, index, errors) => {
  const at = `components[${index}]`
  if (!isRecord(entry)) {
    errors.push(`${at} must be an object`)
    return null
  }
  const label = typeof entry.name === 'string' ? `component ${entry.name}` : at
  return checkedComponent({ entry, at, label, errors })
}

/**
 * What is wrong with a component's own fields, checked in the order their errors are listed,
 * before its commands, baseBranch and mocking.
 * @type {ReadonlyArray<(component: ComponentEntry) => void>}
 */
const FIELD_CHECKS = Object.freeze([
  ({ entry, at, errors }) => {
    if (typeof entry.name !== 'string' || !NAME.test(entry.name)) errors.push(`${at}.name must be kebab-case, got ${JSON.stringify(entry.name ?? null)}`)
  },
  ({ entry, label, errors }) => {
    for (const key of Object.keys(entry).filter((key) => !COMPONENT_KEYS.includes(key))) errors.push(`${label}: unknown key ${key} (allowed: ${COMPONENT_KEYS.join(', ')})`)
  },
  ({ entry, label, errors }) => {
    if (typeof entry.root !== 'string' || entry.root.trim() === '' || isAbsolutePath(entry.root)) errors.push(`${label}: root must be a path relative to the working copy`)
  },
  ({ entry, label, errors }) => {
    if (!STACKS.includes(entry.stack)) errors.push(`${label}: stack must be one of ${STACKS.join(', ')}`)
  },
  ({ entry, label, errors }) => {
    if (entry.contractTesting !== undefined && typeof entry.contractTesting !== 'boolean') errors.push(`${label}: contractTesting must be true or false`)
  },
])

/**
 * @param {ComponentEntry} component
 * @returns {Component | null} null when one of its fields is wrong
 */
const checkedComponent = (component) => {
  const { entry, label, errors } = component
  const before = errors.length
  for (const check of FIELD_CHECKS) check(component)
  const paths = pathsOf(entry.paths ?? {}, label, errors)
  const commands = commandsOf(entry.commands ?? {}, label, errors)
  const baseBranch = optionalRef(entry.baseBranch, `${label}: baseBranch`, errors)
  const strategy = mockingOf(entry, label, errors)
  if (errors.length > before) return null
  return componentFrom(entry, { paths, commands, baseBranch, strategy })
}

/**
 * A component whose fields passed their checks, its root normalised.
 * @param {Record<string, any>} entry
 * @param {{ paths: Component['paths'], commands: Record<string, string>, baseBranch: string | null, strategy: any }} values
 * @returns {Component}
 */
const componentFrom = (entry, { paths, commands, baseBranch, strategy }) => ({
  name: entry.name,
  root: normalizeRelative(entry.root),
  stack: entry.stack,
  paths,
  commands,
  baseBranch,
  mocking: { strategy },
  contractTesting: entry.contractTesting === true,
})

/** The strategy of a component that names none: in process for a JavaScript, TypeScript or React stack, Microcks otherwise. @param {unknown} stack */
const defaultMocking = (stack) => (IN_PROCESS_STACKS.includes(/** @type {string} */ (stack)) ? 'inprocess' : 'microcks')

/**
 * @param {Record<string, any>} entry @param {string} label @param {string[]} errors
 * @returns {any} the strategy it names, the stack's default when absent
 */
const mockingOf = ({ mocking, stack }, label, errors) => {
  const fallback = defaultMocking(stack)
  const strategy = isRecord(mocking) ? mocking.strategy ?? fallback : mocking === undefined ? fallback : null
  if (!MOCKING_STRATEGIES.includes(strategy)) errors.push(`${label}: mocking must be { "strategy": "${MOCKING_STRATEGIES.join('" or "')}" }`)
  return strategy
}

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {Record<string, string>} */
const commandsOf = (value, label, errors) => {
  if (!isRecord(value)) {
    errors.push(`${label}: commands must be an object of command lines`)
    return {}
  }
  for (const [name, line] of Object.entries(value)) {
    if (!COMMAND_NAMES.includes(name)) errors.push(`${label}: unknown command ${name} (allowed: ${COMMAND_NAMES.join(', ')})`)
    else if (typeof line !== 'string' || line.trim() === '') errors.push(`${label}: command ${name} must be a non-empty command line`)
  }
  return /** @type {Record<string, string>} */ (value)
}

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {Component['paths']} */
const pathsOf = (value, label, errors) => {
  /** @type {Component['paths']} */
  // Stryker disable next-line StringLiteral: an empty path and `.` both name the component root once joined to it
  const paths = { src: ['.'], tests: ['.'] }
  if (!isRecord(value)) {
    errors.push(`${label}: paths must be { "src": [...], "tests": [...] }`)
    return paths
  }
  for (const key of PATH_KEYS) readPaths(paths, key, value[key], label, errors)
  return paths
}

const PATH_KEYS = /** @type {const} */ (['src', 'tests'])

/**
 * One key of `paths`, kept as `['.']` when absent or empty.
 * @param {Component['paths']} paths @param {'src' | 'tests'} key @param {unknown} listed
 * @param {string} label @param {string[]} errors
 */
const readPaths = (paths, key, listed, label, errors) => {
  if (listed === undefined || (Array.isArray(listed) && listed.length === 0)) return
  if (isFolderList(listed)) paths[key] = listed.map(normalizeRelative)
  else errors.push(`${label}: paths.${key} must list folders inside the component root`)
}

/** Folders inside a component root: relative, and never above it. @param {unknown} listed @returns {listed is string[]} */
const isFolderList = (listed) => Array.isArray(listed) && listed.every(isInnerFolder)

/** @param {unknown} path */
const isInnerFolder = (path) => typeof path === 'string' && path.trim() !== '' && !isAbsolutePath(path) && !normalizeRelative(path).startsWith('..')

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {string | null} */
const optionalRef = (value, label, errors) => {
  if (value === undefined || value === null) return null
  if (!isRef(value)) {
    errors.push(`${label} must be a git ref, got ${JSON.stringify(value)}`)
    return null
  }
  return value
}

/** `/x`, `\x`, `C:x`: a path that does not start from the working copy. @param {string} path */
export const isAbsolutePath = (path) => /^([\\/]|[A-Za-z]:)/.test(path)

/** A ref git takes as one argument: no space, no leading `-`. @param {unknown} value @returns {value is string} */
export const isRef = (value) => typeof value === 'string' && /^[^\s-][^\s]*$/.test(value)

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The file's text once components are added, every other key kept as it was.
 * @param {Record<string, unknown>} raw the object read from the file ({} when absent)
 * @param {Array<Record<string, unknown>>} components the components to list, in order
 */
export const writeConfig = (raw, components) => `${JSON.stringify({ ...raw, components }, null, 2)}\n`

/**
 * The file's text once it designates a workflow, every other key kept as it was.
 * @param {Record<string, unknown>} raw the object read from the file ({} when absent)
 * @param {string} workflow relative to the working copy
 */
export const writeWorkflow = (raw, workflow) => `${JSON.stringify({ ...raw, workflow }, null, 2)}\n`
