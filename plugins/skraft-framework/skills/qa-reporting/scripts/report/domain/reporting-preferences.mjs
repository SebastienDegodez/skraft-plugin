import { Ok, Err } from './result.mjs'
import { normalizeProviderScope } from './report-mcp-policy.mjs'

const FIELDS = new Set([
  'confirmed', 'repo', 'branch', 'prNumber', 'issueNumber',
  'destinations', 'maxMedia', 'allowDraftPr',
])
const PROVIDER_FIELDS = ['provider', 'host', 'organization', 'project']
const SUPPORTED_FIELDS = new Set([...FIELDS, ...PROVIDER_FIELDS])
const DESTINATIONS = new Set(['pr', 'issue', 'chat'])
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasOnly = (value, fields) => Reflect.ownKeys(value).every((key) => fields.has(key))
const isTargetNumber = (value) => value === null || (Number.isSafeInteger(value) && value > 0)
const isBranch = (value) => typeof value === 'string' &&
  !value.startsWith('-') && !value.endsWith('.') &&
  !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) &&
  !value.includes('..') && !value.includes('@{') &&
  (value === '' || value.split('/').every((part) => part !== '' && !part.startsWith('.') && !part.endsWith('.lock')))
const invalid = (reason) => Err({ code: 'INVALID_REPORTING_PREFERENCES', reason })

// Validate explicit choices only: no defaults, consent inference, or IO.
export const validateReportingPreferences = (prefs) => {
  if (!isObject(prefs) || !hasOnly(prefs, SUPPORTED_FIELDS)) {
    return invalid('Reporting preferences must be an object with only supported fields')
  }
  if ([...FIELDS].some((field) => field !== 'repo' && !Object.hasOwn(prefs, field))) {
    return invalid('Reporting preferences require every explicit choice except an unused repository')
  }
  if (prefs.confirmed !== true || typeof prefs.allowDraftPr !== 'boolean') {
    return invalid('Reporting requires confirmed consent and explicit draft PR permission')
  }
  const destinations = prefs.destinations
  if (!isObject(destinations) || !hasOnly(destinations, DESTINATIONS) ||
      [...DESTINATIONS].some((field) => !Object.hasOwn(destinations, field)) ||
      typeof destinations.pr !== 'boolean' || typeof destinations.chat !== 'boolean' ||
      !['none', 'link', 'full'].includes(destinations.issue)) {
    return invalid('Destinations require PR/chat booleans and an issue mode of none, link, or full')
  }
  if (!isTargetNumber(prefs.prNumber) || !isTargetNumber(prefs.issueNumber) ||
      !Number.isSafeInteger(prefs.maxMedia) || prefs.maxMedia < 0) {
    return invalid('Targets must be positive integers or null; maxMedia must be a non-negative integer')
  }
  const remote = destinations.pr || destinations.issue !== 'none'
  try {
    normalizeProviderScope(prefs, { requireRepo: remote })
  } catch (error) {
    return invalid(error.message)
  }
  if (!isBranch(prefs.branch) || (destinations.pr && prefs.branch === '')) {
    return invalid('Branch must be valid, and nonempty for a PR destination')
  }
  if (destinations.issue === 'link' && !destinations.pr) {
    return invalid('An issue pointer requires a PR destination')
  }
  if (destinations.issue === 'full' && prefs.issueNumber === null) {
    return invalid('A full issue report requires an issue number')
  }
  return Ok(prefs)
}