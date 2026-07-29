// Real clock adapter. Swap via port so app code never grabs Date directly.
export const createSystemTime = () => ({
  now: () => new Date(),
  isoString: () => new Date().toISOString()
})
