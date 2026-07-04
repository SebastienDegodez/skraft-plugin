// Port for commit-check handlers. Given hash, say if commit is acceptable.
// Contract: verify() => Promise<{ clean: boolean, headSha: string|null }>
// `clean` is true only when the working tree has no uncommitted changes, i.e. the
// specialist's claimed work is actually committed to git — not just asserted (G5).
export const COMMIT_VERIFIER_PORT = 'CommitVerifier'
