import { adrStatus, briefPath, briefProblem, citedPaths, freshnessOf, normalBody, readBrief } from '../../domain/architecture/brief.mjs'
import { branchSlug } from '../../domain/pipeline/slug.mjs'
import { loadConfig } from '../config/bases.mjs'
import { newProposedAdrs } from '../decisions/adr-ratification.mjs'

/**
 * A delivery's light design (#669): with no brief merged for its story, a light designer writes one
 * on the delivery's branch before DISTILL, under the identity the engine gives it in this plan.
 */
export const LIGHT_DESIGN_FILE = 'plans/light-design.json'

/**
 * The plan of the light design of a story: its identity, the path of its brief and the components
 * the brief may cite; written in the run's tracking folder, its path returned.
 * @param {any} deps @param {string} slug @param {{ number: number, title: string, body: string, forge: string, repository: string }} issue
 */
export const writeLightDesignPlan = async (deps, slug, issue) => {
  const loaded = await loadConfig(deps)
  const components = loaded.ok ? loaded.config.components.map(({ name, root, stack }) => ({ name, root, stack })) : []
  const bodySha256 = await deps.hasher.sha256(normalBody(issue.body))
  const plan = { issue: issue.number, forge: issue.forge, repository: issue.repository, bodySha256, brief: briefPath(slug, issue.number, branchSlug(issue.title) || 'story'), components }
  await deps.files.write(slug, LIGHT_DESIGN_FILE, `${JSON.stringify(plan, null, 2)}\n`)
  return LIGHT_DESIGN_FILE
}

/** The plan of the run's light design; null when it has none. @param {any} deps @param {string} slug */
export const lightDesignPlan = async (deps, slug) => {
  try {
    return JSON.parse(/** @type {string} */ (await deps.files.read(slug, LIGHT_DESIGN_FILE)))
  } catch {
    return null
  }
}

/**
 * Why the light brief an attempt left sends the light designer back: none, unreadable, another
 * identity than the plan's, a component the plan does not list, a cited file missing, an ADR
 * neither Accepted nor a new Proposed one, or a new ADR the brief does not cite.
 * @param {any} deps @param {{ slug: string, base: ReadonlyArray<{ component: string | null, sha: string }> }} run
 * @returns {Promise<string[]>}
 */
export const lightBriefFailures = async (deps, { slug, base }) => {
  const plan = await lightDesignPlan(deps, slug)
  if (plan === null) return [`${LIGHT_DESIGN_FILE} is missing: start the delivery again.`]
  const text = await deps.workspace.read(plan.brief)
  const brief = readBrief(text)
  if (brief === null) return [`${plan.brief}: ${text === null ? 'write the light brief at this path' : `the brief is unreadable: ${briefProblem(text)}`}.`]
  if (freshnessOf(brief, { ...plan, number: plan.issue }) !== 'current') return [identityFailure(plan)]
  return [...componentFailures(plan, brief), ...await citedFailures(deps, brief, rootSha(base)), ...await uncitedFailures(deps, brief, base)]
}

/** Each ADR the light design wrote that its brief does not cite: no criterion relies on it. @param {any} deps @param {any} brief @param {any} base */
const uncitedFailures = async (deps, brief, base) => {
  const written = await newProposedAdrs(deps, base)
  if (typeof written === 'string') return [written]
  return written.filter((path) => !brief.adrs.includes(path)).map((path) => `${path}: cite it in the brief's adrs and in each criterion that relies on it, or delete it.`)
}

/** @param {any} plan */
const identityFailure = (plan) => `${plan.brief}: the brief header does not match the engine's identity; copy exactly issue, forge, repository and bodySha256 from ${LIGHT_DESIGN_FILE}.`

/** @param {ReadonlyArray<{ component: string | null, sha: string }>} base */
const rootSha = (base) => (base.find(({ component }) => component === null) ?? base[0])?.sha ?? null

/** @param {any} plan @param {any} brief */
const componentFailures = (plan, brief) => {
  const known = new Set(plan.components.flatMap(({ name, root }) => [name, root]))
  const roots = plan.components.map(({ root }) => root).join(', ') || 'none'
  return brief.components.filter((component) => !known.has(component)).map((component) => `${component}: no component of this working copy has that root; cite one of ${roots}.`)
}

/** @param {any} deps @param {any} brief @param {string | null} sha */
const citedFailures = async (deps, brief, sha) => {
  const failures = []
  for (const path of citedPaths(brief)) failures.push(...await citedFailure(deps, brief, path, sha))
  return failures
}

/** @param {any} deps @param {any} brief @param {string} path @param {string | null} sha */
const citedFailure = async (deps, brief, path, sha) => {
  const text = await deps.workspace.read(path)
  if (text === null) return [`${path}: an architecture dependency is missing.`]
  if (!brief.adrs.includes(path) || await acceptedOrNew(deps, text, path, sha)) return []
  return [`${path}: cite an Accepted ADR or a new Proposed ADR of this light design.`]
}

/** @param {any} deps @param {string} text @param {string} path @param {string | null} sha */
const acceptedOrNew = async (deps, text, path, sha) => {
  const status = adrStatus(text)
  if (status === 'Accepted') return true
  return status === 'Proposed' && sha !== null && !await deps.sourceControl.existsAt('.', sha, path)
}
