import { deriveRun } from '../../domain/journal/run-state.mjs'
import { contextsOf } from '../../domain/architecture/layout.mjs'
import { contextQuestion, stopped, stopRun, waitingFor } from './context.mjs'

/**
 * Before its pull request, a design run looks at the other open design branches: one that changes
 * a context this run changes asks a person whether to go on, since two pull requests may each
 * merge without a conflict and still change what the other designed (#669).
 * @param {{ deps: any, slug: string, journal: any }} context
 */
export const concurrencyCheckpoint = async ({ deps, slug, journal }) => {
  const own = await ownContexts(deps, journal.events)
  if (own === null) return stopped(slug, 'architecture-repository-unavailable', 'Git cannot list what this design run changed.')
  const others = await deps.architectureRepository.concurrent({ own: await deps.sourceControl.branch('.') })
  if (!others.ok) return stopped(slug, others.code ?? 'architecture-repository-unavailable', others.reason)
  const overlaps = others.branches.flatMap(({ branch, paths }) => contextsOf(paths).filter((name) => own.includes(name)).map((name) => ({ branch, context: name })))
  return overlaps.length === 0 ? null : askToGoOn({ deps, slug, journal }, overlaps)
}

/** @param {any} deps @param {any[]} events @returns {Promise<string[] | null>} */
const ownContexts = async (deps, events) => {
  const base = deriveRun(events).base.find(({ component }) => component === null)
  const changed = base === undefined ? [] : await deps.sourceControl.changedFiles('.', base.sha)
  return changed === null ? null : contextsOf(changed)
}

/** @param {{ deps: any, slug: string, journal: any }} context @param {Array<{ branch: string, context: string }>} overlaps */
const askToGoOn = async ({ deps, slug, journal }, overlaps) => {
  const hash = await deps.hasher.sha256(JSON.stringify(overlaps))
  const lines = overlaps.map(({ branch, context }) => `${branch} also changes the context ${context}`).join('; ')
  const text = `Other open design branches change contexts this run changes: ${lines}. Continue and publish this design anyway, or stop and design again once they merge?`
  const question = await contextQuestion(journal, { key: `architecture-concurrent-${hash.slice(0, 12)}`, kind: 'architecture-concurrent', text, step: 'pr_writer' })
  if (!question.answer) return waitingFor(slug, question)
  return question.answer === 'STOP' ? stopRun({ slug, journal }, 'architecture-stopped', 'A human stopped architecture design.') : null
}
