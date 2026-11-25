import { createHash } from 'node:crypto'
import { evidenceReferences, frontendProbes, frontendSignals, integrityChanges, screenshotReferences, verifyEvidence } from '../domain/evidence-verification-policy.mjs'

const sha256 = (content) => createHash('sha256').update(content).digest('hex')

// Resolves every file and Git fact a quality-gates evidence log points at, then judges
// it with the pure policy. Ports:
//   files.read(repoRelativePath) → string | throws
//   git — see adapters/infrastructure/git-repository.mjs
// `logPath` is repository-relative (…/skraft-plans/{slug}/evidence/{date}/{story}/qg-*.json);
// the log's references are relative to the project's tracking directory, the part of
// that path before /evidence/.
// `redBase` is where DISTILL started: its `test` commits hold the RED acceptance tests a v7
// log's test.integrity guards (DISTILL commits them before the DELIVER base).
export const verifyEvidenceLog = async ({ logPath, base, redBase, files, git }) => {
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

  const v7 = log?.$schema === 'quality-gates-evidence/v7'
  const screenshots = new Map()
  for (const ref of v7 ? screenshotReferences(log) : []) {
    try {
      screenshots.set(ref, { sha256: sha256(await files.readBytes(resolve(ref))) })
    } catch { /* absent: the policy reports it */ }
  }

  const head = git.head()
  const evidenceDir = logPath.slice(0, logPath.lastIndexOf('/'))
  if (v7) return verifyEvidence(log, { files: fileFacts, screenshots, evidenceDir, ...v7Facts({ log, base, redBase, git, head, evidenceDir }) })

  const shas = new Set([log?.repo_root_rev, ...(Array.isArray(log?.commits_covered) ? log.commits_covered.map((c) => c?.sha) : [])])
  const commits = new Map([...shas].filter(Boolean).map((sha) => [sha, git.commit(sha)]))
  const shows = new Map()
  for (const cycle of Array.isArray(log?.test_integrity?.cycles) ? log.test_integrity.cycles : []) {
    // Older logs compare their first test file with its snapshots.
    const testFile = cycle?.test_files?.[0]
    for (const commit of [cycle?.red_commit, cycle?.green_commit]) {
      const content = git.show(commit, testFile)
      if (content !== null) shows.set(`${commit}:${testFile}`, content)
    }
  }

  return verifyEvidence(log, {
    files: fileFacts,
    screenshots,
    frontend: [],
    evidenceDir,
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

// v7: every Git fact comes from the DELIVER range itself, not from the log.
const v7Facts = ({ log, base, redBase, git, head, evidenceDir }) => {
  const rev = log?.repo_root_rev
  const range = base ? git.range(base, rev).reverse() : undefined
  const commits = new Map([rev, ...(range ?? [])].filter(Boolean).map((sha) => [sha, git.commit(sha)]))
  const listed = (shas) => shas.map((sha) => ({ sha, ...(commits.get(sha) ?? git.commit(sha)) })).filter((commit) => commit.exists)
  let integrity
  if (base && redBase) {
    const { guarded, changes } = integrityChanges(listed(git.range(redBase, base).reverse()), listed(range))
    integrity = {
      guarded,
      changes: changes.map(({ sha, file }) => ({ sha, file, before: git.show(git.parentOf(sha), file), after: git.show(sha, file) })),
    }
  }
  const touched = [...new Set(listed(range ?? []).flatMap((commit) => commit.files))]
  const atRev = new Map(frontendProbes(touched).map((path) => [path, git.show(rev, path)]))
  return {
    frontend: frontendSignals(touched, (path) => atRev.get(path) ?? undefined),
    git: {
      head,
      headParent: git.parentOf(head),
      headFiles: git.filesOf(head),
      trackedEvidence: evidenceDir ? git.tracked(evidenceDir) : [],
      commits,
      range,
      tree: git.treeOf(rev),
      shows: new Map(),
      integrity,
    },
  }
}
