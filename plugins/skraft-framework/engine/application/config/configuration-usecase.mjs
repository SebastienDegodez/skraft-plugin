import { COMMAND_NAMES, CONFIG_FILE, configText, LOCAL_CONFIG_FILE, MOCKING_STRATEGIES, readConfigLayers, refusalOf, STACKS } from '../../domain/config/skraft-config.mjs'
import { AGENT_TYPES, EFFORTS, HOSTS, INHERIT, ROLES, TIERS } from '../../domain/config/model-assignment.mjs'
import { EDITED_CONSENTS, editedLocal, editedTeam, editRefusal } from '../../domain/config/configuration-edit.mjs'
import { FORGES } from '../../domain/config/forge.mjs'
import { consentOf } from '../../domain/decisions/consents.mjs'
import { MUTATION_BARS } from '../../domain/gates/mutation-bar.mjs'
import { assignmentTable } from '../diagnostics/model-checks.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { loadConfig } from './bases.mjs'
import { remoteForge } from './forge.mjs'
import { ignoreLocalConfig } from './local-config.mjs'

/**
 * Configuration — what a page shows of the configuration a run starts with, and the edit a
 * person saves from it, into the files the CLI writes: the forge (skraft-config.json, and the one
 * the Git remote names), the components and the consents in
 * skraft-config.json, the models the person chooses in their own skraft-config.local.json. An
 * edit is checked as the configuration is when a run loads it: refused whole, nothing written,
 * when a file it gives would be invalid. The quality bar is shown; no file changes it.
 *
 * @typedef {import('../../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {import('../../domain/config/configuration-edit.mjs').ConfigurationEdit} ConfigurationEdit
 * @typedef {{
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   userSettings: import('../ports/user-settings.mjs').UserSettings,
 *   workflowSource: import('../ports/workflow-source.mjs').WorkflowSource,
 *   agentCatalog: import('../ports/agent-catalog.mjs').AgentCatalog,
 *   sourceControl: Pick<import('../ports/source-control.mjs').SourceControl, 'remoteUrl'>,
 * }} ConfigurationDeps
 * @typedef {{ ok: true, config: SkraftConfig, present: boolean, raw: Record<string, any>, local: Record<string, any> }} Loaded
 * @typedef {{ ok: boolean, reason: string }} Saved
 */

/** @param {ConfigurationDeps} deps */
export const createConfiguration = (deps) => Object.freeze({
  view: () => view(deps),
  /** @param {unknown} edit @returns {Promise<Saved>} */
  save: (edit) => save(deps, edit),
})

/** @param {ConfigurationDeps} deps */
const view = async (deps) => {
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return loaded
  return { ok: /** @type {const} */ (true), ...shown(/** @type {Loaded} */ (loaded)), forge: await forgeOf(deps, /** @type {Loaded} */ (loaded).config), models: await modelsOf(deps, /** @type {Loaded} */ (loaded)) }
}

/** The forge the files name, null when none, and the one the Git remote names, which a run takes then. @param {ConfigurationDeps} deps @param {SkraftConfig} config */
const forgeOf = async ({ sourceControl }, config) => ({ named: config.forge, deduced: await remoteForge(sourceControl) })

/** What the files say, as the page shows it. @param {Loaded} loaded */
const shown = ({ config }) => ({
  confirmed: config.configurationConfirmed,
  files: { team: CONFIG_FILE, local: LOCAL_CONFIG_FILE },
  components: config.components.map(({ name, root, stack, commands, mocking, contractTesting }) => ({ name, root, stack, commands, mocking: mocking.strategy, contractTesting })),
  consents: EDITED_CONSENTS.map((key) => ({ key, value: config.publish[key], state: consentOf(config.publish, key) })),
  thresholds: Object.entries(MUTATION_BARS).map(([scope, bar]) => ({ scope, bar })),
  choices: choicesOf(config),
})

/** What each field may be set to. @param {SkraftConfig} config */
const choicesOf = (config) => ({
  forges: [...FORGES],
  stacks: [...STACKS], mocking: [...MOCKING_STRATEGIES], commands: [...COMMAND_NAMES], hosts: [...HOSTS], types: [...AGENT_TYPES], efforts: [...EFFORTS],
  families: [INHERIT, ...TIERS, ...Object.keys(ROLES), ...Object.keys(config.models).filter((family) => !TIERS.includes(/** @type {any} */ (family)) && !Object.hasOwn(ROLES, family))],
})

/**
 * The person's own choices, and what each agent of the workflow runs on, by host; null when the
 * workflow cannot be read.
 * @param {ConfigurationDeps} deps @param {Loaded} loaded
 */
const modelsOf = async (deps, { config, local }) => {
  const loading = await loadWorkflow(deps, {})
  return { assign: local.assign ?? {}, models: local.models ?? {}, agents: loading.ok ? assignmentTable(config, loading.workflow) : null }
}

/** @param {ConfigurationDeps} deps @param {unknown} edit @returns {Promise<Saved>} */
const save = async (deps, edit) => {
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return loaded
  const refusal = editRefusal(edit, loaded.config.components.map(({ name }) => name))
  if (refusal !== null) return { ok: false, reason: refusal }
  return written(deps, /** @type {Loaded} */ (loaded), changesOf(/** @type {Loaded} */ (loaded), /** @type {ConfigurationEdit} */ (edit)))
}

/**
 * The files the edit changes, with their new text.
 * @param {Loaded} loaded @param {ConfigurationEdit} edit @returns {Array<{ file: string, text: string }>}
 */
const changesOf = (loaded, edit) => /** @type {Array<[string, Record<string, unknown>, Record<string, unknown>]>} */ ([
  [CONFIG_FILE, loaded.raw, editedTeam(loaded.raw, loaded.config, edit)],
  [LOCAL_CONFIG_FILE, loaded.local, editedLocal(loaded.local, edit)],
]).filter(([, before, after]) => configText(before) !== configText(after)).map(([file, , after]) => ({ file, text: configText(after) }))

/**
 * The changed files written once the configuration they give is valid; none otherwise.
 * @param {ConfigurationDeps} deps @param {Loaded} loaded @param {Array<{ file: string, text: string }>} changes @returns {Promise<Saved>}
 */
const written = async (deps, loaded, changes) => {
  const reading = readConfigLayers(await textsOf(deps, changes))
  if (!reading.ok) return { ok: false, reason: refusalOf(reading.invalid) }
  for (const { file, text } of changes) await deps.workspace.write(file, text)
  if (changes.some(({ file }) => file === LOCAL_CONFIG_FILE)) await ignoreLocalConfig(deps.workspace)
  return { ok: true, reason: changes.length === 0 ? 'nothing changed' : `${changes.map(({ file }) => file).join(' and ')} saved` }
}

/**
 * Each layer's text as it would be once written.
 * @param {ConfigurationDeps} deps @param {Array<{ file: string, text: string }>} changes
 */
const textsOf = async ({ workspace, userSettings }, changes) => {
  const textOf = async (/** @type {string} */ file) => changes.find((change) => change.file === file)?.text ?? workspace.read(file)
  return { user: await userSettings.read(), team: await textOf(CONFIG_FILE), local: await textOf(LOCAL_CONFIG_FILE) }
}
