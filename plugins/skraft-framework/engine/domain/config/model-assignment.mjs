/**
 * Which model family each agent runs on, and the model and the reasoning effort each host gets
 * for it. A family is a tier (economy < standard < frontier, the only rank), a role whose tier
 * is built in (reviewer, researcher, implementer, planner; `tier` changes it), or a free family
 * that declares its `tier`. `inherit` leaves the choice to the host.
 *
 * @typedef {'claude-code' | 'copilot'} Host
 * @typedef {'economy' | 'standard' | 'frontier'} Tier
 * @typedef {'phase' | 'lens' | 'refuter' | 'worker'} AgentType
 * @typedef {'low' | 'medium' | 'high' | 'xhigh' | 'max'} Effort
 * @typedef {{ model?: string[], effort?: Effort }} HostSetting model: tried in order, the same effort for each
 * @typedef {{ tier?: Tier } & Partial<Record<Host, HostSetting>>} FamilySettings
 * @typedef {Readonly<Record<string, FamilySettings>>} Models
 * @typedef {{ family: string | null, effort: Partial<Record<Host, Effort>> }} Rule
 *   family: a family or `inherit`, null when the rule only sets an effort.
 * @typedef {{ default: string | null, types: Partial<Record<AgentType, Rule>>, agents: Record<string, Rule> }} Assign
 * @typedef {{ models: Models, assign: Assign }} ModelSettings
 * @typedef {'agent' | 'workflow' | 'type' | 'default' | 'escalation' | 'host'} FamilySource
 * @typedef {{ family: string | null, source: FamilySource }} Assignment family null: the host decides
 * @typedef {{ agent: string, type: AgentType, workflowFamily?: string | null }} AgentRef
 *   workflowFamily: what an ejected workflow names for it (`model=`, `@<family>`, `refuter=`).
 * @typedef {{ model?: string, models?: Partial<Record<Host, string[]>>, effort?: Partial<Record<Host, Effort>> }} DispatchModel
 */

export const HOSTS = Object.freeze(/** @type {Host[]} */ (['claude-code', 'copilot']))
export const TIERS = Object.freeze(/** @type {Tier[]} */ (['economy', 'standard', 'frontier']))
export const AGENT_TYPES = Object.freeze(/** @type {AgentType[]} */ (['phase', 'lens', 'refuter', 'worker']))
export const EFFORTS = Object.freeze(/** @type {Effort[]} */ (['low', 'medium', 'high', 'xhigh', 'max']))
/** The roles and the tier each one runs on unless `models.<role>.tier` says otherwise. */
export const ROLES = Object.freeze(/** @type {Readonly<Record<string, Tier>>} */ ({ reviewer: 'economy', researcher: 'standard', implementer: 'standard', planner: 'frontier' }))
/** The host decides: no model and no effort. */
export const INHERIT = 'inherit'
/** A family: a kebab-case word whose every part starts with a letter, so never a versioned model (`gpt-5.5`). */
export const FAMILY = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/

/** Layer 1, the plugin's defaults: Claude Code's aliases for each tier, and who runs on what. */
export const PLUGIN_DEFAULTS = Object.freeze({
  models: {
    economy: { 'claude-code': { model: 'haiku' } },
    standard: { 'claude-code': { model: 'sonnet' } },
    frontier: { 'claude-code': { model: 'opus' } },
  },
  assign: {
    default: 'implementer',
    types: { lens: 'reviewer', worker: 'implementer' },
    agents: { 'solution-researcher': 'researcher', 'solution-architect': 'planner' },
  },
})

/** @param {string} family @returns {family is Tier} */
export const isTier = (family) => TIERS.includes(/** @type {Tier} */ (family))

/**
 * A family's tier: its own for a tier, its `tier` in models, a role's built-in one; null for a
 * family nothing ranks.
 * @param {string} family @param {Models} models @returns {Tier | null}
 */
export const tierOf = (family, models) => {
  if (isTier(family)) return family
  return ownOf(models, family)?.tier ?? ownOf(ROLES, family) ?? null
}

/**
 * The first family that applies: the agent's rule, the ejected workflow's, the type's, the
 * default; `inherit` or none leaves it to the host.
 * @param {AgentRef} ref @param {ModelSettings} settings @returns {Assignment}
 */
export const assignFamily = (ref, settings) => assignmentOf(firstNamed([...namedFamilies(ref, settings), ['default', settings.assign.default]]))

/**
 * The refuter's family: the agent's rule, the workflow's `refuter=`, the type's; else one tier
 * above the strongest tier of the lenses it checks, frontier at most.
 * @param {AgentRef} ref @param {Array<string | null>} checked the families of the lenses it checks
 * @param {ModelSettings} settings @returns {Assignment}
 */
export const assignRefuter = (ref, checked, settings) => {
  const named = firstNamed(namedFamilies(ref, settings))
  if (named !== undefined) return assignmentOf(named)
  return { family: escalatedTier(checked.map((family) => tierOf(/** @type {string} */ (family), settings.models))), source: 'escalation' }
}

