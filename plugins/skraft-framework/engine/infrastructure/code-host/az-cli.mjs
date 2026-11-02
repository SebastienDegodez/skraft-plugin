import { azureRemoteOf } from '../../domain/config/azure-remote.mjs'

/**
 * What az and git calls share: the command, its quiet options, the remote it acts on and the
 * JSON it prints. No Node API here.
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {{ name: string } & import('../../domain/config/azure-remote.mjs').AzureRemote} Remote
 *   name: the Git remote (origin when there is one); organization: its URL, as az's
 *   --organization takes it; project and repository: their names, decoded.
 */

/**
 * No program may wait for a human: git asks no password and ssh no passphrase; az installs no
 * extension on its own. The mod's runner cannot set the environment, so git is also told by its
 * own configuration, and az by --only-show-errors and stdin closed.
 */
const NO_PROMPT = Object.freeze({ GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no' })

/** The longest a git or az call may run, a push included. */
const CALL_TIMEOUT_MS = 120_000

/** @param {CommandRunner} commandRunner @param {string[]} argv */
// Stryker disable next-line StringLiteral: '' and '.' are both the working copy to the CommandRunner
export const run = (commandRunner, argv) => commandRunner.run({ argv, cwd: '.', env: NO_PROMPT, timeoutMs: CALL_TIMEOUT_MS })

/**
 * What every call to az ends with: JSON, errors only, no repository guessed from the working copy.
 * Every value goes as `--option=value`, so that one starting with `-` (a title) is never read as an option.
 */
export const QUIET = ['--detect=false', '--only-show-errors', '--output=json']

/** @param {CommandResult} result */
export const succeeded = (result) => result.started && result.exitCode === 0

/**
 * The remote pull requests go to: origin when there is one, else the first remote; null without
 * one whose URL names an Azure DevOps repository.
 * @param {CommandRunner} commandRunner @returns {Promise<Remote | null>}
 */
export const remoteOf = async (commandRunner) => {
  const names = lines((await run(commandRunner, ['git', 'remote'])).stdout)
  const name = names.includes('origin') ? 'origin' : names[0]
  if (name === undefined) return null
  const url = await run(commandRunner, ['git', 'remote', 'get-url', name])
  const parsed = succeeded(url) ? azureRemoteOf(url.stdout.trim()) : null
  return parsed === null ? null : { name, ...parsed }
}

/** @param {string} text */
export const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')

/** @param {string} text @returns {any} */
export const readJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** @param {string} reason */
export const refused = (reason) => ({ ok: /** @type {const} */ (false), reason })

/**
 * A failed write: unknown when az or git was stopped before it answered (its time limit, a cut),
 * since the write may have reached Azure DevOps; refused otherwise.
 * @param {CommandResult} result @param {string} reason
 */
export const failedWrite = (result, reason) => (result.started && result.exitCode === null ? { ...refused(reason), outcome: /** @type {const} */ ('unknown') } : refused(reason))

export const NO_AZURE_REMOTE = 'the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository'
export const NO_AZ = 'az, the Azure CLI, is not installed'
/** Why az does not start under Windows from anything but the installer's az.cmd (process/az-launch.mjs). */
export const AZ_NOT_FROM_INSTALLER = 'skraft runs az under Windows only from the Azure CLI installer (MSI or winget), which starts it without cmd.exe; install the Azure CLI that way'
export const NO_EXTENSION = 'the azure-devops extension of the Azure CLI is not installed; run az extension add --name azure-devops'

/** `az repos …` on the remote's organization, project and repository. @param {CommandRunner} commandRunner @param {Remote} remote @param {string[]} args */
export const repos = (commandRunner, remote, args) =>
  run(commandRunner, ['az', 'repos', ...args, `--organization=${remote.organization}`, `--project=${remote.project}`, `--repository=${remote.repository}`, ...QUIET])

/** Why no pull request can be opened from here; null when one can. @param {CommandRunner} commandRunner */
export const unavailable = async (commandRunner) => {
  const version = await run(commandRunner, ['az', '--version'])
  if (!version.started) return version.error === AZ_NOT_FROM_INSTALLER ? AZ_NOT_FROM_INSTALLER : NO_AZ
  const remote = await remoteOf(commandRunner)
  if (remote === null) return NO_AZURE_REMOTE
  if (!succeeded(await run(commandRunner, ['az', 'extension', 'show', '--name=azure-devops', '--only-show-errors', '--output=json']))) return NO_EXTENSION
  return succeeded(await repos(commandRunner, remote, ['show'])) ? null : notSignedIn(remote)
}

/** @param {Remote} remote */
export const notSignedIn = ({ organization, project, repository }) =>
  `az is not signed in to the Azure DevOps organization ${organization}, or cannot read ${project}/${repository} there; run az login, or az devops login --organization ${organization}`

