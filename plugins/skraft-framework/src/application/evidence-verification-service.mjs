import { evidenceReferences, verifyEvidence } from '../domain/evidence-verification-policy.mjs'

// Resolves every file and Git fact a quality-gates evidence log points at, then judges
// it with the pure policy. Ports:
//   files.read(repoRelativePath) → string | throws
//   git — SourceControl (ports/infrastructure/source-control.mjs); sync or async
//   hasher — Hasher (ports/infrastructure/hasher.mjs)
// Used in process by RunPipeline (DELIVER) and by the qg-verify command (engineer, reviewer).
// `logPath` is repository-relative (…/skraft-plans/{slug}/evidence/{date}/{story}/qg-*.json);
// the log's references are relative to the project's tracking directory, the part of
// that path before /evidence/.
export const verifyEvidenceLog = async ({ logPath, base, files, git, hasher }) => {
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
      fileFacts.set(ref, { content, sha256: await hasher.sha256(content) })
    } catch { /* absent: the policy reports it */ }
  }

  const head = await git.head()
  const shas = new Set([log?.repo_root_rev, ...(Array.isArray(log?.commits_covered) ? log.commits_covered.map((c) => c?.sha) : [])])
  const commits = new Map()
  for (const sha of [...shas].filter(Boolean)) commits.set(sha, await git.commit(sha))
  const shows = new Map()
  for (const cycle of Array.isArray(log?.test_integrity?.cycles) ? log.test_integrity.cycles : []) {
    const testFile = cycle?.test_files?.[0]
    for (const commit of [cycle?.red_commit, cycle?.green_commit]) {
      const content = await git.show(commit, testFile)
      if (content !== null) shows.set(`${commit}:${testFile}`, content)
    }
  }

  return verifyEvidence(log, {
    files: fileFacts,
    evidenceDir: logPath.slice(0, logPath.lastIndexOf('/')),
    git: {
      head,
      headParent: await git.parentOf(head),
      headFiles: await git.filesOf(head),
      commits,
      range: base ? await git.range(base, log?.repo_root_rev) : undefined,
      shows,
    },
  })
}
