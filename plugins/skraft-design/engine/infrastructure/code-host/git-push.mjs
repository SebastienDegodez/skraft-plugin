/**
 * The push of a branch and its read back, the same through gh and az: git alone, never forced,
 * never prompting. A push stopped before it answered (its time limit, a cut) is unknown, since it
 * may have reached the remote; `git ls-remote` then says where the remote's branch is. Every
 * failure is a fixed reason: no output of git reaches the caller. No Node API here.
 * @typedef {import('../../application/ports/command-runner.mjs').CommandRunner} CommandRunner
 * @typedef {import('../../application/ports/command-runner.mjs').CommandResult} CommandResult
 * @typedef {(argv: string[]) => Promise<CommandResult>} Run
 *   the forge adapter's own way to run git: its environment, its time limit.
 */

/**
 * The push, the local tip and the remote tip of a branch, on the remote a forge adapter picks.
 * @param {Run} run @param {() => Promise<{ name: string } | null>} locate the remote pull requests go to, null without one
 * @param {string} noRemote the forge's reason for a working copy without one
 * @returns {Pick<import('../../application/ports/code-host.mjs').CodeHost, 'push' | 'localTip' | 'remoteTip'>}
 */
export const branchOnRemote = (run, locate, noRemote) => ({
  push: (branch) => onRemote(locate, noRemote, (name) => pushBranch(run, name, branch)),
  localTip: (branch) => localTip(run, branch),
  remoteTip: (branch) => onRemote(locate, noRemote, (name) => remoteTip(run, name, branch)),
})

/**
 * What git does on the remote; refused without one.
 * @template T @param {() => Promise<{ name: string } | null>} locate @param {string} noRemote @param {(name: string) => Promise<T>} act
 */
const onRemote = async (locate, noRemote, act) => {
  const remote = await locate()
  return remote === null ? refused(noRemote) : act(remote.name)
}

/** git asks no password, ssh no passphrase: what the mod's runner cannot set in the environment. */
const QUIET_GIT = ['git', '-c', 'core.sshCommand=ssh -o BatchMode=yes', '-c', 'credential.interactive=never']

/** @param {CommandResult} result */
const succeeded = (result) => result.started && result.exitCode === 0

/** @param {string} reason */
const refused = (reason) => ({ ok: /** @type {const} */ (false), reason })

/**
 * The branch pushed to the same branch of that remote, never forced: a remote that moved refuses
 * it; one stopped before it answered is unknown.
 * @param {Run} run @param {string} name the remote @param {string} branch
 * @returns {Promise<import('../../application/ports/code-host.mjs').Done>}
 */
export const pushBranch = async (run, name, branch) => {
  const result = await run([...QUIET_GIT, 'push', '--porcelain', name, `refs/heads/${branch}:refs/heads/${branch}`])
  if (succeeded(result)) return { ok: true }
  if (result.started && result.exitCode === null) return { ...refused(`git push of ${branch} to ${name} got no answer`), outcome: 'unknown' }
  return refused(`git push of ${branch} to ${name} failed or was refused`)
}

/** The commit the branch points at in the working copy; null when it has none. @param {Run} run @param {string} branch */
export const localTip = async (run, branch) => {
  const result = await run(['git', 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`])
  return succeeded(result) ? result.stdout.trim() || null : null
}

/** A full sha as git prints one. */
const SHA = /^[0-9a-f]{40,64}$/

/**
 * The commit `git ls-remote` gives for the branch of that remote, read where a push goes (its
 * pushurl, else its url); null when it lists none.
 * @param {Run} run @param {string} name the remote @param {string} branch
 * @returns {Promise<{ ok: true, sha: string | null } | { ok: false, reason: string }>}
 */
export const remoteTip = async (run, name, branch) => {
  const url = await run(['git', 'remote', 'get-url', '--push', name])
  const listed = succeeded(url) ? await run([...QUIET_GIT, 'ls-remote', '--heads', url.stdout.trim(), `refs/heads/${branch}`]) : url
  if (!succeeded(listed)) return refused(`git ls-remote of ${branch} on ${name} failed`)
  const sha = shaOf(listed.stdout, branch)
  return sha === null || SHA.test(sha) ? { ok: true, sha } : refused(`git ls-remote of ${branch} on ${name} answered what skraft cannot read`)
}

/** The sha of the line that names the branch exactly; null when none does. @param {string} text @param {string} branch */
const shaOf = (text, branch) => text.split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .find(([, ref]) => ref === `refs/heads/${branch}`)?.[0] ?? null
