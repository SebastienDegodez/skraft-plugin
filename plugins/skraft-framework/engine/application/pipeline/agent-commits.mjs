import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'
import { refusedCommit } from './refused-commits.mjs'

/**
 * The commit the engine makes for an agent with no shell: what it changed in its scope, once its
 * step is done, one commit per repository, in the story's docs convention.
 *
 * @typedef {import('./step-checks.mjs').UncommittedFile} UncommittedFile
 * @typedef {{ subject: string, files: string[] }} EngineCommit files: relative to the working copy
 */

/**
 * Commits the files a done attempt of an agent with no shell left; null when there is nothing to
 * commit, why and the incident when Git refused the commit.
 * @param {{ sourceControl: import('../ports/source-control.mjs').SourceControl, files: import('../ports/tracking-files.mjs').TrackingFiles, hasher: import('../ports/hasher.mjs').Hasher, journal: import('../journal/run-journal.mjs').OpenJournal }} deps
 * @param {{ slug: string, step: string, story: { issue?: number | null } | null }} run
 * @param {UncommittedFile[]} files
 * @returns {Promise<EngineCommit | null | Refused>}
 */
export const commitForAgent = async (deps, { slug, step, story }, files) => {
  if (files.length === 0) return null
  const subject = `docs(${slug}): ${step} ${slug}`
  for (const repository of new Set(files.map((file) => file.repository))) {
    const inside = files.filter((file) => file.repository === repository).map((file) => file.file)
    const commit = await deps.sourceControl.commitFiles(repository, inside, engineMessage(subject, issueOf(story)))
    if (!commit.ok) return commitRefused(deps, { slug, step, repository }, commit)
  }
  return { subject, files: files.map((file) => file.path) }
}

/** @param {Parameters<typeof commitForAgent>[0]} deps @param {{ slug: string, step: string, repository: string }} at @param {{ error: string, output: string }} refusal */
const commitRefused = async (deps, { slug, step, repository }, refusal) => {
  const incident = await refusedCommit(deps, { slug, step }, refusal)
  return { environment: `Git refused to commit what ${step} wrote in ${repository}; check git status, then retry`, incident, incidents: [incident] }
}

/** @typedef {{ environment: string, incident: import('../../domain/pipeline/incidents.mjs').FailureIncident, incidents: import('../../domain/pipeline/incidents.mjs').FailureIncident[] }} Refused */
