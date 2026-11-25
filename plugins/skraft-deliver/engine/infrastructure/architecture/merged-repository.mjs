import { isBriefPath } from '../../domain/architecture/brief.mjs'
import { isRef, SETUP_IGNORES } from '../../domain/config/skraft-config.mjs'

const QUIET = { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }
const failed = (reason) => ({ ok: false, code: 'architecture-repository-unavailable', reason })
const git = (runner, args) => runner.run({ argv: ['git', ...args], cwd: '.', env: QUIET, timeoutMs: 120_000 })
const succeeded = (answer) => answer.started && answer.exitCode === 0
const textOf = (answer) => succeeded(answer) ? answer.stdout.trim() : null
const lines = (text) => text.split(/\r?\n/).filter(Boolean)

export const createMergedRepository = ({ commandRunner, sourceControl, base = 'main' }) => Object.freeze({
  snapshot: () => snapshot(commandRunner, sourceControl, base),
  unmerged: (issue, baseSha) => unmerged(commandRunner, sourceControl, issue, baseSha),
  branch: (request) => startBranch(commandRunner, sourceControl, base, request),
})

const startBranch = async (runner, sourceControl, base, { name, existing }) => {
  if (!/^(?:design|deliver)\/(?:issue|epic)-\d+(?:-run-\d+)?$/.test(name)) return failed('The run branch name is invalid.')
  const current = await sourceControl.branch('.')
  if (current === name) return { ok: true }
  if (existing) return failed('Resume from the working branch of this run; its branch is not checked out.')
  if (!await clean(runner)) return failed('Tracked changes must be committed or set aside before starting a new run branch.')
  const merged = await snapshot(runner, sourceControl, base)
  if (!merged.ok) return merged
  const switched = await git(runner, ['switch', '-c', name, merged.sha])
  return succeeded(switched) ? { ok: true } : failed('Git refused to create the run branch from the merged base; preserve local changes and retry.')
}

const clean = async (runner) => succeeded(await git(runner, ['diff', '--quiet', '--', '.', ':(exclude).gitignore']))
  && succeeded(await git(runner, ['diff', '--cached', '--quiet']))
  && await onlyIgnoresLocalConfig(runner)

// Setup lists the developer's local configuration and the REPL's packages in .gitignore; those lines are not a change to set aside.
const onlyIgnoresLocalConfig = async (runner) => {
  const changed = textOf(await git(runner, ['diff', '--unified=0', '--no-color', '--', '.gitignore']))
  if (changed === null) return false
  const edits = lines(changed).filter((line) => /^[+-](?![+-]{2} )/.test(line))
  return edits.every((line) => SETUP_IGNORES.some((ignored) => line === `+${ignored}`))
}

const snapshot = async (runner, sourceControl, base) => {
  if (!isRef(base) || base.startsWith('refs/') || base.includes(':')) return failed('The configured architecture base is not a branch name.')
  const fetched = await git(runner, ['fetch', '--no-tags', '--no-recurse-submodules', 'origin', `refs/heads/${base}`])
  if (!succeeded(fetched)) return failed('The merged architecture base could not be fetched from origin.')
  const sha = textOf(await git(runner, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']))
  if (sha === null) return failed('The merged architecture base has no readable commit.')
  const paths = await sourceControl.filesAt('.', sha)
  return paths === null ? failed('The merged architecture base could not be listed.') : { ok: true, sha, paths, read: (path) => sourceControl.show('.', sha, path) }
}

const unmerged = async (runner, sourceControl, issue, baseSha) => {
  const local = await sourceControl.files('.')
  if (local === null) return failed('The working copy could not be checked for an unmerged architecture brief.')
  if (local.some((path) => isBriefPath(path, issue))) return { ok: true, found: true }
  const branches = textOf(await git(runner, ['ls-remote', '--heads', 'origin', 'refs/heads/design/*']))
  if (branches === null) return failed('Unmerged architecture branches could not be checked.')
  const localBranches = textOf(await git(runner, ['for-each-ref', '--format=%(objectname)', 'refs/heads/design/']))
  if (localBranches === null) return failed('Local architecture branches could not be checked.')
  const tips = [...new Set([...lines(branches).map((line) => line.split(/\s+/)[0]), ...lines(localBranches)])]
  if (tips.length > 100) return failed('More than 100 architecture branches need pruning before delivery can check freshness.')
  return findPending(runner, sourceControl, issue, tips, baseSha)
}

const findPending = async (runner, sourceControl, issue, tips, baseSha) => {
  for (const sha of tips) {
    if (!/^[a-f0-9]{40,64}$/.test(sha)) return failed('An architecture branch has an unreadable commit.')
    const paths = await pathsForTip(runner, sourceControl, sha)
    if (paths === null) return failed('An unmerged architecture branch could not be listed.')
    if (await sourceControl.isAncestor('.', sha, baseSha)) continue
    if (paths.some((path) => isBriefPath(path, issue))) return { ok: true, found: true }
  }
  return { ok: true, found: false }
}

const pathsForTip = async (runner, sourceControl, sha) => {
  const known = await sourceControl.filesAt('.', sha)
  if (known !== null) return known
  if (!succeeded(await git(runner, ['fetch', '--no-tags', '--no-recurse-submodules', 'origin', sha]))) return null
  return sourceControl.filesAt('.', sha)
}
