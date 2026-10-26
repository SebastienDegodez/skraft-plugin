import { AGENT_TYPES, EFFORTS, FAMILY, HOSTS, INHERIT, isTier, ownOf, TIERS, tierOf } from './model-assignment.mjs'

/**
 * `models` and `assign` as one layer of the configuration writes them, checked in the order
 * their errors are listed. A layer is a patch on the ones below it: `null` anywhere in them
 * removes what a lower layer set, and is left out of what is read.
 *
 * @typedef {import('./model-assignment.mjs').Models} Models
 * @typedef {import('./model-assignment.mjs').FamilySettings} FamilySettings
 * @typedef {import('./model-assignment.mjs').HostSetting} HostSetting
 * @typedef {import('./model-assignment.mjs').Assign} Assign
 * @typedef {import('./model-assignment.mjs').Rule} Rule
 * @typedef {import('./model-assignment.mjs').ModelSettings} ModelSettings
 */

const AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FAMILY_WORD = 'a kebab-case word whose every part starts with a letter, such as implementer or gpt-codex (gpt-5.5 is a model, not a family)'
const RULE = 'a model family, inherit, or { "family": ..., "<host>": { "effort": ... } }'
const MODEL_IN_ASSIGN = 'a model is chosen in models, by family, never in assign'

/** @param {Record<string, any>} raw @param {string[]} errors @returns {ModelSettings} */
export const modelSettingsOf = (raw, errors) => ({ models: modelsOf(raw.models, errors), assign: assignOf(raw.assign, errors) })

/** @param {unknown} value @returns {value is string} */
const isFamily = (value) => typeof value === 'string' && value !== INHERIT && FAMILY.test(value)

/** @param {unknown} value */
const isFamilyOrInherit = (value) => value === INHERIT || isFamily(value)

/** @param {unknown} models @param {string[]} errors @returns {Models} */
const modelsOf = (models, errors) => {
  if (models === undefined || models === null) return {}
  if (!isRecord(models)) {
    errors.push('models must be an object of model families: tiers, roles or free families')
    return {}
  }
  return keptEntries(models, (family, settings) => familySettingsOf(family, settings, errors))
}

/**
 * Each entry read. A null entry, which a layer may hold, is checked and read like any other: the
 * merge removes it before the merged configuration is read.
 * @template T @param {Record<string, unknown>} record @param {(key: string, value: unknown) => T} read
 * @returns {Record<string, T>}
 */
const keptEntries = (record, read) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, read(key, value)]))

/** @param {string} family @param {unknown} settings @param {string[]} errors @returns {FamilySettings} */
const familySettingsOf = (family, settings, errors) => {
  if (!isFamily(family)) errors.push(`models: ${JSON.stringify(family)} must be a model family, ${FAMILY_WORD}`)
  if (settings === null) return {}
  if (!isRecord(settings)) {
    errors.push(`models.${family} must be an object: an optional tier beside one block per host (${HOSTS.join(', ')})`)
    return {}
  }
  return keptEntries(settings, (key, value) => familyFieldOf(`models.${family}`, { family, key, value }, errors))
}

/**
 * @param {string} at @param {{ family: string, key: string, value: unknown }} field @param {string[]} errors
 * @returns {any} the tier, or the host's setting
 */
const familyFieldOf = (at, { family, key, value }, errors) => {
  if (key === 'tier') return tierFieldOf(at, family, value, errors)
  if (HOSTS.includes(/** @type {any} */ (key))) return hostSettingFieldOf(`${at}.${key}`, value, errors)
  errors.push(`${at}: unknown key ${key} (allowed: tier, ${HOSTS.join(', ')})`)
  return value
}

/** @param {string} at @param {string} family @param {unknown} tier @param {string[]} errors */
const tierFieldOf = (at, family, tier, errors) => {
  if (isTier(family)) errors.push(`${at}: a tier takes no tier`)
  else if (tier !== null && !isTier(/** @type {string} */ (tier))) errors.push(`${at}.tier must be one of ${TIERS.join(', ')}`)
  return tier
}

