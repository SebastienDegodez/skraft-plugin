export const createSystemTime = () => ({
  now: () => new Date(),
  isoString: () => new Date().toISOString()
})
