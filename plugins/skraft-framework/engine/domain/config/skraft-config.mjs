import { GATE_ORDER } from '../gates/gate-plan.mjs'
import { normalizeRelative } from './relative-path.mjs'
import { FAMILY } from '../review/lenses.mjs'

/**
 * `skraft-config.json`: components, each with its root, stack, source and test paths and
 * commands; the workflow the repository runs; how TDD commits are replayed. A command the
 * developer wrote is used as written; nothing here fills in a default. `contractTesting` is off
 * unless the developer turns it on; the review's contract lens reads it.
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
 * @typedef {'claude-code' | 'copilot'} Host
 * @typedef {Readonly<Partial<Record<Host, string[]>>>} HostModels each host's model names, the preferred first
 * @typedef {Readonly<Record<string, HostModels>>} Models
 *   the model names of each family a workflow names (`model=`, `@<family>`, `refuter=`); the
 *   order of the families is their rank, weakest first. The only place a family meets a model name.
 * @typedef {{ baseBranch: string | null, workflow: string | null, tdd: { replay: ReplayMode }, publish: { visuals: boolean | null }, models: Models }} Settings
 *   workflow: the repository's DOT workflow, relative to the working copy; null runs the plugin's.
 *   publish.visuals: whether the run may publish screenshots and videos in the pull request;
 *   null until the developer answers the consent question once. models: {} when the file names none.
 * @typedef {Settings & { components: Component[] }} SkraftConfig
 * @typedef {{ ok: true, present: boolean, config: SkraftConfig, raw: Record<string, unknown> }
 *   | { ok: false, errors: string[] }} ConfigReading
 */

export const CONFIG_FILE = 'skraft-config.json'
const STACKS = Object.freeze(['dotnet', 'java', 'python', 'typescript', 'javascript', 'react'])
const REPLAY_MODES = Object.freeze(['all', 'last-red'])
const MOCKING_STRATEGIES = Object.freeze(['microcks', 'inprocess'])
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COMPONENT_KEYS = Object.freeze(['name', 'root', 'stack', 'paths', 'commands', 'baseBranch', 'mocking', 'contractTesting'])
/** The gates, and `e2e`, which doctor checks but no gate runs. */
const COMMAND_NAMES = Object.freeze([...GATE_ORDER, 'e2e'])

/** Why a config with no component cannot be checked or gated. */
export const NO_COMPONENT = `${CONFIG_FILE} lists no component; run skraft init to detect them`
/** Why a component with no gate command cannot prove anything. */
export const NO_GATE = `no gate command; give it at least one of ${GATE_ORDER.join(', ')} in ${CONFIG_FILE}`

/**
 * @param {string | null} text the file's content, null when the file is absent
 * @returns {ConfigReading}
 */
export const readConfig = (text) => {
  if (text === null) return { .../** @type {Extract<ConfigReading, { ok: true }>} */ (readConfig('{}')), present: false }
  const parsed = parseObject(text)
  if (!parsed.ok) return parsed
  const raw = parsed.value
  /** @type {string[]} */
  const errors = []
  const settings = settingsOf(raw, errors)
  const components = componentsOf(raw.components ?? [], errors)
  reportNamesUsedTwice(components, errors)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, present: true, config: { ...settings, components: /** @type {Component[]} */ (components) }, raw }
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
  models: modelsOf(raw.models, errors),
})

/** The hosts a family names models for. */
export const HOSTS = Object.freeze(/** @type {Host[]} */ (['claude-code', 'copilot']))

/** @param {unknown} models @param {string[]} errors @returns {Models} */
const modelsOf = (models, errors) => {
  if (models === undefined) return {}
  if (!isRecord(models)) {
    errors.push('models must be an object of model families, weakest first')
    return {}
  }
  return Object.fromEntries(Object.entries(models).map(([family, hosts]) => [family, familyModelsOf(family, hosts, errors)]))
}

/** @param {string} family @param {unknown} hosts @param {string[]} errors @returns {HostModels} */
const familyModelsOf = (family, hosts, errors) => {
  if (!FAMILY.test(family)) errors.push(`models: ${JSON.stringify(family)} must be a model family, a kebab-case word such as sonnet or gpt-luna`)
  if (!isRecord(hosts)) {
    errors.push(`models.${family} must be an object of model names by host (${HOSTS.join(', ')})`)
    return {}
  }
  return Object.fromEntries(Object.entries(hosts).map(([host, names]) => [host, hostModelsOf(`models.${family}`, { host, names }, errors)]))
}

/** @param {string} at @param {{ host: string, names: unknown }} entry @param {string[]} errors @returns {string[]} */
const hostModelsOf = (at, { host, names }, errors) => {
  if (!HOSTS.includes(/** @type {Host} */ (host))) errors.push(`${at}: unknown host ${host} (allowed: ${HOSTS.join(', ')})`)
  else if (!isModelNames(names)) errors.push(`${at}.${host} must be a model name or a non-empty list of model names, the preferred first`)
  return typeof names === 'string' ? [names] : /** @type {string[]} */ (names)
}

/** @param {unknown} name */
const isModelName = (name) => typeof name === 'string' && name.trim() !== ''

/** @param {unknown} names */
const isModelNames = (names) => isModelName(names) || (Array.isArray(names) && names.length > 0 && names.every(isModelName))

/**
 * What a dispatch on a family says about its model: nothing without a family; the family, with
 * each host's model names when the configuration names the family.
 * @param {Models} models @param {string | null} family
 * @returns {{ model?: string, models?: HostModels }}
 */
export const modelFieldsOf = (models, family) => {
  if (family === null) return {}
  return Object.hasOwn(models, family) ? { model: family, models: models[family] } : { model: family }
}

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
 * @param {string} text @returns {{ ok: true, value: Record<string, any> } | { ok: false, errors: string[] }}
 */
const parseObject = (text) => {
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [`${CONFIG_FILE} is not JSON: ${/** @type {Error} */ (error).message}`] }
  }
  if (!isRecord(value)) return { ok: false, errors: [`${CONFIG_FILE} must hold a JSON object`] }
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
  const strategy = mockingOf(entry.mocking, label, errors)
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

/**
 * @param {unknown} mocking @param {string} label @param {string[]} errors
 * @returns {any} the strategy it names, microcks when absent
 */
const mockingOf = (mocking, label, errors) => {
  const strategy = isRecord(mocking) ? mocking.strategy ?? 'microcks' : mocking === undefined ? 'microcks' : null
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
