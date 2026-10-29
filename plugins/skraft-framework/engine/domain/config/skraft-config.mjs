import { GATE_ORDER } from '../gates/gate-plan.mjs'
import { normalizeRelative } from './relative-path.mjs'
import { mergePatch } from './merge-patch.mjs'
import { PLUGIN_DEFAULTS } from './model-assignment.mjs'
import { modelSettingsOf, unrankedFamilies } from './model-settings.mjs'
import { CONSENT_KEYS, CONSENT_VERSIONS } from '../decisions/consents.mjs'

export { HOSTS } from './model-assignment.mjs'

/**
 * `skraft-config.json`: components, each with its root, stack, source and test paths and
 * commands; how TDD commits are replayed; which model family
 * each agent runs on and what each family runs on each host. A command the developer wrote is
 * used as written; nothing here fills in a default. `contractTesting` is off unless the
 * developer turns it on; the review's contract lens reads it.
 *
 * The configuration is four layers, each a JSON Merge Patch (RFC 7386) on the ones before it:
 * the plugin's defaults, the developer's `~/.skraft/config.json`, the team's
 * `skraft-config.json`, the developer's `skraft-config.local.json`. Only the team's file holds
 * components. No file names a workflow: the run follows `.skraft/pipeline.skraft.dot` when the
 * repository ejected it.
 *
 * @typedef {'dotnet' | 'java' | 'python' | 'typescript' | 'javascript' | 'react'} Stack
 * @typedef {{
 *   name: string, root: string, stack: Stack,
 *   paths: { src: string[], tests: string[] },
 *   commands: Record<string, string>,
 *   baseBranch: string | null,
 *   mocking: { strategy: 'microcks' | 'inprocess' },
 *   contractTesting: boolean,
 *   mutationReport: string | null,
 * }} Component
 *   root is relative to the working copy, normalised (`.`, `services/api`, `../payment-web`).
 *   paths are relative to root, normalised; `['.']` (the whole root) when the file names none,
 *   or an empty list (`skraft init` on a project with no tests folder yet). mutationReport: where
 *   the mutation command writes its report, relative to root; null for the one its stack's tool writes.
 * @typedef {'all' | 'last-red'} ReplayMode
 *   all: every red commit is replayed; last-red: only the last red commit of each story.
 * @typedef {import('./model-assignment.mjs').Host} Host
 * @typedef {import('./model-assignment.mjs').Models} Models
 * @typedef {import('./model-assignment.mjs').Assign} Assign
 * @typedef {{ baseBranch: string | null, tdd: { replay: ReplayMode }, publish: Publish, models: Models, assign: Assign, configurationConfirmed: boolean }} Settings
 *   configurationConfirmed: a person confirmed, once, that runs of this working copy start with
 *   its configuration; kept in the developer's own skraft-config.local.json only.
 * @typedef {{ visuals: boolean | null, pullRequest: boolean | null, reviewComment: boolean | null, draft: boolean, questionVersions: Record<import('../decisions/consents.mjs').ConsentKey, number> }} Publish
 *   visuals: whether the run may publish screenshots and videos in the pull request; pullRequest:
 *   whether it may push the branch, open or update its pull request and keep its progress on its
 *   story's issue; reviewComment: whether `skraft review --pr --publish` may keep one comment on the
 *   pull request it reviews; each null until the developer answers its consent question once.
 *   questionVersions: the version of the question each answer was given to, 1 when the file
 *   names none. draft: a pull request skraft opens is a draft, true unless the file says false.
 *   models, assign: the four layers merged.
 * @typedef {Settings & { components: Component[] }} SkraftConfig
 * @typedef {{ file: string, errors: string[] }} InvalidFile
 * @typedef {{ ok: true, present: boolean, config: SkraftConfig, raw: Record<string, unknown>, local: Record<string, unknown> }} ValidConfig
 *   present: whether skraft-config.json exists; raw: the object it holds, {} when absent; local:
 *   the object skraft-config.local.json holds, {} when absent.
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
export const STACKS = Object.freeze(['dotnet', 'java', 'python', 'typescript', 'javascript', 'react'])
const REPLAY_MODES = Object.freeze(['all', 'last-red'])
export const MOCKING_STRATEGIES = Object.freeze(['microcks', 'inprocess'])
const IN_PROCESS_STACKS = Object.freeze(['typescript', 'javascript', 'react'])
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COMPONENT_KEYS = Object.freeze(['name', 'root', 'stack', 'paths', 'commands', 'baseBranch', 'mocking', 'contractTesting', 'mutationReport'])
/** The gates, and `e2e`, which doctor checks but no gate runs. */
export const COMMAND_NAMES = Object.freeze([...GATE_ORDER, 'e2e'])
/** What only the team's file holds. */
const TEAM_KEYS = Object.freeze(['components'])
/** What only the developer's skraft-config.local.json holds. */
export const CONFIRMED_KEY = 'configurationConfirmed'

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
  { key: 'user', file: USER_CONFIG_FILE, check: (raw, file, errors) => checkPersonal(onlyLocal(raw, file, errors), file, errors) },
  { key: 'team', file: CONFIG_FILE, check: (raw, file, errors) => checkTeam(onlyLocal(raw, file, errors), errors) },
  { key: 'local', file: LOCAL_CONFIG_FILE, check: (raw, file, errors) => checkPersonal(raw, file, errors) },
])

