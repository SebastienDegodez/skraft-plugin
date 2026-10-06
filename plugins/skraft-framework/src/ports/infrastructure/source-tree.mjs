// Port for the source files of the session repository (the structural scan reads them).
// Contract:
//   listFiles()                 => Promise<string[]>       tracked and untracked-not-ignored files,
//                                                          repository-relative, '/'-separated
//   readSource(path, maxBytes)  => Promise<string | null>  null when absent, unreadable or larger
export const SOURCE_TREE_PORT = 'SourceTree'
