import { workItemReading } from '../../domain/pipeline/work-item.mjs'
import { NO_AZURE_REMOTE, QUIET, readJson, remoteOf, run, succeeded, unavailable } from './az-cli.mjs'

/**
 * The work items of Azure Boards through az, the Azure CLI with its azure-devops extension: the
 * story a run starts from. Every failure is a fixed reason: no output of az reaches the caller,
 * which the one stderr this reads (a work item that does not exist) never does either.
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/code-host.mjs').IssueReading} IssueReading
 * @typedef {import('./az-cli.mjs').Remote} Remote
 */

/**
 * The work item of that number, read as the story of the run. Failed without an az that reaches
 * the organization; missing when Azure DevOps says it has no such work item.
 * @param {CommandRunner} commandRunner @param {number} number @returns {Promise<IssueReading>}
 */
export const workItem = async (commandRunner, number) => {
  const unreachable = await unavailable(commandRunner)
  const remote = unreachable === null ? await remoteOf(commandRunner) : null
  if (unreachable !== null || remote === null) return failed(unreachable ?? NO_AZURE_REMOTE)
  const shown = await run(commandRunner, ['az', 'boards', 'work-item', 'show', `--id=${number}`, `--organization=${remote.organization}`, ...QUIET])
  if (!succeeded(shown)) return NO_SUCH_WORK_ITEM.test(shown.stderr) ? { read: 'missing' } : failed(`az could not read work item #${number} of ${remote.organization}`)
  return workItemReading({ number, ...remote }, readJson(shown.stdout)) ?? failed(`Azure DevOps answered work item #${number} in a form skraft cannot read`)
}

/**
 * What az prints for a work item that does not exist, or that its user may not read. This text is
 * read only to tell the two cases apart and is never passed on. Not measured: docs/v2/host-verification.md.
 */
const NO_SUCH_WORK_ITEM = /TF401232/

/** @param {string} reason @returns {IssueReading} */
const failed = (reason) => ({ read: 'failed', reason })