/**
 * A layer other than skraft-config.local.json, refused the key only that file holds.
 * @param {Record<string, any>} raw @param {string} file @param {string[]} errors @returns {Record<string, any>}
 */
const onlyLocal = (raw, file, errors) => {
  if (Object.hasOwn(raw, CONFIRMED_KEY)) errors.push(`${CONFIRMED_KEY} belongs in ${LOCAL_CONFIG_FILE}, never in ${file}`)
  return raw
}

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
 * A developer's own layer: no component, which the team shares.
 * @param {Record<string, any>} raw @param {string} file @param {string[]} errors
 */
const checkPersonal = (raw, file, errors) => {
  for (const key of TEAM_KEYS.filter((key) => Object.hasOwn(raw, key))) errors.push(`${key} belongs in ${CONFIG_FILE}, never in ${file}`)
  reportRank(raw, errors)
  const { components, ...personal } = raw
  settingsOf(personal, errors)
}

/** The keys no file holds, with why. */
const NO_KEYS = Object.freeze([
  ['rank', 'the tier of each family ranks it (economy < standard < frontier)'],
  ['workflow', 'skraft workflow eject copies the pipeline into .skraft/pipeline.skraft.dot, the only one a run follows'],
])

/** @param {Record<string, any>} raw @param {string[]} errors */
const reportRank = (raw, errors) => {
  for (const [key, why] of NO_KEYS) if (Object.hasOwn(raw, key)) errors.push(`${key} is no key: ${why}`)
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
  return { ok: true, present: raws[1] !== null, config: { ...settings, components: /** @type {Component[]} */ (components) }, raw: raws[1] ?? {}, local: raws[2] ?? {} }
}

/**
 * The repository-wide keys, checked in the order their errors are listed.
 * @param {Record<string, any>} raw @param {string[]} errors @returns {Settings}
 */
const settingsOf = (raw, errors) => ({
  baseBranch: optionalRef(raw.baseBranch, 'baseBranch', errors),
  tdd: { replay: replayOf(raw.tdd, errors) },
  publish: publishOf(raw.publish, errors),
  ...modelSettingsOf(raw, errors),
  configurationConfirmed: confirmedOf(raw[CONFIRMED_KEY], errors),
})

/** @param {unknown} confirmed @param {string[]} errors */
const confirmedOf = (confirmed = false, errors) => {
  if (typeof confirmed !== 'boolean') errors.push(`${CONFIRMED_KEY} must be true or false`)
  return confirmed === true
}

/**
 * skraft-config.local.json's text once a person confirmed the configuration, every other key kept.
 * @param {Record<string, unknown>} raw the object read from the file ({} when absent)
 */
export const withConfirmedConfiguration = (raw) => `${JSON.stringify({ ...raw, [CONFIRMED_KEY]: true }, null, 2)}\n`

