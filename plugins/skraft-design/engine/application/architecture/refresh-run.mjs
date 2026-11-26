import { deriveRun } from '../../domain/journal/run-state.mjs'
import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'
import { COMPONENTS_FILE, designComponents } from './design-components.mjs'
import { contextQuestion, stopped, waitingFor } from './context.mjs'

/**
 * REFRESH: a design run that waits on a person while the default branch moved on takes it as it is
 * now, in the same run and journal. Its branch takes the default branch (a fast-forward while it
 * holds no commit of its own, a merge otherwise), its components are detected again, and the
 * design runs again from RESEARCH; a conflict asks the person to merge it themselves.
 */
export const REFRESH = 'REFRESH'

/** What the run's blocking questions add, so that a person knows REFRESH is an answer. */
export const REFRESH_OFFER = ' REFRESH takes the default branch as it is now, detects the components again and designs again from RESEARCH, in this run.'

/** A checkpoint that settled REFRESH: the run takes its next step again. */
const AGAIN = Object.freeze({ again: true })

/**
 * The run refreshed when a person's last answer is REFRESH and the run did not take it yet; null otherwise.
 * @param {{ deps: any, slug: string, journal: any }} context
 */
export const refreshCheckpoint = async (context) => {
  const asked = refreshAsked(context.journal.events)
  return asked === null ? null : refresh(context, asked)
}

/** @param {any[]} events */
const refreshAsked = (events) => {
  const answered = events.findLast(({ type }) => type === 'question.answered')
  if (String(answered?.answer ?? '').trim().toUpperCase() !== REFRESH) return null
  return events.some(({ type, key }) => type === 'run.refreshed' && key === answered.key) ? null : answered
}

/** @param {{ deps: any, slug: string, journal: any }} context @param {{ key: string }} answered */
const refresh = async ({ deps, slug, journal }, answered) => {
  const merged = await deps.architectureRepository.snapshot()
  if (!merged.ok) return stopped(slug, 'architecture-repository-unavailable', merged.reason)
  const run = deriveRun(journal.events)
  const taken = await deps.sourceControl.takeBase('.', merged.sha, engineMessage(`chore(${slug}): take the default branch as it is now`, issueOf(run.story)))
  if (!taken.ok) return conflicted({ slug, journal }, answered)
  await deps.files.write(slug, COMPONENTS_FILE, `${JSON.stringify(await designComponents(deps), null, 2)}\n`)
  await journal.append('run.refreshed', { key: answered.key, ...baseMove(run.base, merged.sha) })
  return AGAIN
}

/**
 * The root repository's move to the default branch as it is now, and the run's bases after it.
 * @param {Array<{ component: string | null, repository: string, sha: string }>} base @param {string} sha
 */
const baseMove = (base, sha) => {
  const root = base.find(({ component }) => component === null) ?? base[0]
  return { from: root.sha, to: sha, base: base.map((entry) => (entry.repository === root.repository ? { ...entry, sha } : entry)) }
}

/**
 * Git could not take the default branch into the run's branch: a person merges it, then answers.
 * @param {{ slug: string, journal: any }} run @param {{ key: string }} answered
 */
const conflicted = async ({ slug, journal }, answered) => {
  const step = journal.events.findLast(({ type, key }) => type === 'question.asked' && key === answered.key)?.step ?? 'design'
  const text = `REFRESH could not take the default branch into this run's branch: Git stopped on a conflict and undid the merge. Merge the default branch into the branch yourself, then answer REFRESH again, an instruction, or STOP.${REFRESH_OFFER}`
  const question = await contextQuestion(journal, { key: `${answered.key}-refresh`, kind: 'blocked', text, step })
  return waitingFor(slug, question)
}
