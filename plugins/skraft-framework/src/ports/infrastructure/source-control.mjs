// Port for the session repository's version control.
// Contract: headSha() => Promise<string | null>   null outside a repository
export const SOURCE_CONTROL_PORT = 'SourceControl'