/** @param {string} at @param {unknown} setting @param {string[]} errors @returns {HostSetting} */
const hostSettingFieldOf = (at, setting, errors) => {
  if (setting === null) return {}
  if (!isRecord(setting)) {
    errors.push(`${at} must be an object: { "model": ..., "effort": ... }`)
    return {}
  }
  return keptEntries(setting, (key, value) => hostFieldOf(at, key, value, errors))
}

/** @type {Readonly<Record<string, { valid: (value: unknown) => boolean, expected: string, read: (value: any) => unknown }>>} */
const HOST_FIELDS = Object.freeze({
  __proto__: null,
  model: { valid: (value) => isModelNames(value), expected: 'must be a model name or a non-empty list of model names, tried in order', read: (value) => [value].flat() },
  effort: { valid: (value) => EFFORTS.includes(/** @type {any} */ (value)), expected: `must be one of ${EFFORTS.join(', ')}`, read: (value) => value },
})

/** @param {string} at @param {string} key @param {unknown} value @param {string[]} errors */
const hostFieldOf = (at, key, value, errors) => {
  const field = HOST_FIELDS[key]
  if (field === undefined) errors.push(`${at}: unknown key ${key} (allowed: model, effort)`)
  else if (value !== null && !field.valid(value)) errors.push(`${at}.${key} ${field.expected}`)
  return field === undefined ? value : field.read(value)
}

/** @param {unknown} name */
const isModelName = (name) => typeof name === 'string' && name.trim() !== ''

/** @param {unknown} names */
const isModelNames = (names) => isModelName(names) || (Array.isArray(names) && names.length > 0 && names.every(isModelName))

const ASSIGN_KEYS = Object.freeze(['default', 'types', 'agents'])

/** No rule at all. @returns {Assign} */
const noAssign = () => ({ default: null, types: {}, agents: {} })

/** @param {unknown} assign @param {string[]} errors @returns {Assign} */
const assignOf = (assign, errors) => {
  if (assign === undefined || assign === null) return noAssign()
  if (!isRecord(assign)) {
    errors.push(`assign must be an object: { ${ASSIGN_KEYS.map((key) => `"${key}"`).join(', ')} }`)
    return noAssign()
  }
  for (const key of Object.keys(assign).filter((key) => !ASSIGN_KEYS.includes(key))) errors.push(`assign: unknown key ${key} (allowed: ${ASSIGN_KEYS.join(', ')})`)
  return { default: defaultOf(assign.default, errors), types: rulesOf(TYPES_AT, assign.types, errors), agents: rulesOf(AGENTS_AT, assign.agents, errors) }
}

/** @param {unknown} value @param {string[]} errors @returns {string | null} */
const defaultOf = (value, errors) => {
  if (value === undefined || value === null) return null
  if (isFamilyOrInherit(value)) return /** @type {string} */ (value)
  errors.push('assign.default must be a model family or inherit')
  return null
}

/** @typedef {{ name: string, of: string, valid: (key: string) => boolean, invalid: (key: string) => string }} RuleList */

/** @type {RuleList} */
const TYPES_AT = Object.freeze({ name: 'types', of: 'agent type', valid: (key) => AGENT_TYPES.includes(/** @type {any} */ (key)), invalid: (key) => `assign.types: unknown type ${key} (allowed: ${AGENT_TYPES.join(', ')})` })
/** @type {RuleList} */
const AGENTS_AT = Object.freeze({ name: 'agents', of: 'agent id', valid: (key) => AGENT_ID.test(key), invalid: (key) => `assign.agents: ${JSON.stringify(key)} must be a kebab-case agent id` })

/** @param {RuleList} list @param {unknown} rules @param {string[]} errors @returns {Record<string, Rule>} */
const rulesOf = (list, rules, errors) => {
  if (rules === undefined || rules === null) return {}
  if (!isRecord(rules)) {
    errors.push(`assign.${list.name} must be an object of rules by ${list.of}`)
    return {}
  }
  return keptEntries(rules, (key, rule) => {
    if (!list.valid(key)) errors.push(list.invalid(key))
    return ruleOf(`assign.${list.name}.${key}`, rule, errors)
  })
}

