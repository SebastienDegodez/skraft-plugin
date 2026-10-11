import { createHash } from 'node:crypto'
import { evidenceReferences, verifyEvidence } from '../domain/evidence-verification-policy.mjs'

const sha256 = (content) => createHash('sha256').update(content).digest('hex')

// Resolves every file and Git fact a quality-gates evidence log points at, then judges
// it with the pure policy. Ports:
//   files.read(repoRelativePath) → string | throws
//   git — see adapters/infrastructure/git-repository.mjs
// `logPath` is repository-relative (…/skraft-plans/{slug}/evidence/{date}/{story}/qg-*.json);
// the log's references are relative to the project's tracking directory, the part of
// that path before /evidence/.
export const verifyEvidenceLog = async ({ logPath, base, files, git }) => {
  let text
  try { text = await files.read(logPath) } catch {
    return { verdict: 'inconclusive', findings: [{ severity: 'inconclusive', code: 'LOG_MISSING', detail: `${logPath} is not on disk` }] }
  }
  let log
  try { log = JSON.parse(text) } catch {
    return { verdict: 'inconclusive', findings: [{ severity: 'inconclusive', code: 'LOG_MALFORMED', detail: `${logPath} is not JSON` }] }
  }

  const boundary = logPath.lastIndexOf('/evidence/')
  const trackingDir = boundary >= 0 ? logPath.slice(0, boundary) : ''
  const resolve = (ref) => (trackingDir && ref.startsWith('evidence/') ? `${trackingDir}/${ref}` : ref)

  const fileFacts = new Map()
  for (const ref of evidenceReferences(log)) {
    try {
      const content = await files.read(resolve(ref))
      fileFacts.set(ref, { content, sha256: sha256(content) })
    } catch { /* absent: the policy reports it */ }
  }

  const head = git.head()
  const shas = new Set([log?.repo_root_rev, ...(Array.isArray(log?.commits_covered) ? log.commits_covered.map((c) => c?.sha) : [])])
  const commits = new Map([...shas].filter(Boolean).map((sha) => [sha, git.commit(sha)]))
  const shows = new Map()
  for (const cycle of Array.isArray(log?.test_integrity?.cycles) ? log.test_integrity.cycles : []) {
    const testFile = cycle?.test_files?.[0]
    for (const commit of [cycle?.red_commit, cycle?.green_commit]) {
      const content = git.show(commit, testFile)
      if (content !== null) shows.set(`${commit}:${testFile}`, content)
    }
  }

  return verifyEvidence(log, {
    files: fileFacts,
    evidenceDir: logPath.slice(0, logPath.lastIndexOf('/')),
    git: {
      head,
      headParent: git.parentOf(head),
      headFiles: git.filesOf(head),
      commits,
      range: base ? git.range(base, log?.repo_root_rev) : undefined,
      shows,
    },
  })
}
