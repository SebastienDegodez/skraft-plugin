import { ADR_FOLDER, adrNumber, linkedAdrs, unpublishedLink, unpublishedProblems } from '../domain/decisions/adr.mjs'

/**
 * @typedef {{
 *   workspace: import('./ports/workspace.mjs').Workspace,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 * }} AdrDeps
 * @typedef {import('./bases.mjs').Base} Base
 */

/**
 * What the ADRs an attempt changed break while they are not on the run's base yet: an ADR is
 * edited in place, stays Proposed until a human ratifies it, and neither supersedes nor amends
 * another unpublished one (#209).
 * @param {AdrDeps} deps
 * @param {{ base: Base[], touched: string[] }} attempt touched: the files it changed, relative to the working copy
 * @returns {Promise<string[]>}
 */
export const adrFailures = async (deps, { base, touched }) => {
  const problems = []
  for (const path of touched.filter((file) => adrNumber(file) !== null)) problems.push(...(await adrProblems(deps, base, path)))
  return problems
}

/** @param {AdrDeps} deps @param {Base[]} base @param {string} path */
const adrProblems = async (deps, base, path) => {
  const text = await deps.workspace.read(path)
  if (text === null || (await published(deps, base, path))) return []
  return [...unpublishedProblems(path, text), ...(await linkProblems(deps, base, path, text))]
}

/**
 * Whether the working copy's base holds the file; without a base (no Git) it counts as published.
 * @param {AdrDeps} deps @param {Base[]} base @param {string} path relative to the working copy
 */
const published = async ({ sourceControl }, base, path) => {
  const own = base.find((entry) => entry.component === null)
  return own === undefined || sourceControl.existsAt('.', own.sha, path)
}

/** @param {AdrDeps} deps @param {Base[]} base @param {string} path @param {string} text */
const linkProblems = async (deps, base, path, text) => {
  const others = await otherAdrs(deps, path)
  const problems = []
  for (const link of linkedAdrs(text)) {
    const target = others.find((other) => adrNumber(other) === link.number)
    if (target !== undefined && !(await published(deps, base, target))) problems.push(unpublishedLink(path, link, target))
  }
  return problems
}

/** @param {AdrDeps} deps @param {string} path */
const otherAdrs = async ({ workspace }, path) => ((await workspace.list(ADR_FOLDER)) ?? [])
  .map((entry) => `${ADR_FOLDER}/${entry.name}`)
  .filter((other) => other !== path && adrNumber(other) !== null)
