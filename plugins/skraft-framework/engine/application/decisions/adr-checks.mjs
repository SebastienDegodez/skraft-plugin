import { contentProblems, statusProblems } from '../../domain/decisions/adr-content.mjs'
import { adrNumber, linkedAdrs, unpublishedLink, unpublishedProblems } from '../../domain/decisions/adr.mjs'
import { adrFiles } from './adr-ratification.mjs'

/**
 * @typedef {{
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * }} AdrDeps
 * @typedef {import('../config/bases.mjs').Base} Base
 * @typedef {{ path: string, text: string }} AdrFile
 */

/**
 * What the ADRs an attempt changed break. An ADR not on the run's base yet is edited in place,
 * stays Proposed until a human ratifies it, names no version, holds one decision and neither
 * supersedes nor amends another unpublished one (#209); every ADR changed has a status of the
 * closed set.
 * @param {AdrDeps} deps
 * @param {{ base: Base[], touched: string[] }} attempt touched: the files it changed, relative to the working copy
 * @returns {Promise<string[] | string>} a string: why the ADR folder cannot be listed
 */
export const adrFailures = async (deps, { base, touched }) => {
  const present = await existing(deps, touched.filter((file) => adrNumber(file) !== null))
  const drafted = await draftFailures(deps, base, await unpublishedAmong(deps, base, present))
  if (typeof drafted === 'string') return drafted
  return [...drafted, ...present.flatMap(({ path, text }) => statusProblems(path, text))]
}

/**
 * What the ADRs not on the base yet break; empty without any.
 * @param {AdrDeps} deps @param {Base[]} base @param {AdrFile[]} drafts
 * @returns {Promise<string[] | string>}
 */
const draftFailures = async (deps, base, drafts) => {
  if (drafts.length === 0) return []
  const adrs = await adrFiles(deps)
  if (typeof adrs === 'string') return adrs
  const problems = []
  for (const { path, text } of drafts) problems.push(...unpublishedProblems(path, text), ...contentProblems(path, text), ...(await linkProblems(deps, { base, adrs }, path, text)))
  return problems
}

/**
 * The ADRs among the paths that exist, with their text.
 * @param {AdrDeps} deps @param {string[]} paths
 * @returns {Promise<AdrFile[]>}
 */
const existing = async (deps, paths) => {
  const files = []
  for (const path of paths) {
    const text = await deps.workspace.read(path)
    if (text !== null) files.push({ path, text })
  }
  return files
}

/**
 * The ADRs that are not on the base yet.
 * @param {AdrDeps} deps @param {Base[]} base @param {AdrFile[]} adrs
 */
const unpublishedAmong = async (deps, base, adrs) => {
  const drafts = []
  for (const adr of adrs) if (!(await published(deps, base, adr.path))) drafts.push(adr)
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
