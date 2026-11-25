import { engineMessage } from '../../domain/pipeline/commits.mjs'

/**
 * The brief a delivery accepted, retired from its working branch before its pull request: once the
 * story is delivered no run reads it again, git keeps it, and the briefs on the merged base stay
 * those of the work still to deliver (#669). The documents it cites stay. Once only; a branch that
 * no longer holds it, or a removal Git refuses, publishes as it is.
 * @param {any} deps @param {{ slug: string, journal: any }} run
 */
export const retireBrief = async (deps, { slug, journal }) => {
  const accepted = journal.events.findLast((event) => event.type === 'architecture.accepted')
  if (accepted === undefined || journal.events.some((event) => event.type === 'architecture.retired')) return
  if ((await deps.workspace.read(accepted.path)) === null) return
  const story = journal.events[0].story?.issue ?? null
  const retired = await deps.sourceControl.retireFiles('.', [accepted.path], engineMessage(`docs(${slug}): retire the architecture brief this story delivers`, story))
  if (retired.ok) await journal.append('architecture.retired', { path: accepted.path })
}
