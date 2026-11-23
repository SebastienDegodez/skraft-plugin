import { branchSlug } from '../../domain/pipeline/slug.mjs'

/**
 * The mutation line of doctor: which components declare a mutation command, then the last
 * mutation run of the branch HEAD is on and its verdict. A failed verdict is worth knowing,
 * never a failure: mutating is the developer's.
 *
 * @typedef {{ sourceControl: Pick<import('../ports/source-control.mjs').SourceControl, 'branch'>, mutationRun: { journal: import('../ports/run-journal-store.mjs').RunJournalStore } }} MutationCheckDeps
 * @typedef {{ scope: string, bar: number, score: number }} ScopeScore
 */

/**
 * @param {MutationCheckDeps} deps @param {import('../../domain/config/skraft-config.mjs').Component[]} components
 * @returns {Promise<import('./doctor-usecase.mjs').DoctorCheck>}
 */
export const mutationCheck = async (deps, components) => {
  const declaring = components.filter(({ commands }) => commands.mutation).map(({ name }) => name)
  if (declaring.length === 0) return { subject: 'mutation', status: 'ok', detail: 'no component declares a mutation command; /skraft-init mutation declares one per component' }
  const declared = `${declaring.join(', ')} ${declaring.length === 1 ? 'declares' : 'declare'} a mutation command`
  const last = await lastRun(deps)
  return { subject: 'mutation', status: last.failed ? 'warn' : 'ok', detail: `${declared}; ${last.text}` }
}

/**
 * The branch's last mutation run, told; failed when its last mutation gate failed.
 * @param {MutationCheckDeps} deps @returns {Promise<{ failed: boolean, text: string }>}
 */
const lastRun = async (deps) => {
  const branch = await deps.sourceControl.branch('.')
  if (branch === null) return { failed: false, text: 'HEAD is on no branch: no mutation run to show' }
  const events = eventsOf(await deps.mutationRun.journal.lines(branchSlug(branch)))
  if (events.length === 0) return { failed: false, text: `no mutation run on ${branch} yet: skraft mutation starts one` }
  const ran = events.findLast((event) => event.type === 'gate.ran' && event.gate === 'mutation')
  return { failed: ran?.status === 'fail', text: `last run on ${branch}: ${verdictText(ran)}, ${stateOf(events)}` }
}

/** The journal's events; a line that is no JSON is left out. @param {string[]} lines @returns {Array<Record<string, any>>} */
const eventsOf = (lines) => lines.flatMap((line) => {
  try {
    return [JSON.parse(line)]
  } catch {
    return []
  }
})

/** @param {Record<string, any> | undefined} ran the last mutation gate */
const verdictText = (ran) => {
  if (ran === undefined) return 'mutation not judged yet'
  const verdict = `mutation ${ran.status === 'pass' ? 'passed' : 'failed'}`
  return Array.isArray(ran.scores) ? `${verdict} (${ran.scores.map(scoreText).join(', ')})` : `${verdict} with no score`
}

/** @param {ScopeScore} score */
const scoreText = ({ scope, bar, score }) => `${scope} ${Math.floor(score)} %${score < bar ? ` < ${bar} %` : ''}`

/** Where the run stands, by its last event. @param {Array<Record<string, any>>} events */
const stateOf = (events) => ({ 'run.finished': 'ended', 'run.stopped': 'stopped' })[/** @type {string} */ (events.at(-1)?.type)] ?? 'going on'