const PUBLISH_KEYS = Object.freeze(['visuals', 'pullRequest', 'reviewComment', 'draft'])

/** @param {unknown} publish @param {string[]} errors @returns {Publish} */
const publishOf = (publish = {}, errors) => {
  if (!isRecord(publish) || !isPublish(publish)) {
    errors.push(`publish must be an object of ${PUBLISH_KEYS.slice(0, -1).join(', ')} and ${PUBLISH_KEYS.at(-1)}, each true or false`)
    return publishFrom({})
  }
  if (publish.questionVersions === undefined || isQuestionVersions(publish.questionVersions)) return publishFrom(publish)
  errors.push(`publish.questionVersions must be an object of ${CONSENT_KEYS.slice(0, -1).join(', ')} and ${CONSENT_KEYS.at(-1)}, each a whole number from 1`)
  return publishFrom({})
}

/**
 * A consent not given yet is null; an answer the file gives no version for answered the first
 * text of its question; a pull request is a draft unless the file says false.
 * @param {Record<string, any>} given @returns {Publish}
 */
const publishFrom = ({ visuals = null, pullRequest = null, reviewComment = null, draft = true, questionVersions = {} }) => ({
  visuals, pullRequest, reviewComment, draft,
  questionVersions: /** @type {Publish['questionVersions']} */ (Object.fromEntries(CONSENT_KEYS.map((key) => [key, questionVersions[key] ?? 1]))),
})

/** Only the keys publish takes, each a boolean but questionVersions. @param {Record<string, unknown>} publish */
const isPublish = (publish) => Object.entries(publish).every(([key, value]) => key === 'questionVersions' || (PUBLISH_KEYS.includes(key) && typeof value === 'boolean'))

/** @param {unknown} versions */
const isQuestionVersions = (versions) => isRecord(versions)
  && Object.entries(versions).every(([key, value]) => CONSENT_KEYS.includes(/** @type {any} */ (key)) && Number.isInteger(value) && /** @type {number} */ (value) >= 1)

/**
 * The file's text with one consent given, and the version of the question it answers, every
 * other key kept.
 * @param {Record<string, unknown>} raw the object read from the file @param {import('../decisions/consents.mjs').ConsentKey} key @param {boolean} value
 */
export const withPublishSetting = (raw, key, value) => {
  const publish = isRecord(raw.publish) ? raw.publish : {}
  const questionVersions = { ...(isRecord(publish.questionVersions) ? publish.questionVersions : {}), [key]: CONSENT_VERSIONS[key] }
  return `${JSON.stringify({ ...raw, publish: { ...publish, [key]: value, questionVersions } }, null, 2)}\n`
}

/** @param {unknown} tdd @param {string[]} errors @returns {any} the replay mode it names, all when absent */
const replayOf = (tdd, errors) => {
  const replay = isRecord(tdd) ? tdd.replay ?? 'all' : tdd === undefined ? 'all' : null
  if (!REPLAY_MODES.includes(replay)) errors.push(`tdd must be { "replay": "${REPLAY_MODES.join('" or "')}" }`)
  return replay
}

/**
 * The file's JSON object, or why the text is not one; never the parser's message, which quotes
 * the file and reaches the outcome and the prompts.
 * @param {string} text @param {string} file @returns {{ ok: true, value: Record<string, any> } | { ok: false, errors: string[] }}
 */
const parseObject = (text, file) => {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, errors: [`${file} is not JSON`] }
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
  ({ entry, label, errors }) => {
    if (entry.mutationReport !== undefined && !isInnerFolder(entry.mutationReport)) errors.push(`${label}: mutationReport must be a file inside the component root`)
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
  mutationReport: entry.mutationReport === undefined ? null : normalizeRelative(entry.mutationReport),
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
export const writeConfig = (raw, components) => configText({ ...raw, components })

/** A configuration file's text: the object, two spaces deep, ending with a new line. @param {Record<string, unknown>} raw */
export const configText = (raw) => `${JSON.stringify(raw, null, 2)}\n`

