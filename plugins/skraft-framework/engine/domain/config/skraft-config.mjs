import { normalizeRelative } from './relative-path.mjs'

/**
 * `skraft-config.json`: components, each with its root, stack, paths and commands. A command
 * the developer wrote is used as written; nothing here fills in a default.
 *
 * @typedef {'dotnet' | 'java' | 'python' | 'typescript' | 'javascript' | 'react'} Stack
 * @typedef {{ strategy: 'microcks' | 'inprocess', library: string | null }} Mocking
 * @typedef {{
 *   name: string, root: string, stack: Stack,
 *   paths: { src: string[], tests: string[] },
 *   commands: Record<string, string>,
 *   baseBranch: string | null,
 *   mocking: Mocking,
 *   contractTesting: boolean,
 * }} Component
 *   root is relative to the working copy, normalised (`.`, `services/api`, `../payment-web`).
 * @typedef {{ baseBranch: string | null, components: Component[] }} SkraftConfig
 * @typedef {{ ok: true, present: boolean, config: SkraftConfig, raw: Record<string, unknown> }
 *   | { ok: false, present: true, errors: string[] }} ConfigReading
 */

export const CONFIG_FILE = 'skraft-config.json'
export const STACKS = Object.freeze(['dotnet', 'java', 'python', 'typescript', 'javascript', 'react'])
export const MOCKING_STRATEGIES = Object.freeze(['microcks', 'inprocess'])
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COMPONENT_KEYS = Object.freeze(['name', 'root', 'stack', 'paths', 'commands', 'baseBranch', 'mocking', 'contractTesting'])
const PATHS_KEYS = Object.freeze(['src', 'tests'])
const COMMAND_NAME = /^[a-z][a-z0-9-]*$/

/**
 * @param {string | null} text the file's content, null when the file is absent
 * @returns {ConfigReading}
 */
export const readConfig = (text) => {
  if (text === null) return { ok: true, present: false, config: { baseBranch: null, components: [] }, raw: {} }
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { ok: false, present: true, errors: [`${CONFIG_FILE} is not JSON: ${error instanceof Error ? error.message : String(error)}`] }
  }
  if (!isRecord(raw)) return { ok: false, present: true, errors: [`${CONFIG_FILE} must hold a JSON object`] }
  /** @type {string[]} */
  const errors = []
  const baseBranch = optionalRef(raw.baseBranch, 'baseBranch', errors)
  const listed = raw.components === undefined ? [] : raw.components
  if (!Array.isArray(listed)) errors.push('components must be an array')
  const components = (Array.isArray(listed) ? listed : []).map((entry, index) => componentOf(entry, index, errors))
  const names = components.map((component) => component?.name).filter((name) => typeof name === 'string')
  for (const name of new Set(names.filter((name, index) => names.indexOf(name) !== index))) errors.push(`component name ${name} is used twice`)
  if (errors.length > 0) return { ok: false, present: true, errors }
  return { ok: true, present: true, config: { baseBranch, components: /** @type {Component[]} */ (components) }, raw }
}

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
  const before = errors.length
  if (typeof entry.name !== 'string' || !NAME.test(entry.name)) errors.push(`${at}.name must be kebab-case, got ${JSON.stringify(entry.name ?? null)}`)
  for (const key of Object.keys(entry).filter((key) => !COMPONENT_KEYS.includes(key))) errors.push(`${label}: unknown key ${key} (allowed: ${COMPONENT_KEYS.join(', ')})`)
  if (typeof entry.root !== 'string' || entry.root.trim() === '' || isAbsolutePath(entry.root)) errors.push(`${label}: root must be a path relative to the working copy`)
  if (typeof entry.stack !== 'string' || !STACKS.includes(entry.stack)) errors.push(`${label}: stack must be one of ${STACKS.join(', ')}`)
  const paths = isRecord(entry.paths) ? entry.paths : {}
  if (entry.paths !== undefined && !isRecord(entry.paths)) errors.push(`${label}: paths must be an object`)
  for (const key of Object.keys(paths).filter((key) => !PATHS_KEYS.includes(key))) errors.push(`${label}: unknown key paths.${key} (allowed: src, tests)`)
  const src = pathList(paths.src, `${label}: paths.src`, errors)
  const tests = pathList(paths.tests, `${label}: paths.tests`, errors)
  const commands = commandsOf(entry.commands, label, errors)
  const baseBranch = optionalRef(entry.baseBranch, `${label}: baseBranch`, errors)
  const mocking = mockingOf(entry.mocking, label, errors)
  if (entry.contractTesting !== undefined && typeof entry.contractTesting !== 'boolean') errors.push(`${label}: contractTesting must be true or false`)
  if (errors.length > before) return null
  return {
    name: /** @type {string} */ (entry.name),
    root: normalizeRelative(/** @type {string} */ (entry.root)),
    stack: /** @type {Stack} */ (entry.stack),
    paths: { src, tests },
    commands,
    baseBranch,
    mocking,
    contractTesting: entry.contractTesting === true,
  }
}

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {Record<string, string>} */
const commandsOf = (value, label, errors) => {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    errors.push(`${label}: commands must be an object of command lines`)
    return {}
  }
  /** @type {Record<string, string>} */
  const commands = {}
  for (const [name, line] of Object.entries(value)) {
    if (!COMMAND_NAME.test(name)) errors.push(`${label}: command name ${JSON.stringify(name)} must be lower-case`)
    else if (typeof line !== 'string' || line.trim() === '') errors.push(`${label}: command ${name} must be a non-empty command line`)
    else commands[name] = line.trim()
  }
  return commands
}

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {Mocking} */
const mockingOf = (value, label, errors) => {
  if (value === undefined) return { strategy: 'microcks', library: null }
  if (!isRecord(value)) {
    errors.push(`${label}: mocking must be an object`)
    return { strategy: 'microcks', library: null }
  }
  const strategy = value.strategy ?? 'microcks'
  if (typeof strategy !== 'string' || !MOCKING_STRATEGIES.includes(strategy)) errors.push(`${label}: mocking.strategy must be ${MOCKING_STRATEGIES.join(' or ')}`)
  if (value.library !== undefined && typeof value.library !== 'string') errors.push(`${label}: mocking.library must be a name`)
  return { strategy: /** @type {Mocking['strategy']} */ (strategy), library: typeof value.library === 'string' ? value.library : null }
}

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {string[]} */
const pathList = (value, label, errors) => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((path) => typeof path !== 'string' || path.trim() === '' || isAbsolutePath(path))) {
    errors.push(`${label} must be a list of paths relative to the component root`)
    return []
  }
  return value
}

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {string | null} */
const optionalRef = (value, label, errors) => {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !isRef(value)) {
    errors.push(`${label} must be a git ref, got ${JSON.stringify(value)}`)
    return null
  }
  return value
}

/** `/x`, `\x`, `C:x`: a path that does not start from the working copy. @param {string} path */
export const isAbsolutePath = (path) => /^([\\/]|[A-Za-z]:)/.test(path.trim())

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
