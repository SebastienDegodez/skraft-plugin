import { contentProblems, publishedProblems, statusProblems } from '../../domain/decisions/adr-content.mjs'
import { adrNumber, linkedAdrs, unpublishedLink, unpublishedProblems } from '../../domain/decisions/adr.mjs'
import { adrFiles } from './adr-ratification.mjs'

/**
 * @typedef {{
 *   workspace: import('../ports/workspace.mjs').Workspace,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 * }} AdrDeps
 * @typedef {import('../config/bases.mjs').Base} Base
 * @typedef {{ path: string, text: string }} AdrFile
 * @typedef {{ path: string, text: string | null }} ChangedAdr text: null when the attempt deleted the file
 */

/**
 * What the ADRs an attempt changed break. An ADR not on the run's base yet is edited in place,
 * stays Proposed until a human ratifies it, names no version, holds one decision and neither
 * supersedes nor amends another unpublished one (#209). An ADR the base holds changes only its
 * status lines and is never deleted. Every ADR changed has a status of the closed set.
 * @param {AdrDeps} deps
 * @param {{ base: Base[], touched: string[] }} attempt touched: the files it changed, relative to the working copy
 * @returns {Promise<string[] | string>} a string: why the machine cannot tell
 */
export const adrFailures = async (deps, { base, touched }) => {
  const changed = await read(deps, touched.filter((file) => adrNumber(file) !== null))
  const { onBase, drafts } = await split(deps, base, changed)
  const kept = await publishedFailures(deps, base, onBase)
  if (typeof kept === 'string') return kept
  const drafted = await draftFailures(deps, base, drafts)
  if (typeof drafted === 'string') return drafted
  return [...drafted, ...kept, ...present(changed).flatMap(({ path, text }) => statusProblems(path, text))]
}

/**
 * The ADRs among the paths, with their text; null for one the attempt deleted.
 * @param {AdrDeps} deps @param {string[]} paths
 * @returns {Promise<ChangedAdr[]>}
 */
const read = async (deps, paths) => {
  const files = []
  for (const path of paths) files.push({ path, text: await deps.workspace.read(path) })
  return files
}

/** @param {ChangedAdr[]} adrs @returns {AdrFile[]} */
const present = (adrs) => /** @type {AdrFile[]} */ (adrs.filter(({ text }) => text !== null))

/**
 * The ADRs the base holds, and those that exist and are not on it yet.
 * @param {AdrDeps} deps @param {Base[]} base @param {ChangedAdr[]} adrs
 */
const split = async (deps, base, adrs) => {
  const onBase = []
  const drafts = []
  for (const adr of adrs) {
    if (await published(deps, base, adr.path)) onBase.push(adr)
    else if (adr.text !== null) drafts.push({ path: adr.path, text: adr.text })
  }
  return { onBase, drafts }
}

/**
 * The base of the working copy. An ADR is touched only through the heads of the run's bases, so a
 * run that touched one has it: a working copy in no repository has no head to change a file in.
 * @param {Base[]} base
 */
const ownBase = (base) => /** @type {Base} */ (base.find((entry) => entry.component === null))

/**
 * What an ADR the base holds breaks: a change beyond its status lines, a deletion.
 * @param {AdrDeps} deps @param {Base[]} base @param {ChangedAdr[]} adrs
 * @returns {Promise<string[] | string>} a string: why Git cannot give the text on the base
 */
const publishedFailures = async (deps, base, adrs) => {
  const own = ownBase(base)
  const problems = []
  for (const { path, text } of adrs) {
    const before = await deps.sourceControl.show('.', own.sha, path)
    if (before === null) return `Git cannot read ${path} at ${own.sha}`
    problems.push(...publishedProblems(path, before, text))
  }
  return problems
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
 * Whether the working copy's base holds the file.
 * @param {AdrDeps} deps @param {Base[]} base @param {string} path relative to the working copy
 */
const published = ({ sourceControl }, base, path) => sourceControl.existsAt('.', ownBase(base).sha, path)

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
