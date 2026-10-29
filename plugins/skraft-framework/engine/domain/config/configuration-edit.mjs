import { CONSENT_VERSIONS } from '../decisions/consents.mjs'

/**
 * An edit of the configuration a person makes in a page: the fields of the components
 * skraft-config.json lists, the consents it keeps, and the `assign` and `models` of their own
 * skraft-config.local.json. Applied, it changes only what differs from the configuration now: a
 * command line is written as given, a blank one removes the command, nothing is filled in; every
 * key the edit does not name stays as written. Whether the files it gives are valid is the
 * configuration's own check.
 *
 * @typedef {import('./skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {import('./skraft-config.mjs').Component} Component
 * @typedef {{ name: string, root?: unknown, stack?: unknown, commands?: unknown, mocking?: unknown, contractTesting?: unknown }} ComponentEdit
 * @typedef {{ components?: ComponentEdit[], consents?: Record<string, boolean | null>, assign?: unknown, models?: unknown }} ConfigurationEdit
 */

const EDIT_KEYS = Object.freeze(['components', 'consents', 'assign', 'models'])
const COMPONENT_EDIT_KEYS = Object.freeze(['name', 'root', 'stack', 'commands', 'mocking', 'contractTesting'])
/** The consents a person gives in the page, in the order it shows them. */
export const EDITED_CONSENTS = Object.freeze(/** @type {Array<'pullRequest' | 'visuals'>} */ (['pullRequest', 'visuals']))
/** The keys of skraft-config.local.json an edit writes. */
const LOCAL_KEYS = Object.freeze(['assign', 'models'])

const REFUSALS = Object.freeze({
  keys: 'a configuration edit takes components, consents, assign and models only',
  component: 'a component edit takes name, root, stack, commands, mocking and contractTesting only',
  unknown: 'the edit names a component skraft-config.json does not list; skraft init adds components',
  consents: 'consents takes pullRequest and visuals, each true, false or null',
})

/**
 * Why an edit is refused before it is applied; null when it has a shape an edit takes.
 * @param {unknown} edit @param {string[]} names the components skraft-config.json lists
 * @returns {string | null}
 */
export const editRefusal = (edit, names) => {
  if (!isRecord(edit) || !onlyKeys(edit, EDIT_KEYS)) return REFUSALS.keys
  return componentsRefusal(edit.components ?? [], names) ?? consentsRefusal(edit.consents ?? {})
}

/** @param {unknown} components @param {string[]} names */
const componentsRefusal = (components, names) => {
  if (!Array.isArray(components) || !components.every((entry) => isRecord(entry) && onlyKeys(entry, COMPONENT_EDIT_KEYS))) return REFUSALS.component
  return components.every(({ name }) => names.includes(name)) ? null : REFUSALS.unknown
}

/** @param {unknown} consents */
const consentsRefusal = (consents) => (isRecord(consents) && Object.entries(consents).every(isConsentEdit) ? null : REFUSALS.consents)

/** @param {[string, unknown]} entry */
const isConsentEdit = ([key, value]) => EDITED_CONSENTS.includes(/** @type {any} */ (key)) && (value === null || typeof value === 'boolean')

/**
 * skraft-config.json's object once the edit is applied.
 * @param {Record<string, any>} raw what the file holds @param {SkraftConfig} config the configuration now
 * @param {ConfigurationEdit} edit an edit editRefusal took
 */
export const editedTeam = (raw, config, edit) => withConsents(withComponents(raw, config, edit.components ?? []), config.publish, edit.consents ?? {})

/**
 * skraft-config.local.json's object once the edit is applied: `assign` and `models` as the edit
 * gives them, removed when it gives them empty.
 * @param {Record<string, unknown>} local @param {ConfigurationEdit} edit
 */
export const editedLocal = (local, edit) => LOCAL_KEYS.filter((key) => Object.hasOwn(edit, key)).reduce((next, key) => withLocalKey(next, key, /** @type {any} */ (edit)[key]), local)

