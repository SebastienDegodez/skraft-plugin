import { branchSlug } from '../../domain/pipeline/slug.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { openJournal } from '../journal/run-journal.mjs'
import { createInit } from '../pipeline/init-usecase.mjs'
import { loadConfig } from '../config/bases.mjs'

/**
 * @typedef {import('../pipeline/init-usecase.mjs').InitDeps & {
 *   files: Pick<import('../ports/tracking-files.mjs').TrackingFiles, 'list' | 'write' | 'forget'>,
 * }} StartMutationDeps
 *   the deps of a mutation run: its own tracking folder, and the workflow it follows
 * @typedef {Omit<import('../pipeline/init-usecase.mjs').InitOutcome, 'code'> & { code: import('../pipeline/init-usecase.mjs').InitCode | 'detached-head' | 'no-mutation-command' | null }} StartOutcome
 */

export const DETACHED_HEAD = 'HEAD is on no branch, and a mutation run is the run of one; check out the branch to mutate, then start it again'
export const NO_MUTATION_COMMAND = 'no component of skraft-deliver-config.json declares a mutation command; declare them with /skraft-init mutation, or skraft init --mutation'

/**
 * StartMutation — makes the run of the branch HEAD is on the active run of the mutation folder.
 * A run that ended is forgotten, journal and files, so that each start mutates the code as it
 * stands; a run still going on, or waiting on a person, resumes. Nothing starts while no
 * component declares a mutation command.
 * @param {StartMutationDeps} deps
 */
export const createStartMutation = (deps) => Object.freeze({
  /** @returns {Promise<StartOutcome>} */
  start: () => start(deps),
})

/** @param {StartMutationDeps} deps @returns {Promise<StartOutcome>} */
const start = async (deps) => {
  const branch = await deps.sourceControl.branch('.')
  if (branch === null) return { ok: false, slug: null, created: false, code: 'detached-head', reason: DETACHED_HEAD }
  const slug = branchSlug(branch)
  if (await declaresNone(deps)) return { ok: false, slug, created: false, code: 'no-mutation-command', reason: NO_MUTATION_COMMAND }
  if (await ended(deps, slug)) await deps.files.forget(slug)
  return createInit(deps).init({ slug })
}

/**
 * Whether the configuration reads, and no component of it declares a mutation command; a
 * configuration that does not read is left to the init, which refuses it with its reason.
 * @param {StartMutationDeps} deps
 */
const declaresNone = async (deps) => {
  const loaded = await loadConfig(deps)
  return loaded.ok && !loaded.config.components.some(({ commands }) => commands.mutation)
}

/**
 * Whether the branch's run finished or was stopped; a journal that cannot be read is left to
 * the init, which refuses it.
 * @param {StartMutationDeps} deps @param {string} slug
 */
const ended = async (deps, slug) => {
  const opened = await openJournal(deps, slug)
  if (!opened.ok || opened.journal.events.length === 0) return false
  const run = deriveRun(opened.journal.events)
  return run.finished !== null || run.stopped !== null
}
