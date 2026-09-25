// Port constant for the StateArchive outbound port (recovery reset).
// Duck-typed contract: { setAside(projectSlug: string): Promise<Result<string>> }
// Copies the current state.json to state.json.invalid.{ts} beside it and returns that
// name, so an invalid pipeline state survives the reset that replaces it.
export const STATE_ARCHIVE_PORT = 'StateArchive'
