/**
 * Where a run stands, read from its derived state: what Observe shows, and what the run
 * report and WORKFLOW.md say on their first line.
 *
 * @typedef {import('../journal/run-state.mjs').RunState} RunState
 * @typedef {'running' | 'waiting' | 'done' | 'blocked'} RunStatus
 * @typedef {{ key: string, kind: string, text: string, options: string[], refusals: string[], header: string }} WaitingQuestion
 *   header: the short label a dialog or a pane shows beside the question.
 */

/** @param {RunState} run @returns {RunStatus} */
export const statusOf = (run) => {
  if (run.finished) return run.finished.status === 'blocked' ? 'blocked' : 'done'
  if (waitingOn(run) !== null) return 'waiting'
  return run.stopped ? 'blocked' : 'running'
}

/** Why the run stands where it does: its end, the question it waits on, what stopped it; '' while it goes. @param {RunState} run */
export const reasonOf = (run) => run.finished?.reason ?? waitingOn(run)?.text ?? run.stopped?.reason ?? ''

/** The question the run waits on: asked, not answered yet. @param {RunState} run @returns {WaitingQuestion | null} */
export const waitingOn = (run) => {
  const asked = run.question
  if (asked === null || asked.answer !== null) return null
  return { key: asked.key, kind: asked.kind, text: asked.text, options: asked.options, refusals: asked.refusals, header: asked.header }
}

/**
 * A status as a story's description and its issue comment say it, per language: a French one is
 * only ever published running (the run's own publish), done or blocked (a run that ended).
 * @type {Record<import('./language.mjs').Language, Partial<Record<RunStatus, string>>>}
 */
const STATUS_WORDS = Object.freeze({
  en: Object.freeze({ running: 'running', waiting: 'waiting', done: 'done', blocked: 'blocked' }),
  fr: Object.freeze({ running: 'en cours', done: 'terminé', blocked: 'bloqué' }),
})

/** The run's status in a language. @param {RunState} run @param {import('./language.mjs').Language} language */
export const statusIn = (run, language) => STATUS_WORDS[language][statusOf(run)]

/**
 * The first line of a report: the status, then its reason when there is one; in the language
 * given, English unless a story's description asks another.
 * @param {RunState} run @param {import('./language.mjs').Language} [language]
 */
export const statusLine = (run, language = 'en') => {
  const reason = reasonOf(run)
  return reason === '' ? statusIn(run, language) : `${statusIn(run, language)}: ${reason}`
}