/** @typedef {[FamilySource, string | null | undefined]} Named */

/** @param {AgentRef} ref @param {ModelSettings} settings @returns {Named[]} */
const namedFamilies = ({ agent, type, workflowFamily = null }, { assign }) => [
  ['agent', ownOf(assign.agents, agent)?.family],
  ['workflow', workflowFamily],
  ['type', ownOf(assign.types, type)?.family],
]

/** @param {Named[]} candidates */
const firstNamed = (candidates) => candidates.find(([, family]) => family != null)

/** @param {Named | undefined} named @returns {Assignment} */
const assignmentOf = (named) => {
  if (named === undefined || named[1] === INHERIT) return { family: null, source: 'host' }
  return { family: /** @type {string} */ (named[1]), source: named[0] }
}

/**
 * A record's own entry, never one its prototype lends (`constructor`), and none for a key that
 * is no string.
 * @template T @param {Readonly<Record<string, T>>} record @param {string | null} key @returns {T | undefined}
 */
export const ownOf = (record, key) => new Map(Object.entries(record)).get(/** @type {string} */ (key))

/**
 * One tier above the strongest of these, frontier at most; a family no tier ranks counts as economy.
 * @param {Array<Tier | null>} tiers @returns {Tier}
 */
export const escalatedTier = (tiers) => {
  const strongest = Math.max(0, ...tiers.map((tier) => TIERS.indexOf(/** @type {Tier} */ (tier))))
  return TIERS[Math.min(TIERS.length - 1, strongest + 1)]
}

/**
 * A family's model and effort for a host: its own, else its tier's, else none (the host decides).
 * @param {string} family @param {Host} host @param {Models} models
 * @returns {{ model: string[] | null, effort: Effort | null, source: { model: 'family' | 'tier' | 'host', effort: 'family' | 'tier' | 'host' } }}
 */
export const hostSettingOf = (family, host, models) => {
  const levels = settingLevels(family, host, models)
  const model = firstSetting(levels, 'model')
  const effort = firstSetting(levels, 'effort')
  return { model: /** @type {string[] | null} */ (model.value), effort: /** @type {Effort | null} */ (effort.value), source: { model: model.source, effort: effort.source } }
}

/** @param {string} family @param {Host} host @param {Models} models @returns {Array<['family' | 'tier', HostSetting | undefined]>} */
const settingLevels = (family, host, models) => {
  const tier = tierOf(family, models)
  return [['family', ownOf(models, family)?.[host]], ['tier', ownOf(models, tier)?.[host]]]
}

/**
 * @template {string} S @param {Array<[S, HostSetting | undefined]>} levels @param {'model' | 'effort'} key
 * @returns {{ value: unknown, source: S | 'host' }}
 */
const firstSetting = (levels, key) => {
  const found = levels.find(([, setting]) => setting?.[key] !== undefined)
  return found === undefined ? { value: null, source: 'host' } : { value: /** @type {HostSetting} */ (found[1])[key], source: found[0] }
}

/**
 * The effort a host gets: the agent's rule for that host, the type's, the family's, its tier's;
 * none without a family.
 * @param {AgentRef & { family: string }} ref @param {Host} host @param {ModelSettings} settings
 * @returns {{ effort: Effort | null, source: 'agent' | 'type' | 'family' | 'tier' | 'host' }}
 */
export const effortOf = ({ agent, type, family }, host, { models, assign }) => {
  const ruled = [['agent', ownOf(assign.agents, agent)?.effort[host]], ['type', ownOf(assign.types, type)?.effort[host]]].find(([, effort]) => effort !== undefined)
  if (ruled !== undefined) return { effort: /** @type {Effort} */ (ruled[1]), source: /** @type {'agent' | 'type'} */ (ruled[0]) }
  const { effort, source } = hostSettingOf(family, host, models)
  return { effort, source: source.effort }
}

/**
 * What a dispatch says about its model: the family, each host's models and each host's effort,
 * each only when resolved; nothing when the host decides.
 * @param {AgentRef} ref @param {string | null} family null: the host decides @param {ModelSettings} settings @returns {DispatchModel}
 */
export const dispatchModelOf = (ref, family, settings) => {
  if (family === null) return {}
  const models = byHost((host) => hostSettingOf(family, host, settings.models).model)
  const effort = byHost((host) => effortOf({ ...ref, family }, host, settings).effort)
  return { model: family, ...(models === null ? {} : { models }), ...(effort === null ? {} : { effort }) }
}

/**
 * @template T @param {(host: Host) => T | null} valueOf
 * @returns {Partial<Record<Host, T>> | null} each host's value, null when no host has one
 */
const byHost = (valueOf) => {
  const entries = HOSTS.map((host) => [host, valueOf(host)]).filter(([, value]) => value !== null)
  return entries.length === 0 ? null : Object.fromEntries(entries)
}
