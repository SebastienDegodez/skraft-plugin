import { engineMessage, issueOf } from '../../domain/pipeline/commits.mjs'

/**
 * The commit the engine makes for an agent with no shell: what it changed in its scope, once its
 * step is done, one commit per repository, in the story's docs convention.
 *
 * @typedef {import('./step-checks.mjs').UncommittedFile} UncommittedFile
 * @typedef {{ subject: string, files: string[] }} EngineCommit files: relative to the working copy
 */

/**
 * Commits the files a done attempt of an agent with no shell left; null when there is nothing to
 * commit, a string when Git refused the commit.
 * @param {{ sourceControl: import('../ports/source-control.mjs').SourceControl }} deps
 * @param {{ slug: string, step: string, story: { issue?: number | null } | null }} run
 * @param {UncommittedFile[]} files
 * @returns {Promise<EngineCommit | null | string>}
 */
export const commitForAgent = async ({ sourceControl }, { slug, step, story }, files) => {
  if (files.length === 0) return null
  const subject = `docs(${slug}): ${step} ${slug}`
  for (const repository of new Set(files.map((file) => file.repository))) {
    const inside = files.filter((file) => file.repository === repository).map((file) => file.file)
    const commit = await sourceControl.commitFiles(repository, inside, engineMessage(subject, issueOf(story)))
    if (!commit.ok) return `Git refused to commit what ${step} wrote in ${repository}; check git status, then retry`
  }
  return { subject, files: files.map((file) => file.path) }
}
