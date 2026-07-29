// Port for reading recent commit history. Given a max count, returns the N most
// recent commits (newest first) on the current branch.
// Contract: listRecent(count) => Promise<Array<{ sha: string, subject: string }>>
export const COMMIT_LOG_READER_PORT = 'CommitLogReader'
