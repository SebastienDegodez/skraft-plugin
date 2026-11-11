/**
 * A commit of the engine Git refused (a hook, a missing identity, a lock): what Git printed goes to
 * a log of the run, and the human is told where; the machine is the one to fix it.
 * @param {{ files: import('../ports/tracking-files.mjs').TrackingFiles }} deps
 * @param {{ slug: string, step: string }} at the run and the node whose commit it is
 * @param {{ error: string, output: string }} refusal
 * @returns {Promise<import('../../domain/pipeline/incidents.mjs').Incident>}
 */
export const refusedCommit = async ({ files }, { slug, step }, { error, output }) => {
  const path = `logs/commit-${step}.log`
  await files.write(slug, path, [`$ git commit (${step})`, `result: ${error}`, '--- output', output, ''].join('\n'))
  return { owner: 'environment', log: files.location(slug, path) }
}
