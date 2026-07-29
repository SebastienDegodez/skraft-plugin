import { scanCommitConvention } from '../domain/commit-convention.mjs'

// Application use case: reads the N most recent commits via the injected
// CommitLogReader port and flags any whose subject does not follow the
// `type(scope): subject` convention (G8), so a manual DELIVER closure can catch
// stray auto-commit-hook messages before they land in history unfixed.
export const createCommitScanService = ({ commitLogReader }) => ({
  scanRecent: async (count) => {
    const commits = await commitLogReader.listRecent(count)
    const scanned = scanCommitConvention(commits)
    return {
      total: scanned.length,
      nonConventional: scanned.filter((c) => !c.conventional).map(({ sha, subject }) => ({ sha, subject })),
    }
  }
})
