// Frozen clock for tests. Same time answer every call.
export const createFixedTime = (fixedDate = new Date('2026-01-01T00:00:00Z')) => ({
  now: () => new Date(fixedDate),
  isoString: () => new Date(fixedDate).toISOString()
})
