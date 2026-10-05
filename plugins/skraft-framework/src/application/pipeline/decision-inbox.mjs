// Human answers to pipeline checkpoints, kept as small files in the tracking directory
// (decisions/<key>.json) so an answer survives the session that asked: a Copilot run
// that paused at a checkpoint, or a Claude Code session that was closed, finds it on
// the next run. Written by `node src/cli/decide.mjs`, by the Copilot extension's
// skraft_decide tool, or by a host's own dialog. Pure: the files go through a port.

export const decisionPath = (key) => `decisions/${String(key).replace(/[^A-Za-z0-9._-]+/g, '_')}.json`

export const createDecisionInbox = ({ trackingFiles, slug, now = () => new Date().toISOString() }) => ({
  read: async (key) => {
    try {
      const parsed = JSON.parse(await trackingFiles.read(slug, decisionPath(key)))
      return typeof parsed?.answer === 'string' && parsed.answer.trim() ? parsed.answer : null
    } catch {
      return null
    }
  },
  write: async (key, answer, by = 'human') => {
    await trackingFiles.write(slug, decisionPath(key), JSON.stringify({ key, answer, by, at: now() }, null, 2))
  },
})
