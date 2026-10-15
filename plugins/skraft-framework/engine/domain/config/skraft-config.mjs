import { normalizeRelative } from './relative-path.mjs'

/**
 * `skraft-config.json`: components, each with its root, stack and commands. A command the
 * developer wrote is used as written; nothing here fills in a default. `paths` and
 * `contractTesting` are accepted and read by the lots that use them.
 *
 * @typedef {'dotnet' | 'java' | 'python' | 'typescript' | 'javascript' | 'react'} Stack
 * @typedef {{
 *   name: string, root: string, stack: Stack,
 *   commands: Record<string, string>,
 *   baseBranch: string | null,
 *   mocking: { strategy: 'microcks' | 'inprocess' },
 * }} Component
 *   root is relative to the working copy, normalised (`.`, `services/api`, `../payment-web`).
 * @typedef {{ baseBranch: string | null, components: Component[] }} SkraftConfig
 * @typedef {{ ok: true, present: boolean, config: SkraftConfig, raw: Record<string, unknown> }
 *   | { ok: false, present: true, errors: string[] }} ConfigReading
 */

export const CONFIG_FILE = 'skraft-config.json'
const STACKS = Object.freeze(['dotnet', 'java', 'python', 'typescript', 'javascript', 'react'])
const MOCKING_STRATEGIES = Object.freeze(['microcks', 'inprocess'])
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COMPONENT_KEYS = Object.freeze(['name', 'root', 'stack', 'paths', 'commands', 'baseBranch', 'mocking', 'contractTesting'])
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
    return { ok: false, present: true, errors: [`${CONFIG_FILE} is not JSON: ${/** @type {Error} */ (error).message}`] }
  }
  if (!isRecord(raw)) return { ok: false, present: true, errors: [`${CONFIG_FILE} must hold a JSON object`] }
  /** @type {string[]} */
  const errors = []
  const baseBranch = optionalRef(raw.baseBranch, 'baseBranch', errors)
  const listed = raw.components ?? []
  if (!Array.isArray(listed)) errors.push('components must be an array')
  const components = (Array.isArray(listed) ? listed : []).map((entry, index) => componentOf(entry, index, errors))
  const names = components.map((component) => component?.name)
  for (const name of new Set(names.filter((name, index) => name !== undefined && names.indexOf(name) !== index))) errors.push(`component name ${name} is used twice`)
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
  if (!STACKS.includes(entry.stack)) errors.push(`${label}: stack must be one of ${STACKS.join(', ')}`)
  const commands = commandsOf(entry.commands ?? {}, label, errors)
  const baseBranch = optionalRef(entry.baseBranch, `${label}: baseBranch`, errors)
  const strategy = isRecord(entry.mocking) ? entry.mocking.strategy ?? 'microcks' : entry.mocking === undefined ? 'microcks' : null
  if (!MOCKING_STRATEGIES.includes(strategy)) errors.push(`${label}: mocking must be { "strategy": "${MOCKING_STRATEGIES.join('" or "')}" }`)
  if (errors.length > before) return null
  return {
    name: /** @type {string} */ (entry.name),
    root: normalizeRelative(/** @type {string} */ (entry.root)),
    stack: /** @type {Stack} */ (entry.stack),
    commands,
    baseBranch,
    mocking: { strategy },
  }
}

/** @param {unknown} value @param {string} label @param {string[]} errors @returns {Record<string, string>} */
const commandsOf = (value, label, errors) => {
  if (!isRecord(value)) {
    errors.push(`${label}: commands must be an object of command lines`)
    return {}
  }
  for (const [name, line] of Object.entries(value)) {
    if (!COMMAND_NAME.test(name)) errors.push(`${label}: command name ${JSON.stringify(name)} must be lower-case`)
    else if (typeof line !== 'string' || line.trim() === '') errors.push(`${label}: command ${name} must be a non-empty command line`)
  }
  return /** @type {Record<string, string>} */ (value)
}

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
