// DecisionStore (ports/infrastructure/decision-store.mjs) kept as one small JSON file per
// checkpoint in the project's tracking directory: decisions/<key>.json. Built on any
// TrackingStore, so it serves every host. No Node API here.
export const decisionPath = (key) => `decisions/${String(key).replace(/[^A-Za-z0-9._-]+/g, '_')}.json`

export const createTrackingDecisionStore = ({ trackingStore, time }) => Object.freeze({
  read: async (slug, key) => {
    try {
      const parsed = JSON.parse(await trackingStore.read(slug, decisionPath(key)))
      return typeof parsed?.answer === 'string' && parsed.answer.trim() ? parsed.answer : null
    } catch {
      return null
    }
  },
  write: async (slug, key, answer, by = 'human') => {
    await trackingStore.write(slug, decisionPath(key), JSON.stringify({ key, answer, by, at: time.isoString() }, null, 2))
  },
})
