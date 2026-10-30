import { contentProblems } from '../../domain/decisions/adr-content.mjs'
import { adrNumber, linkedAdrs, unpublishedLink, unpublishedProblems } from '../../domain/decisions/adr.mjs'
import { adrFiles } from './adr-ratification.mjs'

/**
 * @typedef {{
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * }} AdrDeps
 * @typedef {import('../config/bases.mjs').Base} Base
 */

/**
 * What the ADRs an attempt changed break while they are not on the run's base yet: an ADR is
 * edited in place, stays Proposed until a human ratifies it, and neither supersedes nor amends
 * another unpublished one (#209).
 * @param {AdrDeps} deps
 * @param {{ base: Base[], touched: string[] }} attempt touched: the files it changed, relative to the working copy
 * @returns {Promise<string[] | string>} a string: why the ADR folder cannot be listed
 */
export const adrFailures = async (deps, { base, touched }) => {
  const drafts = await unpublishedAdrs(deps, base, touched.filter((file) => adrNumber(file) !== null))
  if (drafts.length === 0) return []
  const adrs = await adrFiles(deps)
  if (typeof adrs === 'string') return adrs
  const problems = []
  for (const { path, text } of drafts) problems.push(...unpublishedProblems(path, text), ...contentProblems(path, text), ...(await linkProblems(deps, { base, adrs }, path, text)))
  return problems
}

/**
 * The ADRs among the paths that exist and are not on the base yet, with their text.
 * @param {AdrDeps} deps @param {Base[]} base @param {string[]} paths
 * @returns {Promise<Array<{ path: string, text: string }>>}
 */
const unpublishedAdrs = async (deps, base, paths) => {
  const drafts = []
  for (const path of paths) {
    const text = await deps.workspace.read(path)
    if (text !== null && !(await published(deps, base, path))) drafts.push({ path, text })
  }
  return drafts
}

/**
 * Whether the working copy's base holds the file; without a base (no Git) it counts as published.
 * @param {AdrDeps} deps @param {Base[]} base @param {string} path relative to the working copy
 */
const published = async ({ sourceControl }, base, path) => {
  const own = base.find((entry) => entry.component === null)
  return own === undefined || sourceControl.existsAt('.', own.sha, path)
}

/** @param {AdrDeps} deps @param {{ base: Base[], adrs: string[] }} known @param {string} path @param {string} text */
const linkProblems = async (deps, { base, adrs }, path, text) => {
  const others = adrs.filter((other) => other !== path)
  const problems = []
  for (const link of linkedAdrs(text)) {
    const target = others.find((other) => adrNumber(other) === link.number)
    if (target !== undefined && !(await published(deps, base, target))) problems.push(unpublishedLink(path, link, target))
  }
  return problems
}
