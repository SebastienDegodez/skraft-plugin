// Port for reading a file of the session repository (docs/adr/decisions-index.md).
// Contract: read(path) => Promise<string | null>   null when absent
export const REPOSITORY_READER_PORT = 'RepositoryReader'