/** @param {Record<string, unknown>} local @param {string} key @param {unknown} value */
const withLocalKey = (local, key, value) => {
  const kept = Object.fromEntries(Object.entries(local).filter(([name]) => name !== key))
  return isEmpty(value) ? kept : { ...kept, [key]: value }
}

/** @param {unknown} value */
const isEmpty = (value) => value === null || (isRecord(value) && Object.keys(value).length === 0)

/**
 * @param {Record<string, any>} raw @param {SkraftConfig} config @param {ComponentEdit[]} edits
 * @returns {Record<string, any>}
 */
const withComponents = (raw, config, edits) => (edits.length === 0 ? raw : {
  ...raw,
  components: raw.components.map((/** @type {Record<string, any>} */ entry) => editedEntry(entry, componentNamed(config, entry.name), edits.find(({ name }) => name === entry.name))),
})

/** @param {SkraftConfig} config @param {string} name */
const componentNamed = (config, name) => /** @type {Component} */ (config.components.find((component) => component.name === name))

/**
 * A component entry with each field the edit changes.
 * @param {Record<string, any>} entry @param {Component} current @param {ComponentEdit | undefined} edit
 */
const editedEntry = (entry, current, edit) => (edit === undefined ? entry : Object.assign({ ...entry }, ...FIELDS.map((field) => field(current, edit))))

/**
 * What each field of an edit writes when it differs from the component now.
 * @type {ReadonlyArray<(current: Component, edit: ComponentEdit) => Record<string, unknown>>}
 */
const FIELDS = Object.freeze([
  (current, edit) => changed('root', current.root, edit.root),
  (current, edit) => changed('stack', current.stack, edit.stack),
  (current, edit) => changed('contractTesting', current.contractTesting, edit.contractTesting),
  (current, edit) => (edit.mocking === undefined || edit.mocking === current.mocking.strategy ? {} : { mocking: { strategy: edit.mocking } }),
  (current, edit) => (edit.commands === undefined ? {} : changed('commands', current.commands, writtenCommands(edit.commands))),
])

/** @param {string} key @param {unknown} now @param {unknown} given @returns {Record<string, unknown>} */
const changed = (key, now, given) => (given === undefined || JSON.stringify(given) === JSON.stringify(now) ? {} : { [key]: given })

/** The commands as written; a blank line removes its command. @param {unknown} commands */
const writtenCommands = (commands) => (isRecord(commands) ? Object.fromEntries(Object.entries(commands).filter(([, line]) => !isBlank(line))) : commands)

/** @param {unknown} line */
const isBlank = (line) => typeof line === 'string' && line.trim() === ''

/**
 * Each consent the edit changes, kept with the version of the question it answers; null removes
 * the answer, so that the run asks it again.
 * @param {Record<string, any>} raw @param {import('./skraft-config.mjs').Publish} publish @param {Record<string, boolean | null>} consents
 */
const withConsents = (raw, publish, consents) => Object.entries(consents)
  .filter(([key, value]) => value !== publish[/** @type {'pullRequest' | 'visuals'} */ (key)])
  .reduce((next, [key, value]) => withConsent(next, /** @type {'pullRequest' | 'visuals'} */ (key), value), raw)

/** @param {Record<string, any>} raw @param {'pullRequest' | 'visuals'} key @param {boolean | null} value */
const withConsent = (raw, key, value) => {
  const publish = withLocalKey(isRecord(raw.publish) ? raw.publish : {}, key, value === null ? null : value)
  const versions = withLocalKey(isRecord(publish.questionVersions) ? publish.questionVersions : {}, key, value === null ? null : CONSENT_VERSIONS[key])
  return { ...raw, publish: withLocalKey(publish, 'questionVersions', versions) }
}

/** @param {Record<string, unknown>} record @param {readonly string[]} keys */
const onlyKeys = (record, keys) => Object.keys(record).every((key) => keys.includes(key))

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
