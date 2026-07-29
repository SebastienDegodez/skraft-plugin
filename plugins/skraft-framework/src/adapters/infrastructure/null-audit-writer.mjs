// Null writer for tests or quiet mode. Call works, file never changes.
export const createNullAuditWriter = () => ({
  write: async (_entry) => {}
})