/** @param {string} at @param {unknown} rule @param {string[]} errors @returns {Rule} */
const ruleOf = (at, rule, errors) => {
  if (isFamilyOrInherit(rule)) return { family: /** @type {string} */ (rule), effort: {} }
  if (isRecord(rule)) return objectRuleOf(at, rule, errors)
  if (rule !== null) errors.push(`${at} must be ${RULE}`)
  // Stryker disable next-line ObjectLiteral: a null or a wrong rule is never read, since only a merged configuration without errors is
  return { family: null, effort: {} }
}

/** @param {string} at @param {Record<string, unknown>} rule @param {string[]} errors @returns {Rule} */
const objectRuleOf = (at, rule, errors) => {
  for (const key of Object.keys(rule)) ruleKeyCheck(at, key, rule[key], errors)
  const family = isFamilyOrInherit(rule.family) ? /** @type {string} */ (rule.family) : null
  return { family, effort: Object.fromEntries(HOSTS.flatMap((host) => effortEntry(rule[host]).map((effort) => [host, effort]))) }
}

/** @param {unknown} block @returns {unknown[]} the effort a host's block sets, none when it sets none */
const effortEntry = (block) => (isRecord(block) && EFFORTS.includes(/** @type {any} */ (block.effort)) ? [block.effort] : [])

/** @param {string} at @param {string} key @param {unknown} value @param {string[]} errors */
const ruleKeyCheck = (at, key, value, errors) => {
  if (key === 'family') {
    if (value !== null && !isFamilyOrInherit(value)) errors.push(`${at}.family must be a model family or inherit`)
  } else if (key === 'model') errors.push(`${at}: ${MODEL_IN_ASSIGN}`)
  else if (HOSTS.includes(/** @type {any} */ (key))) ruleHostCheck(`${at}.${key}`, value, errors)
  else errors.push(`${at}: unknown key ${key} (allowed: family, ${HOSTS.join(', ')})`)
}

/** @param {string} at @param {unknown} block @param {string[]} errors */
const ruleHostCheck = (at, block, errors) => {
  if (block === null) return
  if (!isRecord(block)) {
    errors.push(`${at} must be an object: { "effort": ... }`)
    return
  }
  for (const key of Object.keys(block)) {
    if (key === 'model') errors.push(`${at}: ${MODEL_IN_ASSIGN}`)
    else if (key !== 'effort') errors.push(`${at}: unknown key ${key} (allowed: effort)`)
    else if (block.effort !== null && !EFFORTS.includes(/** @type {any} */ (block.effort))) errors.push(`${at}.effort must be one of ${EFFORTS.join(', ')}`)
  }
}

/**
 * What only the merged configuration can tell: a free family with no tier, and a family `assign`
 * names that nothing ranks.
 * @param {ModelSettings} settings @returns {string[]}
 */
export const unrankedFamilies = ({ models, assign }) => [
  ...Object.keys(models).filter((family) => tierOf(family, models) === null).map((family) => `models.${family} is a free family: give it a "tier" (${TIERS.join(', ')})`),
  ...assignedFamilies(assign)
    .filter(([, family]) => family !== INHERIT && tierOf(family, models) === null && ownOf(models, family) === undefined)
    .map(([at, family]) => `${at} names ${family}, which no tier ranks: declare it in models with a "tier"`),
]

/** @param {Assign} assign @returns {Array<[string, string]>} where each family is named, and the family */
const assignedFamilies = (assign) => /** @type {Array<[string, string]>} */ ([
  ['assign.default', assign.default],
  ...Object.entries(assign.types).map(([type, rule]) => [`assign.types.${type}`, rule.family]),
  ...Object.entries(assign.agents).map(([agent, rule]) => [`assign.agents.${agent}`, rule.family]),
].filter(([, family]) => family !== null))

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
