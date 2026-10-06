// Port for the session repository's version control. Every method is fail-soft: an
// unknown revision, a git failure or a repository-less directory reads as null / empty.
// Contract:
//   headSha()             => Promise<string | null>
//   head()                => Promise<string | null>      same as headSha (evidence policy vocabulary)
//   parentOf(sha)         => Promise<string | null>
//   filesOf(sha)          => Promise<string[]>           files the commit touched
//   commit(sha)           => Promise<{ exists, subject?, message?, files? }>
//   range(base, rev)      => Promise<string[]>           rev-list base..rev, no merges
//   show(sha, path)       => Promise<string | null>      file content at a revision
//   listRecent(count)     => Promise<Array<{ sha, subject }>>   newest first
//   currentBranch()       => Promise<string | null>      short name; null when detached
//   remoteUrl()           => Promise<string | null>      URL of the `origin` remote
export const SOURCE_CONTROL_PORT = 'SourceControl'
