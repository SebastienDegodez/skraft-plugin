import { failureSignatureInput, signatureOccurrences } from '../../domain/pipeline/failure-signature.mjs'

/**
 * A commit of the engine Git refused (a hook, a missing identity, a lock): what Git printed goes to
 * a log of the run, and the human is told where; the machine is the one to fix it.
 * @param {{ files: import('../ports/tracking-files.mjs').TrackingFiles, hasher: import('../ports/hasher.mjs').Hasher, journal: import('../journal/run-journal.mjs').OpenJournal }} deps
 * @param {{ slug: string, step: string }} at the run and the node whose commit it is
 * @param {{ error: string, output: string }} refusal
 * @returns {Promise<import('../../domain/pipeline/incidents.mjs').FailureIncident>}
 */
export const refusedCommit = async ({ files, hasher, journal }, { slug, step }, { error, output }) => {
  const path = `logs/commit-${step}.log`
  await files.write(slug, path, [`$ git commit (${step})`, `result: ${error}`, '--- output', output, ''].join('\n'))
  const signature = await hasher.sha256(failureSignatureInput({ step, cause: 'environment', proof: `${error}\n${output}`, root: repositoryRoot(files, slug), slug }))
  return { category: 'environment', owner: 'environment', argv: ['git', 'commit'], exitCode: null, attempts: signatureOccurrences(journal.events, signature) + 1, signature, log: files.location(slug, path) }
}

/** @param {import('../ports/tracking-files.mjs').TrackingFiles} files @param {string} slug */
const repositoryRoot = (files, slug) => {
  const path = files.location(slug, 'events.jsonl').replaceAll('\\', '/')
  const suffix = `/.copilot-tracking/skraft-plans/${slug}/events.jsonl`
  return path.endsWith(suffix) ? path.slice(0, -suffix.length) : ''
}
